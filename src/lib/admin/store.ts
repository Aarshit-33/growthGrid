import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import { validateContent, type ContentSnapshot } from "@/lib/content/validate";
import { pageSchemas, type PageKey } from "@/lib/schemas";
import { sameValue } from "./diff";
import { appendHistory, createEntry, HISTORY_LABEL, type HistoryDraft } from "./history";
import { formatJson } from "./json-format";
import type { FieldIssue, HistoryEntry, SessionUser } from "./types";

/* ─────────────────────────────────────────────────────────────
   Admin content store: the JSON files in /content.

   • Reads go to disk on every request, so the admin always shows
     what the files hold right now. (The public site uses the copy
     bundled by Next; in `npm run dev` it hot-reloads on save.)
   • Every write first validates the whole site with the change
     applied (the same checks as `npm run validate:content`), so
     the admin can't save content that would break a page or the
     build.
   • Writes are serialised and atomic (temp file + rename), and
     keep each file's hand-formatted layout (see json-format.ts).
   • Every write is recorded in History (history.ts) inside the
     same lock, with who made it and the before/after. If that
     record can't be written, the file is put back: no change is
     ever saved without its history entry.

   Moving to a database later means re-implementing this module;
   the server actions only use what it exports.
   ───────────────────────────────────────────────────────────── */

export const PAGE_KEYS = Object.keys(pageSchemas) as PageKey[];

export type DocTarget =
  | { kind: "settings" }
  | { kind: "page"; key: PageKey }
  | { kind: "collection"; name: CollectionName };

/** A problem to show in the admin as is. */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly details: { errors?: string[]; conflict?: boolean; issues?: FieldIssue[] } = {},
  ) {
    super(message);
    this.name = "AdminError";
  }
}

const CONTENT_DIR = join(process.cwd(), "content");

/** Path inside /content, e.g. "pages/home.json". */
export function fileLabel(target: DocTarget): string {
  switch (target.kind) {
    case "settings":
      return "settings.json";
    case "page":
      return `pages/${target.key}.json`;
    case "collection":
      return collectionRegistry[target.name].file;
  }
}

const filePath = (target: DocTarget) => join(CONTENT_DIR, fileLabel(target));

interface Loaded {
  data: unknown;
  text: string;
}

async function load(target: DocTarget): Promise<Loaded> {
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

export async function readDoc(target: DocTarget): Promise<unknown> {
  return (await load(target)).data;
}

export async function readCollection(name: CollectionName): Promise<Record<string, unknown>[]> {
  const data = await readDoc({ kind: "collection", name });
  if (!Array.isArray(data)) throw new AdminError(`content/${collectionRegistry[name].file} should hold a JSON list.`);
  return data as Record<string, unknown>[];
}

const allTargets = (): DocTarget[] => [
  { kind: "settings" },
  ...PAGE_KEYS.map((key) => ({ kind: "page", key }) as const),
  ...collectionNames.map((name) => ({ kind: "collection", name }) as const),
];

async function loadAll() {
  const targets = allTargets();
  const loaded = await Promise.all(targets.map(load));
  const texts = new Map<string, string>();
  const snapshot: ContentSnapshot = {
    settings: undefined,
    pages: {} as Record<PageKey, unknown>,
    collections: {} as Record<CollectionName, unknown[]>,
  };
  targets.forEach((target, i) => {
    texts.set(fileLabel(target), loaded[i].text);
    write(snapshot, target, loaded[i].data);
  });
  return { snapshot, texts };
}

/** Every content document, straight from disk. */
export async function readSnapshot(): Promise<ContentSnapshot> {
  return (await loadAll()).snapshot;
}

function read(snapshot: ContentSnapshot, target: DocTarget): unknown {
  if (target.kind === "settings") return snapshot.settings;
  if (target.kind === "page") return snapshot.pages[target.key];
  return snapshot.collections[target.name];
}

function write(snapshot: ContentSnapshot, target: DocTarget, value: unknown) {
  if (target.kind === "settings") snapshot.settings = value;
  else if (target.kind === "page") snapshot.pages[target.key] = value;
  else snapshot.collections[target.name] = value as unknown[];
}

/** Short fingerprint of a JSON value, for "changed since you opened it" checks. */
export function versionOf(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("base64url")
    .slice(0, 16);
}

const without = (value: unknown, key: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const rest = { ...(value as Record<string, unknown>) };
  delete rest[key];
  return rest;
};

/** An item as its editor owns it (the list owns `order`). */
export const itemVersion = (item: unknown) => versionOf(without(item, "order"));
/** A page as the copy editor owns it (the Homepage screen owns `sections`). */
export const pageVersion = (doc: unknown) => versionOf(without(doc, "sections"));
/** The homepage layout. */
export const layoutVersion = (doc: unknown) =>
  versionOf(doc && typeof doc === "object" ? ((doc as Record<string, unknown>).sections ?? null) : null);

/* One write at a time (per server process; kept on globalThis across dev reloads). */
const lock = globalThis as typeof globalThis & { __ggAdminWrites?: Promise<unknown> };
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = (lock.__ggAdminWrites ?? Promise.resolve()).then(task, task);
  lock.__ggAdminWrites = run.catch(() => undefined);
  return run;
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
        "This server can't write the content files (read-only file system). Run the admin locally with `npm run dev`, or connect a database.",
      );
    }
    throw error;
  }
}

const added = (next: string[], before: string[]) => {
  const seen = new Set(before);
  return next.filter((message) => !seen.has(message));
};

export interface SaveOutcome<T> {
  value: T;
  /** New warnings this change causes (SEO lengths, links to hidden pages…). */
  warnings: string[];
  /** The History entry written for it (null when the change changed nothing). */
  entry: HistoryEntry | null;
}

/** Who's making a change, and what History should say about it. */
export interface Audit<T> {
  user: SessionUser;
  /** The entry for this change, from the whole document before and after. */
  record: (before: T, after: T) => HistoryDraft;
}

/**
 * Read → change → validate → write → record, as one serialised step. `change`
 * gets a copy of the current document and returns the new one (or throws an
 * AdminError). If the change would add validation errors anywhere on the
 * site, nothing is written and the errors are returned to the editor.
 */
export function updateDoc<T>(
  target: DocTarget,
  change: (current: T) => T | Promise<T>,
  audit: Audit<T>,
): Promise<SaveOutcome<T>> {
  return exclusive(async () => {
    const { snapshot, texts } = await loadAll();
    const current = read(snapshot, target) as T;
    const next = await change(structuredClone(current));
    // Nothing changed: nothing to write or record.
    if (sameValue(current, next)) return { value: next, warnings: [], entry: null };

    const candidate: ContentSnapshot = {
      settings: snapshot.settings,
      pages: { ...snapshot.pages },
      collections: { ...snapshot.collections },
    };
    write(candidate, target, next);

    const before = validateContent({ content: snapshot });
    const after = validateContent({ content: candidate });
    const errors = added(after.errors, before.errors);
    if (errors.length > 0) {
      throw new AdminError("This change would break the site, so it wasn't saved.", { errors });
    }

    const label = fileLabel(target);
    const entry = createEntry(audit.record(current, next), audit.user, `content/${label}`);
    const original = texts.get(label);
    await writeAtomic(filePath(target), formatJson(next, original));
    if (entry) {
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
    }
    return { value: next, warnings: added(after.warnings, before.warnings), entry };
  });
}

/** Site-wide validation of what's on disk now (for the dashboard's health panel). */
export async function checkContent() {
  return validateContent({ content: await readSnapshot() });
}
