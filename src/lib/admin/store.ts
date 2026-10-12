import "server-only";
import { createHash } from "node:crypto";
import type { CollectionName } from "@/lib/content/registry";
import { validateContent, type ContentSnapshot } from "@/lib/content/validate";
import { usesMongoContent } from "@/lib/db/uri";
import { mongoLocation } from "@/lib/models/names";
import { contentBackend, type DocTarget } from "./backend";
import { fileLabel, pick, place } from "./backend/shared";
import { sameValue } from "./diff";
import { AdminError } from "./errors";
import { createEntry, type HistoryDraft } from "./history";
import type { HistoryEntry, SessionUser } from "./types";

export { AdminError } from "./errors";
export { fileLabel, PAGE_KEYS } from "./backend/shared";
export type { DocTarget } from "./backend";

/* ─────────────────────────────────────────────────────────────
   Admin content store. Where content lives is the backend's job
   (./backend, chosen by CONTENT_SOURCE):
   • json  — the files in /content, History in .data/
   • mongo — MongoDB, History in the studio_history collection

   Either way:
   • Reads load everything fresh on every request, so the admin
     always shows what's stored right now.
   • Every write first validates the whole site with the change
     applied (the same checks as `npm run validate:content`), so
     the admin can't save content that would break a page.
   • Writes are serialised (across server instances with Mongo),
     and every write is recorded in History in the same step: no
     change is ever saved without its history entry.

   The server actions only use what this module exports.
   ───────────────────────────────────────────────────────────── */

/** Where a document is kept with the current content source ("content/pages/home.json", "MongoDB: pages/home"). */
export function docLocation(target: DocTarget): string {
  return usesMongoContent() ? mongoLocation(target) : `content/${fileLabel(target)}`;
}

export async function readDoc(target: DocTarget): Promise<unknown> {
  return pick(await readSnapshot(), target);
}

export async function readCollection(name: CollectionName): Promise<Record<string, unknown>[]> {
  const data = await readDoc({ kind: "collection", name });
  if (!Array.isArray(data)) throw new AdminError(`${docLocation({ kind: "collection", name })} should hold a list.`);
  return data as Record<string, unknown>[];
}

/** Every content document, as stored right now. */
export async function readSnapshot(): Promise<ContentSnapshot> {
  return (await (await contentBackend()).load()).snapshot;
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
export async function updateDoc<T>(
  target: DocTarget,
  change: (current: T) => T | Promise<T>,
  audit: Audit<T>,
): Promise<SaveOutcome<T>> {
  const backend = await contentBackend();
  return backend.exclusive(async () => {
    const loaded = await backend.load();
    const { snapshot } = loaded;
    const current = pick(snapshot, target) as T;
    if (current === undefined) {
      throw new AdminError(
        `${backend.location(target)} doesn't exist yet. Use Sync in the sidebar to create the missing content, then try again.`,
      );
    }
    const next = await change(structuredClone(current));
    // Nothing changed: nothing to write or record.
    if (sameValue(current, next)) return { value: next, warnings: [], entry: null };

    const candidate: ContentSnapshot = {
      settings: snapshot.settings,
      pages: { ...snapshot.pages },
      collections: { ...snapshot.collections },
    };
    place(candidate, target, next);

    const before = validateContent({ content: snapshot });
    const after = validateContent({ content: candidate });
    const errors = added(after.errors, before.errors);
    if (errors.length > 0) {
      throw new AdminError("This change would break the site, so it wasn't saved.", { errors });
    }

    const entry = createEntry(audit.record(current, next), audit.user, backend.location(target));
    await loaded.commit(target, next, entry);
    return { value: next, warnings: added(after.warnings, before.warnings), entry };
  });
}

/** Site-wide validation of what's stored now (for the dashboard's health panel). */
export async function checkContent() {
  return validateContent({ content: await readSnapshot() });
}
