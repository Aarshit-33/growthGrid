import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { svgTwin } from "@/lib/brand";
import { isDatabaseConfigured } from "@/lib/db/mongoose";
import { findMediaFiles, type MediaFile } from "@/lib/media/gridfs";
import { isMediaInDatabase } from "@/lib/media/known";
import type { Settings } from "@/lib/schemas";
import { imageSize } from "@/lib/utils/image-size";

/* ─────────────────────────────────────────────────────────────
   Brand files as they ship (public/logo/…). The settings name a
   file; what the site uses is decided from /public at build time:
   • An SVG with the same name next to it wins (primary.svg beside
     primary.png), so a designer's vector file is a drop-in.
   • The size comes from the file itself, so a replacement with
     other proportions never shows stretched.
   • Every URL carries ?v= with a fingerprint of the bytes, so
     browsers (and the favicon cache) fetch a changed file again.
   A file that can't be read keeps the settings as they are: the
   site's usual fallbacks (and validate:content) take it from there.

   With CONTENT_SOURCE=mongo, a file missing from /public may be in
   the media database (uploaded in the Studio): the same rules apply,
   from its stored size and SHA-256, without downloading it.
   ───────────────────────────────────────────────────────────── */

const PUBLIC_DIR = join(process.cwd(), "public");

type Brand = NonNullable<Settings["brand"]>;
type BrandImage = NonNullable<Brand["logo"]["image"]>;

/** A site path's bytes from /public, or null: missing, unreadable or outside it. */
async function readPublic(path: string): Promise<Buffer | null> {
  const file = resolve(PUBLIC_DIR, `.${path}`);
  if (!file.startsWith(PUBLIC_DIR + sep)) return null;
  return readFile(file).catch(() => null);
}

/** What a brand file resolves to: its fingerprint and, when known, its size. */
type Found = { version: string; size: { width: number; height: number } | null };

const fromBytes = (bytes: Buffer): Found => ({
  version: createHash("sha256").update(bytes).digest("hex").slice(0, 10),
  size: imageSize(bytes),
});

const fromStored = ({ metadata }: MediaFile): Found => ({
  version: metadata.sha256.slice(0, 10),
  size: metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : null,
});

const sitePath = (image: BrandImage | null | undefined) => image?.src.split(/[?#]/, 1)[0] ?? "";

/** Twin first, then the file itself; /public before the database at each step. */
async function locate(path: string, stored: Map<string, MediaFile>): Promise<{ src: string; found: Found } | null> {
  for (const candidate of [svgTwin(path), path]) {
    if (!candidate) continue;
    const bytes = await readPublic(candidate);
    if (bytes) return { src: candidate, found: fromBytes(bytes) };
    const file = stored.get(candidate);
    if (file) return { src: candidate, found: fromStored(file) };
  }
  return null;
}

async function shipped(image: BrandImage, stored: Map<string, MediaFile>): Promise<BrandImage> {
  const path = sitePath(image);
  if (!path.startsWith("/")) return image;
  const located = await locate(path, stored);
  if (!located) return image;
  const { src, found } = located;
  return { ...image, ...found.size, src: `${src}?v=${found.version}` };
}

/**
 * Database copies of brand files that aren't in /public (mongo mode only): one
 * query for all of them. Empty when there's nothing to look up or the
 * database can't answer (the settings then stay as they are).
 */
async function storedBrandFiles(images: (BrandImage | null | undefined)[]): Promise<Map<string, MediaFile>> {
  if (!isMediaInDatabase() || !isDatabaseConfigured()) return new Map();
  const candidates = images
    .map(sitePath)
    .filter((path) => path.startsWith("/"))
    .flatMap((path) => [path, svgTwin(path)])
    .filter((path): path is string => Boolean(path));
  const missing: string[] = [];
  for (const path of new Set(candidates)) if (!(await readPublic(path))) missing.push(path);
  if (missing.length === 0) return new Map();
  try {
    return await findMediaFiles(missing);
  } catch (error) {
    console.warn("[brand] couldn't look up brand files in the media database:", error);
    return new Map();
  }
}

/** Settings with the brand images (logo, stacked logo, symbol, app icon) as they ship. */
export async function withBrandFiles(settings: Settings): Promise<Settings> {
  const { brand } = settings;
  if (!brand) return settings;
  const all = [brand.logo.image, brand.logo.mark, brand.logo.stacked, brand.app.icon];
  const stored = await storedBrandFiles(all);
  const ship = (image: BrandImage | null | undefined) => (image ? shipped(image, stored) : Promise.resolve(null));
  const [image, mark, stacked, icon] = await Promise.all(all.map(ship));
  return { ...settings, brand: { logo: { ...brand.logo, image, mark, stacked }, app: { ...brand.app, icon } } };
}
