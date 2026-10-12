import "server-only";
import mongoose from "mongoose";
import { database } from "@/lib/db/mongoose";
import { HistoryEntryModel } from "@/lib/models/history";
import type { HistoryEntry } from "./types";

/* ─────────────────────────────────────────────────────────────
   Studio History in MongoDB (CONTENT_SOURCE=mongo). Same entries
   as the .ndjson file, one document each; history.ts does all the
   querying on top of readMongoHistory().

   Reads are incremental: only documents newer than the last one
   seen are fetched, and a count check falls back to a full read
   when another server instance's write landed out of order.
   ───────────────────────────────────────────────────────────── */

type ObjectId = mongoose.Types.ObjectId;
type Stored = HistoryEntry & { _id: ObjectId };

interface Cache {
  /** Newest _id read so far. */
  last: ObjectId | null;
  /** Oldest first. */
  entries: HistoryEntry[];
}

const memo = globalThis as typeof globalThis & { __ggStudioHistoryMongo?: Cache; __ggStudioHistoryIndexes?: Promise<void> };

async function collection() {
  const db = await database();
  return db.collection<Stored>(HistoryEntryModel.collection.collectionName);
}

/**
 * Creates the collection's indexes (unique `id`) once per process. Call it
 * before a transaction: index builds inside one would conflict with it.
 */
export function prepareHistory(): Promise<void> {
  memo.__ggStudioHistoryIndexes ??= database()
    .then(() => HistoryEntryModel.init())
    .then(() => undefined)
    .catch((error: unknown) => {
      memo.__ggStudioHistoryIndexes = undefined;
      throw error;
    });
  return memo.__ggStudioHistoryIndexes;
}

/** Adds one entry (inside the caller's transaction when given a session). */
export async function insertHistory(entry: HistoryEntry, session?: mongoose.mongo.ClientSession): Promise<void> {
  const history = await collection();
  // A copy: insertOne adds `_id` to the object it's given.
  await history.insertOne({ ...entry } as Stored, { session });
}

const toEntry = (stored: Stored): HistoryEntry => {
  const entry: Partial<Stored> = { ...stored };
  delete entry._id;
  return entry as HistoryEntry;
};
const byId = (a: HistoryEntry, b: HistoryEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every entry, oldest first. */
export async function readMongoHistory(): Promise<HistoryEntry[]> {
  const history = await collection();
  const cache = memo.__ggStudioHistoryMongo;
  if (cache) {
    const [fresh, total] = await Promise.all([
      history.find(cache.last ? { _id: { $gt: cache.last } } : {}).sort({ _id: 1 }).toArray(),
      history.countDocuments({}),
    ]);
    if (cache.entries.length + fresh.length === total) {
      if (fresh.length === 0) return cache.entries;
      const entries = [...cache.entries, ...fresh.map(toEntry)].sort(byId);
      memo.__ggStudioHistoryMongo = { last: fresh[fresh.length - 1]._id, entries };
      return entries;
    }
  }
  // First read, or something was missed: read everything.
  const all = await history.find({}).sort({ _id: 1 }).toArray();
  const last = all.at(-1)?._id ?? null;
  const entries = all.map(toEntry).sort(byId);
  memo.__ggStudioHistoryMongo = { last, entries };
  return entries;
}
