import "server-only";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { usesMongoContent } from "@/lib/db/uri";
import { HISTORY_COLLECTION } from "@/lib/models/names";
import { adminHref } from "./config";
import { changedPaths, sameValue, summarizeChanges } from "./diff";
import type { HistoryAction, HistoryEntry, HistorySummary, HistoryTarget, SessionUser } from "./types";

/* ─────────────────────────────────────────────────────────────
   Studio history: every change made in the Studio, who made it,
   and the thing it changed as it was before and after. One JSON
   line per change in .data/studio-history.ndjson (git-ignored,
   outside /content), or with CONTENT_SOURCE=mongo one document
   per change in the studio_history collection (history-mongo.ts).

   Append-only by design: nothing in the Studio edits or deletes
   an entry, and there is no clean-up. Revoking a change adds a
   new entry. A deleted item lives on in the entry that deleted
   it, which is how Deleted items can restore it at any time.
   ───────────────────────────────────────────────────────────── */

const HISTORY_DIR = join(process.cwd(), ".data");
const HISTORY_FILE = join(HISTORY_DIR, "studio-history.ndjson");
/** Where the file lives, for messages and the screens. */
export const HISTORY_LABEL = ".data/studio-history.ndjson";

/** Where History is kept with the current content source. */
export function historyLocation(): string {
  return usesMongoContent() ? `MongoDB: ${HISTORY_COLLECTION}` : HISTORY_LABEL;
}

/** What an action knows about its change. The store adds who, when and which file. */
export interface HistoryDraft {
  action: HistoryAction;
  target: HistoryTarget;
  title: string;
  /** Defaults to the fields that changed ("Changed Title and Summary"). */
  summary?: string;
  /** The target before and after (null: it didn't exist). */
  before: unknown;
  after: unknown;
  revokes?: string;
}

/** Sortable by time, unique enough for one studio. */
const newId = () => `${Date.now().toString(36).padStart(9, "0")}-${randomBytes(3).toString("hex")}`;

/** The entry to write, or null when the draft changes nothing. */
export function createEntry(draft: HistoryDraft, user: SessionUser, file: string): HistoryEntry | null {
  if (sameValue(draft.before, draft.after)) return null;
  // Field lists only for edits: a whole created or deleted item isn't "changed fields".
  const fieldwise = draft.before != null && draft.after != null && draft.target.kind !== "list" && draft.target.kind !== "layout";
  const changes = fieldwise ? changedPaths(draft.before, draft.after) : [];
  return {
    id: newId(),
    at: new Date().toISOString(),
    user: { name: user.name, email: user.email, role: user.role },
    action: draft.action,
    target: draft.target,
    title: draft.title,
    file,
    summary: draft.summary ?? summarizeChanges(changes),
    changes,
    ...(draft.revokes ? { revokes: draft.revokes } : {}),
    before: draft.before ?? null,
    after: draft.after ?? null,
  };
}

/**
 * Adds one entry at the end of the file (CONTENT_SOURCE=json). The only write
 * this module does; in Mongo mode the content backend inserts the entry in
 * the same transaction as the change (history-mongo.ts).
 */
export async function appendHistory(entry: HistoryEntry): Promise<void> {
  await mkdir(HISTORY_DIR, { recursive: true });
  await appendFile(HISTORY_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

/* ── Reading ──────────────────────────────────────────────── */

interface Cache {
  /** Bytes read so far (always up to a line break). */
  offset: number;
  /** Oldest first. */
  entries: HistoryEntry[];
}

const memo = globalThis as typeof globalThis & { __ggStudioHistory?: Cache };

const isEntry = (value: unknown): value is HistoryEntry =>
  !!value &&
  typeof value === "object" &&
  typeof (value as HistoryEntry).id === "string" &&
  typeof (value as HistoryEntry).at === "string" &&
  !!(value as HistoryEntry).target &&
  !!(value as HistoryEntry).user;

/** Every entry, oldest first, from wherever History is kept. */
async function readAll(): Promise<HistoryEntry[]> {
  if (usesMongoContent()) return (await import("./history-mongo")).readMongoHistory();
  return readHistoryFile();
}

/** Every entry in the file, oldest first. Only the lines added since the last read are parsed. */
async function readHistoryFile(): Promise<HistoryEntry[]> {
  let size: number;
  try {
    size = (await stat(HISTORY_FILE)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  let cache = memo.__ggStudioHistory;
  // First read, or the file was replaced by hand: start over.
  if (!cache || size < cache.offset) cache = { offset: 0, entries: [] };
  if (size > cache.offset) {
    const handle = await open(HISTORY_FILE, "r");
    try {
      const buffer = Buffer.alloc(size - cache.offset);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, cache.offset);
      // Whole lines only: the last one may still be being written.
      const end = buffer.subarray(0, bytesRead).lastIndexOf(0x0a);
      if (end >= 0) {
        const entries = [...cache.entries];
        for (const line of buffer.subarray(0, end).toString("utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed: unknown = JSON.parse(line);
            if (isEntry(parsed)) entries.push(parsed);
          } catch {
            console.warn(`[admin] Skipped an unreadable line in ${HISTORY_LABEL}.`);
          }
        }
        cache = { offset: cache.offset + end + 1, entries };
      }
    } finally {
      await handle.close();
    }
  }
  memo.__ggStudioHistory = cache;
  return cache.entries;
}

/* ── Queries ──────────────────────────────────────────────── */

/** A document's key in History links: "settings", "layout", "page:home", "item:insights:my-slug", "list:faqs". */
export function docKey(target: HistoryTarget): string {
  switch (target.kind) {
    case "settings":
    case "layout":
      return target.kind;
    case "page":
      return `page:${target.key}`;
    case "list":
      return `list:${target.name}`;
    case "item":
      return `item:${target.name}:${target.id}`;
  }
}

/** The key an item had before this change renamed it, if it did. */
function renamedFrom(target: HistoryTarget): string | null {
  return target.kind === "item" && target.previousId ? `item:${target.name}:${target.previousId}` : null;
}

/**
 * The entries about one document, oldest first. Follows renames back in time:
 * before an item was renamed, its changes were recorded under its old slug
 * (and the new slug may have belonged to something else).
 */
function aboutDoc(all: HistoryEntry[], doc: string): HistoryEntry[] {
  const keys = new Set([doc]);
  const found: HistoryEntry[] = [];
  for (let i = all.length - 1; i >= 0; i--) {
    const entry = all[i];
    const key = docKey(entry.target);
    const previous = renamedFrom(entry.target);
    if (keys.has(key)) {
      found.push(entry);
      if (previous) {
        keys.delete(key);
        keys.add(previous);
      }
    } else if (previous && keys.has(previous)) {
      found.push(entry);
    }
  }
  return found.reverse();
}

/** How many later changes touched the same thing as all[index] (following renames forward). */
function laterChanges(all: HistoryEntry[], index: number): number {
  const keys = new Set([docKey(all[index].target)]);
  let count = 0;
  for (const later of all.slice(index + 1)) {
    const key = docKey(later.target);
    const previous = renamedFrom(later.target);
    if (keys.has(key)) {
      count++;
    } else if (previous && keys.has(previous)) {
      count++;
      keys.delete(previous);
      keys.add(key);
    }
  }
  return count;
}

type RevokedBy = NonNullable<HistorySummary["revokedBy"]>;

function revokers(entries: HistoryEntry[]): Map<string, RevokedBy> {
  const map = new Map<string, RevokedBy>();
  for (const entry of entries) if (entry.revokes) map.set(entry.revokes, { id: entry.id, at: entry.at, user: entry.user });
  return map;
}

function summaryOf(entry: HistoryEntry, revokedBy?: RevokedBy): HistorySummary {
  return {
    id: entry.id,
    at: entry.at,
    user: entry.user,
    action: entry.action,
    target: entry.target,
    title: entry.title,
    file: entry.file,
    summary: entry.summary,
    changes: entry.changes ?? [],
    ...(entry.revokes ? { revokes: entry.revokes } : {}),
    ...(revokedBy ? { revokedBy } : {}),
  };
}

export interface HistoryQuery {
  /** Only this person's changes (their email; "" is the single-password account). */
  user?: string;
  /** Only changes to one document (see docKey). */
  doc?: string;
  /** Newest first, at most this many. */
  limit?: number;
}

/** Changes, newest first, with how many match in all. */
export async function listHistory(query: HistoryQuery = {}): Promise<{ entries: HistorySummary[]; total: number }> {
  const all = await readAll();
  const revokedBy = revokers(all);
  const matching = (query.doc ? aboutDoc(all, query.doc) : all).filter(
    (entry) => query.user === undefined || entry.user.email === query.user,
  );
  const newest = matching.slice().reverse();
  const shown = query.limit ? newest.slice(0, query.limit) : newest;
  return { entries: shown.map((entry) => summaryOf(entry, revokedBy.get(entry.id))), total: matching.length };
}

/** What an editor's History panel shows: the latest change to its document, how many there are, and where to see them all. */
export async function editorHistory(target: HistoryTarget, base: string) {
  const doc = docKey(target);
  const { entries, total } = await listHistory({ doc, limit: 1 });
  const last = entries[0];
  return {
    href: adminHref(base, `/history?doc=${encodeURIComponent(doc)}`),
    total,
    last: last ? { name: last.user.name, at: last.at, summary: last.summary } : null,
  };
}

export type HistoryDetail = HistoryEntry & {
  revokedBy?: RevokedBy;
  /** Changes made to the same thing after this one (revoking this one would undo those too). */
  newer: number;
};

/** One change in full (its before/after copies), or null. */
export async function getHistoryEntry(id: string): Promise<HistoryDetail | null> {
  const all = await readAll();
  const index = all.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const entry = all[index];
  const revokedBy = revokers(all).get(id);
  return { ...entry, newer: laterChanges(all, index), ...(revokedBy ? { revokedBy } : {}) };
}

/** Everyone who has changed something, by email, as they were last recorded. */
export async function historyPeople(): Promise<SessionUser[]> {
  const people = new Map<string, SessionUser>();
  for (const entry of await readAll()) people.set(entry.user.email, entry.user);
  return [...people.values()];
}

export interface DeletedItem {
  /** The change that removed it: revoking it restores the item. */
  entry: HistorySummary;
  /** The item as it was. */
  item: Record<string, unknown>;
}

/**
 * Deleted items: items whose latest recorded change removed them, newest
 * first. `exists` skips any that were added back by hand since.
 */
export async function deletedItems(exists: (name: string, id: string) => boolean): Promise<DeletedItem[]> {
  const latest = new Map<string, HistoryEntry>();
  for (const entry of await readAll()) {
    if (entry.target.kind !== "item") continue;
    latest.set(`${entry.target.name}:${entry.target.id}`, entry);
    if (entry.target.previousId) latest.set(`${entry.target.name}:${entry.target.previousId}`, entry);
  }
  const seen = new Set<string>();
  const items: DeletedItem[] = [];
  for (const entry of latest.values()) {
    const target = entry.target;
    if (target.kind !== "item" || entry.after !== null || !entry.before || typeof entry.before !== "object") continue;
    if (seen.has(entry.id) || exists(target.name, target.id)) continue;
    seen.add(entry.id);
    items.push({ entry: summaryOf(entry), item: entry.before as Record<string, unknown> });
  }
  return items.sort((a, b) => b.entry.at.localeCompare(a.entry.at));
}
