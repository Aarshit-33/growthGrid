import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { svgTwin } from "@/lib/brand";
import { collectionNames, collectionRegistry } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import {
  findMediaFile,
  listMediaFiles,
  listTrashedMedia,
  MediaConflictError,
  mediaFolders,
  mediaPathTaken,
  putMediaFile,
  restoreMediaFile,
  trashMediaFile,
  type MediaFile,
} from "@/lib/media/gridfs";
import { isMediaInDatabase } from "@/lib/media/known";
import type { PageKey } from "@/lib/schemas";
import { slugify } from "@/lib/utils";
import { imageSize } from "@/lib/utils/image-size";
import { sniffImage } from "@/lib/utils/image-type";
import { getSession } from "./auth";
import { itemTitle } from "./lists";
import { AFTERCARE_META, COLLECTION_META, PAGE_META } from "./meta";
import { AdminError } from "./store";
import type { ImageUse, MediaItem, PublicImage } from "./types";

/* ─────────────────────────────────────────────────────────────
   The image library: every image file in /public, for the
   image picker and the Media screen. Files are served from the
   site root, so public/images/work/cover.jpg is
   "/images/work/cover.jpg". Moving images to cloud storage means
   changing only this file.

   • Uploads land in public/images/uploads (or another folder
     under public/images). The type comes from the file's bytes,
     never its name, and an existing file is never overwritten.
   • Only files under public/images can be deleted, and only when
     no content uses them. Deleting moves the file to
     .data/deleted-media, so it can always be put back by hand.

   With CONTENT_SOURCE=mongo (a read-only host such as Vercel) the
   files live in MongoDB GridFS instead (src/lib/media/gridfs.ts),
   under the same paths, and the site serves them at the same URLs
   (src/app/media/[...path]/route.ts):
   • The library is /public (what ships with the deployment) plus
     every file in the database; a /public file wins a tie.
   • Uploads go to the database. A path is never reused, even by
     a file in the trash, so a URL always means the same bytes.
   • Deleting moves the database copy to its trash (restore with
     `npm run media -- restore <path>`), and a /public copy to
     .data/deleted-media where the disk is writable.
   ───────────────────────────────────────────────────────────── */

/** Formats the site's image pipeline can serve. */
const IMAGE_TYPES = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

/** More than any site needs; keeps the picker's payload bounded. */
const MAX_IMAGES = 2000;

/** Where uploads go unless another folder under public/images is chosen. */
export const UPLOAD_FOLDER = "images/uploads";
/** Only content images live here; everything else in /public (icons…) belongs to the site's code. */
const CONTENT_FOLDER = "images";
/** Per file. Keep in step with serverActions.bodySizeLimit in next.config.ts. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SVG_BYTES = 1024 * 1024;

const publicDir = (root = process.cwd()) => join(root, "public");
const DELETED_DIR = join(process.cwd(), ".data", "deleted-media");

/** Content images (public/images/…) first, then other folders; by folder, then name. */
function compare(a: PublicImage, b: PublicImage): number {
  const rank = (image: PublicImage) => (image.folder === "images" || image.folder.startsWith("images/") ? 0 : 1);
  return (
    rank(a) - rank(b) ||
    a.folder.localeCompare(b.folder) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

/** A database file as the picker lists it. */
const fromMediaFile = ({ metadata, length, uploadDate }: MediaFile): PublicImage => ({
  src: metadata.path,
  folder: metadata.folder,
  name: metadata.name,
  bytes: length,
  modified: uploadDate.getTime(),
});

/** Every image: /public, plus the media database with CONTENT_SOURCE=mongo. */
export async function listPublicImages(root = process.cwd()): Promise<PublicImage[]> {
  const shipped = await listShippedImages(root);
  if (!isMediaInDatabase()) return shipped.sort(compare).slice(0, MAX_IMAGES);
  // A /public file is what the site serves at that path, so it wins a tie.
  const seen = new Set(shipped.map((image) => image.src));
  const stored = (await listMediaFiles()).filter((file) => !seen.has(file.metadata.path)).map(fromMediaFile);
  return [...shipped, ...stored].sort(compare).slice(0, MAX_IMAGES);
}

/** Every image file in /public. */
async function listShippedImages(root: string): Promise<PublicImage[]> {
  const base = publicDir(root);
  let entries;
  try {
    entries = await readdir(base, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const found = await Promise.all(
    entries.map(async (entry): Promise<PublicImage | null> => {
      if (!entry.isFile() || !IMAGE_TYPES.has(extname(entry.name).toLowerCase())) return null;
      const file = join(entry.parentPath, entry.name);
      const parts = relative(base, file).split(sep);
      // Hidden files and folders (.well-known, ._cover.jpg…) aren't content.
      if (parts.some((part) => part.startsWith("."))) return null;
      // Deleted between the listing and now: skip it.
      const info = await stat(file).catch(() => null);
      if (!info) return null;
      return {
        src: `/${parts.join("/")}`,
        folder: parts.slice(0, -1).join("/"),
        name: entry.name,
        bytes: info.size,
        modified: Math.round(info.mtimeMs),
      };
    }),
  );

  return found.filter((image): image is PublicImage => image !== null);
}

/** Folders an upload can go to: public/images and every folder inside it (plus the uploads folder). */
export async function uploadFolders(root = process.cwd()): Promise<string[]> {
  const base = join(publicDir(root), CONTENT_FOLDER);
  const entries = await readdir(base, { recursive: true, withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => relative(publicDir(root), join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((folder) => !folder.split("/").some((part) => part.startsWith(".")));
  // Folders that exist only in the media database count too.
  if (isMediaInDatabase()) folders.push(...(await mediaFolders()).filter(isContentFolder));
  return [...new Set([UPLOAD_FOLDER, CONTENT_FOLDER, ...folders])].sort((a, b) =>
    a === UPLOAD_FOLDER ? -1 : b === UPLOAD_FOLDER ? 1 : a.localeCompare(b),
  );
}

/* ── Upload ───────────────────────────────────────────────── */

/**
 * SVGs are code: one opened from the site's own address could run scripts there.
 * Anything that can execute, embed a page or pull in entities is refused.
 */
const SVG_DANGER = /<script|<foreignObject|<iframe|<embed|<object|<handler|<!ENTITY|\son[a-z]+\s*=|javascript:|data:text\/html/i;

/** "images/uploads" → checked, inside public/images, no tricks. */
function checkFolder(folder: string): string {
  const clean = folder.trim().replace(/^\/+|\/+$/g, "");
  const ok =
    /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/i.test(clean) &&
    (clean === CONTENT_FOLDER || clean.startsWith(`${CONTENT_FOLDER}/`)) &&
    !clean.split("/").some((part) => part === ".." || part.startsWith("."));
  if (!ok) throw new AdminError("Uploads go into public/images or a folder inside it.");
  return clean;
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

const isContentFolder = (folder: string) => folder === CONTENT_FOLDER || folder.startsWith(`${CONTENT_FOLDER}/`);

/** Who's signed in, for the database's uploadedBy / deletedBy (null outside a request). */
async function signedInName(): Promise<string | null> {
  try {
    const session = await getSession();
    return session ? session.user.email || session.user.name : null;
  } catch {
    return null;
  }
}

/**
 * Saves an uploaded image and returns it as the picker lists it: into /public,
 * or into the media database with CONTENT_SOURCE=mongo.
 */
export async function saveUpload(file: File, folder = UPLOAD_FOLDER, uploadedBy?: string): Promise<PublicImage> {
  if (file.size === 0) throw new AdminError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AdminError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB: export a smaller version.`);
  }
  const target = checkFolder(folder);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new AdminError("That isn't an image the site can show. Use PNG, JPG, WebP, AVIF, GIF or SVG.");
  if (kind.ext === "svg") {
    if (bytes.length > MAX_SVG_BYTES) throw new AdminError("SVGs are limited to 1 MB. Simplify or optimise it first.");
    if (SVG_DANGER.test(new TextDecoder().decode(bytes))) {
      throw new AdminError("This SVG contains scripts or embedded content, which the site doesn't allow. Export it again as a plain SVG (or a PNG).");
    }
  }

  if (isMediaInDatabase()) return saveToDatabase(target, file.name, bytes, kind, uploadedBy ?? (await signedInName()));

  const dir = join(publicDir(), ...target.split("/"));
  // Only the uploads folder is created on demand; others must exist.
  if (target === UPLOAD_FOLDER) await mkdir(dir, { recursive: true });
  else if (!(await exists(dir))) throw new AdminError(`The folder public/${target} doesn't exist.`);

  const stem = slugify(file.name.replace(/\.[^.]*$/, "")).slice(0, 60) || "image";
  let name = `${stem}.${kind.ext}`;
  for (let n = 2; await exists(join(dir, name)); n++) name = `${stem}-${n}.${kind.ext}`;

  const destination = join(dir, name);
  const temp = join(dir, `.${name}.${randomUUID().slice(0, 8)}.tmp`);
  try {
    await writeFile(temp, bytes);
    await rename(temp, destination);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new AdminError("This server can't write to /public (read-only file system). Upload images while running the studio locally with `npm run dev`.");
    }
    throw error;
  }
  const info = await stat(destination);
  return { src: `/${target}/${name}`, folder: target, name, bytes: info.size, modified: Math.round(info.mtimeMs) };
}

/** The database side of saveUpload: same naming rules, and a name is free only if neither /public nor the database (trash included) has it. */
async function saveToDatabase(
  target: string,
  originalName: string,
  bytes: Uint8Array,
  kind: NonNullable<ReturnType<typeof sniffImage>>,
  uploadedBy: string | null,
): Promise<PublicImage> {
  const dir = join(publicDir(), ...target.split("/"));
  if (target !== UPLOAD_FOLDER && !(await exists(dir)) && !(await mediaFolders()).includes(target)) {
    throw new AdminError(`The folder public/${target} doesn't exist.`);
  }
  const stem = slugify(originalName.replace(/\.[^.]*$/, "")).slice(0, 60) || "image";
  const size = imageSize(bytes);
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${stem}.${kind.ext}` : `${stem}-${n}.${kind.ext}`;
    const path = `/${target}/${name}`;
    if ((await exists(join(dir, name))) || (await mediaPathTaken(path))) continue;
    try {
      const saved = await putMediaFile({
        path,
        bytes,
        contentType: kind.mime,
        width: size?.width ?? null,
        height: size?.height ?? null,
        uploadedBy,
        source: "studio",
      });
      return fromMediaFile(saved);
    } catch (error) {
      // Another upload took this name a moment ago: try the next one.
      if (error instanceof MediaConflictError) continue;
      throw error;
    }
  }
  throw new AdminError("Couldn't find a free file name for this upload. Rename the file and try again.");
}

/* ── Usage ────────────────────────────────────────────────── */

const IMAGE_PATH = /^\/[^?#]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
/** An image path inside longer text: Markdown like ![Chart](/images/insights/chart.png). */
const INLINE_IMAGE_PATH = /(?<![\w/.-])\/[\w./%@+-]+\.(?:avif|gif|jpe?g|png|svg|webp)(?!\w)/gi;

/** "/images/a%20b.png" → "/images/a b.png" (as files are listed); malformed escapes stay as they are. */
function decodePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/** Every image path inside a value, with where it sits ("brand.logo.src"). */
function collectPaths(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") {
    if (IMAGE_PATH.test(value)) out.push([value, path]);
    else if (value.includes("/")) for (const [match] of value.matchAll(INLINE_IMAGE_PATH)) out.push([decodePath(match), path]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectPaths(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) collectPaths(v, path ? `${path}.${key}` : key, out);
  }
  return out;
}

/** Where each image is used in the content: src → the screens that use it. */
export function imageUsage(snapshot: ContentSnapshot): Map<string, ImageUse[]> {
  const uses = new Map<string, ImageUse[]>();
  const add = (src: string, use: ImageUse) => {
    const list = uses.get(src) ?? [];
    if (!list.some((other) => other.href === use.href && other.label === use.label)) list.push(use);
    uses.set(src, list);
  };

  for (const [src, path] of collectPaths(snapshot.settings, "", [])) {
    if (!path.startsWith("brand.")) {
      add(src, { label: "Site settings", href: "/settings" });
      continue;
    }
    const use = path.startsWith("brand.app.")
      ? { label: "Branding › Favicon & app icon", href: "/branding" }
      : { label: "Branding › Logo", href: "/branding" };
    add(src, use);
    // An SVG with the same name takes over on the site (src/lib/brand-files.ts): it's in use too.
    const twin = svgTwin(src);
    if (twin) add(twin, use);
  }

  for (const [key, page] of Object.entries(snapshot.pages) as [PageKey, unknown][]) {
    for (const [src, path] of collectPaths(page, "", [])) {
      const aftercare = key === AFTERCARE_META.page && path.startsWith(`${AFTERCARE_META.field}.`);
      add(src, aftercare ? { label: AFTERCARE_META.label, href: AFTERCARE_META.path } : { label: `Pages › ${PAGE_META[key].label}`, href: `/pages/${key}` });
    }
  }

  for (const name of collectionNames) {
    const items = Array.isArray(snapshot.collections[name]) ? (snapshot.collections[name] as Record<string, unknown>[]) : [];
    const { key } = collectionRegistry[name];
    for (const item of items) {
      for (const [src] of collectPaths(item, "", [])) {
        add(src, {
          label: `${COLLECTION_META[name].label} › ${itemTitle(name, item)}`,
          href: `/collections/${name}/${encodeURIComponent(String(item[key]))}`,
        });
      }
    }
  }
  return uses;
}

/** Under public/images (content), not the rest of /public (the site's own icons and files). */
const isContentImage = (src: string) => src.startsWith(`/${CONTENT_FOLDER}/`);

/** The Media screen: every image, where the content uses it, and whether it can be deleted. */
export async function listMedia(snapshot: ContentSnapshot): Promise<MediaItem[]> {
  const images = await listPublicImages();
  const uses = imageUsage(snapshot);
  return images.map((image) => ({ ...image, uses: uses.get(image.src) ?? [], deletable: isContentImage(image.src) }));
}

/* ── Delete ───────────────────────────────────────────────── */

/** The file behind a /public path, when it's a deletable content image. */
function deletablePath(src: string): string {
  const parts = src.replace(/^\/+/, "").split("/");
  const ok =
    src.startsWith("/") &&
    parts[0] === CONTENT_FOLDER &&
    parts.length > 1 &&
    IMAGE_TYPES.has(extname(src).toLowerCase()) &&
    !parts.some((part) => part === "" || part === ".." || part.startsWith("."));
  const file = resolve(publicDir(), ...parts);
  if (!ok || !file.startsWith(join(publicDir(), CONTENT_FOLDER) + sep)) {
    throw new AdminError("Only images in public/images can be deleted from the studio. The rest of /public belongs to the site's code.");
  }
  return file;
}

/**
 * Takes an unused image off the site: the file moves to .data/deleted-media
 * (named with the time and its old path), so it can be put back by hand.
 * Returns where it went.
 */
export async function deletePublicImage(src: string, snapshot: ContentSnapshot, deletedBy?: string): Promise<string> {
  const file = deletablePath(src);
  const used = imageUsage(snapshot).get(src);
  if (used?.length) {
    throw new AdminError(`This image is still used by ${used.map((use) => use.label).join(", ")}. Pick another image there first.`);
  }
  if (isMediaInDatabase()) return deleteFromDatabase(src, file, deletedBy ?? (await signedInName()));
  if (!(await exists(file))) throw new AdminError("That image no longer exists. It may have been moved or deleted already.", { conflict: true });
  return parkPublicFile(src, file);
}

/** Moves a /public file to .data/deleted-media; returns where it went. */
async function parkPublicFile(src: string, file: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parked = join(DELETED_DIR, `${stamp}__${src.replace(/^\/+/, "").replace(/\//g, "__")}`);
  try {
    // Inside the try: on a read-only disk (Vercel) the mkdir is what fails first.
    await mkdir(DELETED_DIR, { recursive: true });
    await rename(file, parked);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") throw new AdminError("This server can't change files in /public (read-only file system).");
    throw error;
  }
  return relative(process.cwd(), parked);
}

/* ── Media database: delete, trash, restore ───────────────── */

const trashLabel = (src: string) => `the media trash in MongoDB (restore with: npm run media -- restore ${src})`;

/**
 * The database side of deletePublicImage. A /public copy goes first (to
 * .data/deleted-media), so a read-only deployment refuses before anything
 * changes: that file ships with the site's code and stays on the site.
 */
async function deleteFromDatabase(src: string, file: string, deletedBy: string | null): Promise<string> {
  const shipped = await exists(file);
  const stored = await findMediaFile(src);
  if (!shipped && !stored) throw new AdminError("That image no longer exists. It may have been moved or deleted already.", { conflict: true });

  let parked: string | null = null;
  if (shipped) {
    try {
      parked = await parkPublicFile(src, file);
    } catch (error) {
      if (error instanceof AdminError) {
        throw new AdminError(
          `This image ships with the site's code (public${src}), so this server can't take it off the site. Remove it from the repository and redeploy${stored ? " (its database copy was kept)" : ""}.`,
        );
      }
      throw error;
    }
  }
  if (stored) await trashMediaFile(src, deletedBy);
  if (parked && stored) return `${parked} and ${trashLabel(src)}`;
  return parked ?? trashLabel(src);
}

/** An image in the media database's trash. */
export interface DeletedImage extends PublicImage {
  deletedAt: number | null;
  deletedBy: string | null;
}

/** The media database's trash, most recently deleted first (empty in JSON mode). */
export async function listDeletedImages(): Promise<DeletedImage[]> {
  if (!isMediaInDatabase()) return [];
  return (await listTrashedMedia()).map((file) => ({
    ...fromMediaFile(file),
    deletedAt: file.metadata.deletedAt ? new Date(file.metadata.deletedAt).getTime() : null,
    deletedBy: file.metadata.deletedBy ?? null,
  }));
}

/** Puts the most recently deleted copy of `src` back on the site (media database only). */
export async function restoreDeletedImage(src: string): Promise<PublicImage> {
  if (!isMediaInDatabase()) {
    throw new AdminError("Deleted images are kept in .data/deleted-media: move the file back into /public by hand.");
  }
  try {
    const restored = await restoreMediaFile({ path: src });
    if (!restored) throw new AdminError("That image isn't in the trash.", { conflict: true });
    return fromMediaFile(restored);
  } catch (error) {
    if (error instanceof MediaConflictError) throw new AdminError(`Another image is at ${src} now. Delete that one first.`, { conflict: true });
    throw error;
  }
}
