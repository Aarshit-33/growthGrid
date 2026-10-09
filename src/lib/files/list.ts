import "server-only";
import { open, readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { kindOf, type PublicFile } from "./shared";

/* ─────────────────────────────────────────────────────────────
   Every file in /public, for the file library. Files are served
   from the site root: public/images/work/cover.jpg is
   "/images/work/cover.jpg". Hidden files and folders (.DS_Store,
   .well-known…) and symlinks are left out, so nothing outside
   /public can ever be listed or zipped.
   ───────────────────────────────────────────────────────────── */

/** Keeps the page's payload bounded. */
const MAX_FILES = 5000;
/** Text files show their first characters on their card. */
const SNIPPET_BYTES = 1536;
const SNIPPET_CHARS = 520;

export const publicDir = (root = process.cwd()) => join(root, "public");

/** The start of a text file, or nothing when it looks binary or can't be read. */
async function readSnippet(file: string): Promise<string | undefined> {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return undefined;
  try {
    const buffer = Buffer.alloc(SNIPPET_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIPPET_BYTES, 0);
    // A multi-byte character cut in half at the end decodes as U+FFFD: drop it.
    const text = buffer.subarray(0, bytesRead).toString("utf8").replace(/\uFFFD+$/, "");
    if (text.includes("\u0000")) return undefined;
    return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

/** By folder ("" first), then name in natural order (2 before 10). */
function compare(a: PublicFile, b: PublicFile): number {
  return a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export async function listPublicFiles(root = process.cwd()): Promise<PublicFile[]> {
  const base = publicDir(root);
  let entries;
  try {
    entries = await readdir(base, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const found = await Promise.all(
    entries.map(async (entry): Promise<PublicFile | null> => {
      // Symlinks aren't files here, so a link can't reach outside /public.
      if (!entry.isFile()) return null;
      const file = join(entry.parentPath, entry.name);
      const parts = relative(base, file).split(sep);
      if (parts.some((part) => part.startsWith("."))) return null;
      // Deleted between the listing and now: skip it.
      const info = await stat(file).catch(() => null);
      if (!info) return null;

      const ext = extname(entry.name).slice(1).toLowerCase();
      const kind = kindOf(ext);
      return {
        src: `/${parts.map(encodeURIComponent).join("/")}`,
        path: parts.join("/"),
        folder: parts.slice(0, -1).join("/"),
        name: entry.name,
        ext,
        kind,
        bytes: info.size,
        modified: Math.round(info.mtimeMs),
        snippet: kind === "text" ? await readSnippet(file) : undefined,
      };
    }),
  );

  return found
    .filter((file): file is PublicFile => file !== null)
    .sort(compare)
    .slice(0, MAX_FILES);
}
