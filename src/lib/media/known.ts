/* ─────────────────────────────────────────────────────────────
   Which site paths this server has seen in the media database
   (GridFS), as a synchronous lookup for code that can't await,
   such as validateContent(). No database imports: the GridFS
   module (./gridfs.ts) fills it whenever it lists, uploads,
   deletes or restores.

   It only ever answers "yes, it's there". On Vercel every request
   may hit a different instance, so another one may have uploaded a
   file this one hasn't seen: "not here" is only trusted from a list
   fetched for that check (validateContent's `media` option).

   Kept on globalThis so dev reloads and every module copy share it.
   ───────────────────────────────────────────────────────────── */

import { usesMongoContent } from "@/lib/db/uri";

const store = globalThis as typeof globalThis & { __ggKnownMedia?: Set<string> };
const known = (): Set<string> => (store.__ggKnownMedia ??= new Set());

/** Media is stored in MongoDB (GridFS) rather than /public: CONTENT_SOURCE=mongo. */
export const isMediaInDatabase = () => usesMongoContent();

/** After a full listing: exactly these paths are live. */
export function setKnownMedia(paths: Iterable<string>) {
  store.__ggKnownMedia = new Set(paths);
}

export function addKnownMedia(path: string) {
  known().add(path);
}

export function removeKnownMedia(path: string) {
  known().delete(path);
}

/** True when this server has seen a live file at `path` in the media database. */
export function knownMedia(path: string): boolean {
  return known().has(path);
}
