import "server-only";
import { randomUUID } from "node:crypto";
import type mongoose from "mongoose";
import { describeMongoTarget, redactCredentials } from "@/lib/db/uri";
import { database } from "@/lib/db/mongoose";
import { readStoredContent, writeStoredDoc } from "@/lib/db/content-store";
import { LOCKS_COLLECTION, mongoLocation } from "@/lib/models/names";
import { AdminError } from "../errors";
import { insertHistory, prepareHistory } from "../history-mongo";
import type { HistoryEntry } from "../types";
import { pick } from "./shared";
import type { ContentBackend, DocTarget, LoadedContent } from "./types";

/* ─────────────────────────────────────────────────────────────
   CONTENT_SOURCE=mongo: settings, pages and collections in MongoDB
   (the same documents the public site reads), History in
   studio_history.

   • Serverless-safe writes: each read → validate → write step holds
     a short lease in studio_locks, so two Vercel instances can't
     interleave (and the version checks in actions.ts still see the
     latest data). A crashed holder's lease simply expires.
   • A change and its History entry are written in one transaction
     (Atlas is a replica set). Where transactions aren't available
     (a standalone mongod), the change is undone if History fails.
   ───────────────────────────────────────────────────────────── */

type Db = mongoose.mongo.Db;

/** How long a lease lasts if its holder dies mid-write. */
const LEASE_MS = 30_000;
/** How long to wait for someone else's write before giving up. */
const WAIT_MS = 20_000;
const LOCK_ID = "studio-content";

interface LockDoc {
  _id: string;
  owner: string;
  until: Date;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

async function acquire(db: Db, owner: string): Promise<void> {
  const locks = db.collection<LockDoc>(LOCKS_COLLECTION);
  const deadline = Date.now() + WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    const now = new Date();
    try {
      // Take the lease if it's free or expired; insert it the first time.
      await locks.updateOne(
        { _id: LOCK_ID, until: { $lt: now } },
        { $set: { owner, until: new Date(now.getTime() + LEASE_MS) } },
        { upsert: true },
      );
      return;
    } catch (error) {
      // Someone holds it: the upsert collided with their document.
      if (!isDuplicateKey(error)) throw error;
    }
    if (Date.now() > deadline) {
      throw new AdminError("Another change is still being saved. Wait a moment, then try again.", { conflict: true });
    }
    await sleep(Math.min(50 * 2 ** attempt, 500) + Math.random() * 50);
  }
}

async function release(db: Db, owner: string): Promise<void> {
  await db
    .collection<LockDoc>(LOCKS_COLLECTION)
    .updateOne({ _id: LOCK_ID, owner }, { $set: { until: new Date(0) } })
    .catch((error: unknown) => console.error("[admin] Couldn't release the write lock (it expires by itself):", error));
}

/* In-process queue first, so one instance doesn't poll against itself. */
const local = globalThis as typeof globalThis & { __ggAdminMongoWrites?: Promise<unknown>; __ggNoTransactions?: boolean };

const isTransactionUnsupported = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: number; message?: string };
  return code === 20 || /Transaction numbers are only allowed|replica set|does not support transactions/i.test(message ?? "");
};

/** Turns driver failures into a message the Studio can show (never the URI). */
function asAdminError(error: unknown, doing: string): AdminError {
  if (error instanceof AdminError) return error;
  const reason = redactCredentials(error instanceof Error ? error.message : String(error));
  console.error(`[admin] MongoDB failed while ${doing}:`, reason);
  return new AdminError(`Couldn't reach MongoDB (${describeMongoTarget()}) while ${doing}. Nothing was saved. ${reason}`);
}

async function commitWithTransaction(db: Db, target: DocTarget, next: unknown, before: unknown, entry: HistoryEntry | null) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await writeStoredDoc(db, target, next, before, { session });
      if (entry) await insertHistory(entry, session);
    });
  } finally {
    await session.endSession();
  }
}

async function commitWithUndo(db: Db, target: DocTarget, next: unknown, before: unknown, entry: HistoryEntry | null) {
  try {
    await writeStoredDoc(db, target, next, before);
    if (entry) await insertHistory(entry);
  } catch (error) {
    // Never a change without its history: put back what was there. The
    // writes are diff-based upserts/deletes, so this also repairs a partly
    // applied collection change.
    await writeStoredDoc(db, target, before, next).catch((undo: unknown) =>
      console.error("[admin] Couldn't undo a change after History failed:", undo),
    );
    throw error;
  }
}

export const mongoBackend: ContentBackend = {
  kind: "mongo",

  location: mongoLocation,

  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const queued = async () => {
      const db = await database().catch((error: unknown) => {
        throw asAdminError(error, "connecting");
      });
      const owner = randomUUID();
      await acquire(db, owner).catch((error: unknown) => {
        throw asAdminError(error, "waiting for other saves");
      });
      try {
        return await task();
      } finally {
        await release(db, owner);
      }
    };
    const run = (local.__ggAdminMongoWrites ?? Promise.resolve()).then(queued, queued);
    local.__ggAdminMongoWrites = run.catch(() => undefined);
    return run;
  },

  async load(): Promise<LoadedContent> {
    let db: Db;
    let stored: Awaited<ReturnType<typeof readStoredContent>>;
    try {
      db = await database();
      stored = await readStoredContent(db);
    } catch (error) {
      throw asAdminError(error, "reading the content");
    }
    const { snapshot } = stored;

    return {
      snapshot,
      async commit(target, next, entry) {
        const before = pick(snapshot, target);
        try {
          await prepareHistory();
          if (local.__ggNoTransactions) {
            await commitWithUndo(db, target, next, before, entry);
            return;
          }
          try {
            await commitWithTransaction(db, target, next, before, entry);
          } catch (error) {
            if (!isTransactionUnsupported(error)) throw error;
            // A standalone server (local dev): remember, and save without one.
            local.__ggNoTransactions = true;
            await commitWithUndo(db, target, next, before, entry);
          }
        } catch (error) {
          throw asAdminError(error, "saving");
        }
      },
    };
  },
};
