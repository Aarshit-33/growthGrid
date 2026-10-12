import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdminError } from "../errors";
import { appendHistory, HISTORY_LABEL } from "../history";
import { formatJson } from "../json-format";
import type { HistoryEntry } from "../types";
import { allTargets, emptySnapshot, fileLabel, place } from "./shared";
import type { ContentBackend, DocTarget, LoadedContent } from "./types";

/* ─────────────────────────────────────────────────────────────
   CONTENT_SOURCE=json: the JSON files in /content.

   • Reads go to disk on every request, so the admin always shows
     what the files hold right now. (The public site uses the copy
     bundled by Next; in `npm run dev` it hot-reloads on save.)
   • Writes are serialised and atomic (temp file + rename), and
     keep each file's hand-formatted layout (see json-format.ts).
   • History goes to .data/studio-history.ndjson. If that line
     can't be written, the file is put back: no change is ever
     saved without its history entry.
   ───────────────────────────────────────────────────────────── */

const CONTENT_DIR = join(process.cwd(), "content");

const filePath = (target: DocTarget) => join(CONTENT_DIR, fileLabel(target));

async function loadFile(target: DocTarget): Promise<{ data: unknown; text: string }> {
  const label = `content/${fileLabel(target)}`;
  let text: string;
  try {
    text = await readFile(filePath(target), "utf8");
  } catch (error) {
    throw new AdminError(`Couldn't read ${label}: ${(error as Error).message}`);
  }
  try {
    return { data: JSON.parse(text), text };
  } catch (error) {
    throw new AdminError(`${label} isn't valid JSON (${(error as Error).message}). Fix it in your editor, then reload.`);
  }
}

async function writeAtomic(file: string, text: string) {
  const temp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new AdminError(
        "This server can't write the content files (read-only file system). Run the admin locally with `npm run dev`, or set CONTENT_SOURCE=mongo to edit the database.",
      );
    }
    throw error;
  }
}

/* One write at a time (per server process; kept on globalThis across dev reloads). */
const lock = globalThis as typeof globalThis & { __ggAdminWrites?: Promise<unknown> };

export const jsonBackend: ContentBackend = {
  kind: "json",

  location: (target) => `content/${fileLabel(target)}`,

  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = (lock.__ggAdminWrites ?? Promise.resolve()).then(task, task);
    lock.__ggAdminWrites = run.catch(() => undefined);
    return run;
  },

  async load(): Promise<LoadedContent> {
    const targets = allTargets();
    const loaded = await Promise.all(targets.map(loadFile));
    const texts = new Map<string, string>();
    const snapshot = emptySnapshot();
    targets.forEach((target, i) => {
      texts.set(fileLabel(target), loaded[i].text);
      place(snapshot, target, loaded[i].data);
    });

    return {
      snapshot,
      async commit(target: DocTarget, next: unknown, entry: HistoryEntry | null) {
        const original = texts.get(fileLabel(target));
        await writeAtomic(filePath(target), formatJson(next, original));
        if (!entry) return;
        try {
          await appendHistory(entry);
        } catch (error) {
          // Never a change without its history: put the file back as it was.
          if (original !== undefined) await writeAtomic(filePath(target), original).catch(() => undefined);
          console.error("[admin] Couldn't write to the history:", error);
          throw new AdminError(
            `This change couldn't be recorded in History (${HISTORY_LABEL}), so it wasn't saved. Check that the .data folder is writable.`,
          );
        }
      },
    };
  },
};
