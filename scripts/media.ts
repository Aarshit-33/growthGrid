/**
 * Images in the media database (MongoDB GridFS), used when CONTENT_SOURCE=mongo.
 * See src/lib/media/gridfs.ts.
 *
 *   npm run media:upload                    # copy every image under public/images into the
 *                                           # database (same paths). Safe to re-run: unchanged
 *                                           # files are skipped, changed ones reported.
 *   npm run media -- upload --dry-run       # no database: list what would be uploaded
 *   npm run media -- upload --force         # …and replace database copies whose bytes changed
 *                                           # (the old copy goes to the trash)
 *   npm run media -- list                   # files in the database
 *   npm run media -- trash                  # deleted files (Studio › Media › Delete)
 *   npm run media -- trash /images/x.png    # move a file to the trash (it stops being served)
 *   npm run media -- restore /images/x.png  # put a deleted file back on the site
 *   npm run media -- purge --older-than=30 --yes
 *                                           # delete trashed files for good (frees space)
 *
 * Requires MONGODB_URI (and optionally MONGODB_DB) in .env.local / .env.
 * Files in /public always win over database copies on the site, so uploading
 * changes nothing visible; it makes the library complete in the database
 * (e.g. so images can later leave the repository).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { rawCollections, rawPages, rawSettings } from "../src/lib/content/raw";
import { disconnectFromDatabase, isDatabaseConfigured } from "../src/lib/db/mongoose";
import {
  findMediaFile,
  listMediaFiles,
  listTrashedMedia,
  MediaConflictError,
  purgeMediaFile,
  putMediaFile,
  restoreMediaFile,
  sha256,
  trashMediaFile,
} from "../src/lib/media/gridfs";
import { imageSize } from "../src/lib/utils/image-size";
import { sniffImage } from "../src/lib/utils/image-type";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* optional */
  }
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const [command = "upload", ...rest] = argv.filter((arg) => !arg.startsWith("--"));
const dryRun = flags.has("--dry-run") || flags.has("--check");
const force = flags.has("--force");
const flagValue = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=", 2)[1];

const PUBLIC_DIR = join(process.cwd(), "public");
/** Only this folder is served from the database (see next.config.ts rewrites). */
const ROOT = "images";
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
/** Vercel functions return at most 4.5 MB; bigger files only stream in ranges. */
const LARGE_BYTES = 4 * 1024 * 1024;
const BY = "npm run media";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Every image file under public/images, as site paths. */
async function shippedImages(): Promise<string[]> {
  const base = join(PUBLIC_DIR, ROOT);
  const entries = await readdir(base, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && IMAGE_FILE.test(entry.name))
    .map((entry) => `/${relative(PUBLIC_DIR, join(entry.parentPath, entry.name)).split(sep).join("/")}`)
    .filter((path) => !path.split("/").some((part) => part.startsWith(".")))
    .sort();
}

/** Image paths the JSON content names (for a heads-up about ones outside public/images). */
function referencedImages(): Set<string> {
  const text = JSON.stringify({ rawSettings, rawPages, rawCollections });
  return new Set([...text.matchAll(/"(\/[^"?#]+\.(?:avif|gif|jpe?g|png|svg|webp))(?:[?#][^"]*)?"/gi)].map((m) => m[1]));
}

async function upload() {
  const paths = await shippedImages();
  const outside = [...referencedImages()].filter((path) => !path.startsWith(`/${ROOT}/`));
  console.log(`${paths.length} image(s) under public/${ROOT}${dryRun ? " (dry run: no database)" : ""}.`);
  if (outside.length) {
    console.log(`  ${outside.length} referenced image(s) outside public/${ROOT} stay with the code (not uploaded): ${outside.join(", ")}`);
  }

  const counts = { uploaded: 0, "would upload": 0, replaced: 0, unchanged: 0, changed: 0, skipped: 0, failed: 0 };
  for (const path of paths) {
    try {
      const bytes = await readFile(join(PUBLIC_DIR, ...path.split("/")));
      const kind = sniffImage(bytes);
      if (!kind) {
        counts.skipped++;
        console.warn(`  ! ${path}: not an image (by its bytes), skipped`);
        continue;
      }
      if (bytes.length > LARGE_BYTES) console.warn(`  ! ${path}: ${mb(bytes.length)}, over Vercel's 4.5 MB response limit (served in ranges)`);
      if (dryRun) {
        counts["would upload"]++;
        console.log(`  + ${path} (${mb(bytes.length)}, ${kind.mime})`);
        continue;
      }

      const existing = await findMediaFile(path);
      const hash = sha256(bytes);
      if (existing && existing.metadata.sha256 === hash) {
        counts.unchanged++;
        continue;
      }
      if (existing && !force) {
        counts.changed++;
        console.warn(`  ~ ${path}: the database copy differs (re-run with --force to replace it)`);
        continue;
      }

      const size = imageSize(bytes);
      const file = {
        path,
        bytes,
        contentType: kind.mime,
        width: size?.width ?? null,
        height: size?.height ?? null,
        uploadedBy: BY,
        source: "public-sync" as const,
      };
      if (existing) {
        // One live file per path: trash the old copy, then store the new one (or put the old one back).
        await trashMediaFile(path, BY);
        try {
          await putMediaFile(file);
        } catch (error) {
          await restoreMediaFile({ id: existing.id }).catch(() => undefined);
          throw error;
        }
        counts.replaced++;
        console.log(`  ↻ ${path}`);
      } else {
        await putMediaFile(file);
        counts.uploaded++;
        console.log(`  + ${path}`);
      }
    } catch (error) {
      counts.failed++;
      const reason = error instanceof MediaConflictError ? "uploaded by someone else meanwhile" : error instanceof Error ? error.message : error;
      console.error(`  ✗ ${path}: ${reason}`);
    }
  }
  const summary = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}`)
    .join(", ");
  console.log(`Done: ${summary || "nothing to do"}.`);
  if (counts.failed) process.exitCode = 1;
}

async function list() {
  const files = await listMediaFiles();
  for (const file of files) {
    const { path, contentType, width, height, uploadedBy } = file.metadata;
    console.log(`${path}  ${mb(file.length)}  ${contentType}${width ? `  ${width}×${height}` : ""}  ${file.uploadDate.toISOString()}${uploadedBy ? `  by ${uploadedBy}` : ""}`);
  }
  const total = files.reduce((sum, file) => sum + file.length, 0);
  console.log(`${files.length} file(s), ${mb(total)}.`);
}

async function trash() {
  const path = rest[0];
  if (path) {
    if (!path.startsWith("/")) throw new Error("Usage: npm run media -- trash /images/path/to/file.png");
    const trashed = await trashMediaFile(path, BY);
    console.log(trashed ? `Moved ${path} to the trash (restore with: npm run media -- restore ${path}).` : `${path} isn't in the media database.`);
    if (!trashed) process.exitCode = 1;
    return;
  }
  const files = await listTrashedMedia();
  for (const file of files) {
    const { path, deletedAt, deletedBy } = file.metadata;
    console.log(`${path}  ${mb(file.length)}  deleted ${deletedAt ? new Date(deletedAt).toISOString() : "?"}${deletedBy ? ` by ${deletedBy}` : ""}  id ${file.id.toHexString()}`);
  }
  console.log(`${files.length} file(s) in the trash, ${mb(files.reduce((sum, file) => sum + file.length, 0))}.`);
}

async function restore() {
  const path = rest[0];
  if (!path?.startsWith("/")) throw new Error("Usage: npm run media -- restore /images/path/to/file.png");
  try {
    const restored = await restoreMediaFile({ path });
    console.log(restored ? `Restored ${path}.` : `${path} isn't in the trash.`);
    if (!restored) process.exitCode = 1;
  } catch (error) {
    if (error instanceof MediaConflictError) throw new Error(`Another file is live at ${path}: delete it in the Studio first.`);
    throw error;
  }
}

async function purge() {
  const days = Number(flagValue("--older-than") ?? 30);
  if (!Number.isFinite(days) || days < 0) throw new Error("--older-than=<days> must be a number of days.");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const due = (await listTrashedMedia()).filter((file) => file.metadata.deletedAt && new Date(file.metadata.deletedAt).getTime() < cutoff);
  console.log(`${due.length} trashed file(s) deleted more than ${days} day(s) ago, ${mb(due.reduce((sum, file) => sum + file.length, 0))}.`);
  if (!flags.has("--yes") || dryRun) {
    due.forEach((file) => console.log(`  ${file.metadata.path}`));
    console.log("Nothing deleted. Add --yes to delete them for good.");
    return;
  }
  for (const file of due) {
    await purgeMediaFile(file.id);
    console.log(`  − ${file.metadata.path}`);
  }
}

const commands: Record<string, () => Promise<void>> = { upload, list, trash, restore, purge };

async function main() {
  if (flags.has("--help") || flags.has("-h") || argv.includes("-h") || command === "help") {
    // The usage is the comment at the top of this file.
    const source = await readFile(join(process.cwd(), "scripts", "media.ts"), "utf8");
    console.log(source.slice(source.indexOf("/**") + 3, source.indexOf("*/")).replace(/^ \* ?/gm, "").trim());
    return;
  }
  const run = commands[command];
  if (!run) throw new Error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(", ")}.`);
  if (!(command === "upload" && dryRun) && !isDatabaseConfigured()) {
    throw new Error("MONGODB_URI is not set (.env.local / .env). Use `upload --dry-run` to check without a database.");
  }
  await run();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectFromDatabase());
