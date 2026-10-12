import type { CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import type { PageKey } from "@/lib/schemas";
import type { HistoryEntry } from "../types";

/* ─────────────────────────────────────────────────────────────
   Where the Studio's content lives. store.ts does the reading,
   validating and recording; a backend only loads documents and
   writes one back. Chosen by CONTENT_SOURCE (./index.ts):
   • json  — the files in /content (json.ts)
   • mongo — MongoDB collections (mongo.ts)
   ───────────────────────────────────────────────────────────── */

export type DocTarget =
  | { kind: "settings" }
  | { kind: "page"; key: PageKey }
  | { kind: "collection"; name: CollectionName };

/** Everything as it is now, and how to change one document of it. */
export interface LoadedContent {
  snapshot: ContentSnapshot;
  /**
   * Writes `next` for `target` (replacing what was loaded) and records
   * `entry` in History, as one step: if either fails, neither is kept and
   * the error is thrown.
   */
  commit(target: DocTarget, next: unknown, entry: HistoryEntry | null): Promise<void>;
}

export interface ContentBackend {
  readonly kind: "json" | "mongo";
  /** Where a document is kept, for screens and History ("content/pages/home.json"). */
  location(target: DocTarget): string;
  /** Every content document, as stored now. */
  load(): Promise<LoadedContent>;
  /** Runs read → validate → write steps one at a time (across server instances where that matters). */
  exclusive<T>(task: () => Promise<T>): Promise<T>;
}
