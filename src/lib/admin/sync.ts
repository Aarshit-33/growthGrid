import "server-only";
import { z, type ZodType } from "zod";
import { rawCollections, rawPages, rawSettings } from "@/lib/content/raw";
import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import { validateContent, type ContentSnapshot } from "@/lib/content/validate";
import { readStoredContent, writeStoredDoc } from "@/lib/db/content-store";
import { database } from "@/lib/db/mongoose";
import { describeMongoTarget, mongoConfigProblem, redactCredentials, usesMongoContent } from "@/lib/db/uri";
import { HISTORY_COLLECTION, mongoLocation } from "@/lib/models/names";
import { pageSchemas, settingsSchema } from "@/lib/schemas";
import { contentBackend, type DocTarget } from "./backend";
import { fileLabel, PAGE_KEYS, pick } from "./backend/shared";
import { createEntry, type HistoryDraft } from "./history";
import { insertHistory, prepareHistory } from "./history-mongo";
import { itemTitle } from "./lists";
import { COLLECTION_META, PAGE_META } from "./meta";
import { readSnapshot } from "./store";
import type { HistoryEntry, SessionUser } from "./types";

/* ─────────────────────────────────────────────────────────────
   Sync (owner only, from the Studio sidebar).

   With CONTENT_SOURCE=mongo:
   1. connects to MongoDB;
   2. checks every expected document exists: settings, every page,
      and every collection that has items in the bundled content;
   3. creates ONLY what's missing, from the content bundled with this
      deploy. It never overwrites or deletes anything: MongoDB is the
      source of truth, and the bundled files go stale once the Studio
      edits the database. A collection the Studio has emptied on
      purpose (it has History) stays empty;
   4. runs every document through its schema and the site-wide checks;
   5. (the action) refreshes the whole site cache.

   With CONTENT_SOURCE=json it validates the files and refreshes.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

export interface SyncCollectionRow {
  name: CollectionName;
  label: string;
  /** Items stored now (after any were created). */
  count: number;
  /** Items in the bundled content files. */
  bundled: number;
  created: number;
  /** Why an empty collection was left empty. */
  note?: string;
}

export interface SyncReport {
  mode: "json" | "mongo";
  /** Connected, nothing invalid, no site-breaking errors. */
  ok: boolean;
  /** "cluster0.jgtwlmg.mongodb.net / growthgrid" or "content/". Never credentials. */
  where: string;
  at: string;
  tookMs: number;
  /** Set when Sync couldn't run at all (not configured, unreachable). */
  failure?: string;
  /** "settings", "pages › About", "testimonials › 3 items". */
  created: string[];
  pages: { key: string; label: string; status: "ok" | "created" | "invalid" }[];
  collections: SyncCollectionRow[];
  /** Documents that fail their schema, with the reasons. */
  invalid: { label: string; errors: string[] }[];
  /** Site-wide checks (broken references, missing images…). */
  errors: string[];
  warnings: string[];
}

const ERRORS_PER_DOC = 6;

function problems(schema: ZodType, value: unknown): string[] | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return z
    .prettifyError(result.error)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, ERRORS_PER_DOC * 2);
}

/** Every document, run through its own schema. */
function invalidDocs(snapshot: ContentSnapshot, location: (target: DocTarget) => string) {
  const invalid: SyncReport["invalid"] = [];
  const bad = new Set<string>();
  if (snapshot.settings !== undefined) {
    const errors = problems(settingsSchema, snapshot.settings);
    if (errors) invalid.push({ label: `Site settings (${location({ kind: "settings" })})`, errors });
  }
  for (const key of PAGE_KEYS) {
    const doc = snapshot.pages[key];
    if (doc === undefined) continue;
    const errors = problems(pageSchemas[key] as ZodType, doc);
    if (errors) {
      bad.add(key);
      invalid.push({ label: `Page › ${PAGE_META[key].label} (${location({ kind: "page", key })})`, errors });
    }
  }
  for (const name of collectionNames) {
    const { schema, key } = collectionRegistry[name];
    for (const item of (snapshot.collections[name] ?? []) as Raw[]) {
      const errors = problems(schema, item);
      if (errors) invalid.push({ label: `${COLLECTION_META[name].label} › ${itemTitle(name, item)} (${key}: ${String(item[key] ?? "?")})`, errors });
    }
  }
  return { invalid, badPages: bad };
}

function finish(report: Omit<SyncReport, "ok" | "tookMs">, started: number, snapshot: ContentSnapshot | null): SyncReport {
  let { errors, warnings } = report;
  if (snapshot) {
    const site = validateContent({ content: snapshot });
    errors = site.errors;
    warnings = site.warnings;
  }
  return {
    ...report,
    errors,
    warnings,
    ok: !report.failure && report.invalid.length === 0 && errors.length === 0,
    tookMs: Date.now() - started,
  };
}

const blank = (mode: SyncReport["mode"], where: string): Omit<SyncReport, "ok" | "tookMs"> => ({
  mode,
  where,
  at: new Date().toISOString(),
  created: [],
  pages: [],
  collections: [],
  invalid: [],
  errors: [],
  warnings: [],
});

function rows(snapshot: ContentSnapshot, created: Map<CollectionName, number>, notes: Map<CollectionName, string>): SyncCollectionRow[] {
  return collectionNames.map((name) => ({
    name,
    label: COLLECTION_META[name].label,
    count: (snapshot.collections[name] ?? []).length,
    bundled: rawCollections[name].length,
    created: created.get(name) ?? 0,
    note: notes.get(name),
  }));
}

/** JSON mode: nothing to create; validate what's on disk. */
async function syncJson(started: number): Promise<SyncReport> {
  const report = blank("json", "content/");
  const snapshot = await readSnapshot();
  const { invalid, badPages } = invalidDocs(snapshot, (target) => `content/${fileLabel(target)}`);
  report.invalid = invalid;
  report.pages = PAGE_KEYS.map((key) => ({ key, label: PAGE_META[key].label, status: badPages.has(key) ? "invalid" : "ok" }));
  report.collections = rows(snapshot, new Map(), new Map());
  return finish(report, started, snapshot);
}

const label = (target: DocTarget) =>
  target.kind === "settings" ? "Site settings" : target.kind === "page" ? `Page › ${PAGE_META[target.key].label}` : COLLECTION_META[target.name].label;

/** One History entry per created document, so Sync's changes show (and can be revoked) like any other. */
function entriesFor(target: DocTarget, value: unknown, user: SessionUser): HistoryEntry[] {
  const file = mongoLocation(target);
  const drafts: HistoryDraft[] = [];
  const summary = "Created by Sync from the bundled content";
  if (target.kind === "settings") drafts.push({ action: "create", target, title: label(target), summary, before: null, after: value });
  else if (target.kind === "page") drafts.push({ action: "create", target, title: label(target), summary, before: null, after: value });
  else {
    const { key } = collectionRegistry[target.name];
    for (const item of value as Raw[]) {
      drafts.push({
        action: "create",
        target: { kind: "item", name: target.name, id: String(item[key]) },
        title: `${COLLECTION_META[target.name].label} › ${itemTitle(target.name, item)}`,
        summary,
        before: null,
        after: item,
      });
    }
  }
  return drafts.map((draft) => createEntry(draft, user, file)).filter((entry): entry is HistoryEntry => entry !== null);
}

async function syncMongo(user: SessionUser, started: number): Promise<SyncReport> {
  const report = blank("mongo", describeMongoTarget());
  const problem = mongoConfigProblem();
  if (problem) return finish({ ...report, failure: problem }, started, null);

  const backend = await contentBackend();
  try {
    // Under the Studio's write lock: nobody saves halfway through.
    return await backend.exclusive(async () => {
      const db = await database();
      const { snapshot } = await readStoredContent(db);

      // What's missing, and what the bundled content has for it.
      const todo: { target: DocTarget; value: unknown }[] = [];
      if (snapshot.settings === undefined) todo.push({ target: { kind: "settings" }, value: rawSettings });
      for (const key of PAGE_KEYS) if (snapshot.pages[key] === undefined) todo.push({ target: { kind: "page", key }, value: rawPages[key] });

      const notes = new Map<CollectionName, string>();
      const empty = collectionNames.filter((name) => snapshot.collections[name].length === 0 && rawCollections[name].length > 0);
      const touched = new Set(
        empty.length > 0
          ? ((await db.collection(HISTORY_COLLECTION).distinct("target.name", { "target.name": { $in: empty } })) as string[])
          : [],
      );
      for (const name of empty) {
        if (touched.has(name)) notes.set(name, "Emptied in the Studio (see History), so left empty.");
        else todo.push({ target: { kind: "collection", name }, value: rawCollections[name] });
      }

      // Bundled content that fails today's schema is reported, not written.
      const createdCounts = new Map<CollectionName, number>();
      const skipped: SyncReport["invalid"] = [];
      if (todo.length > 0) await prepareHistory();
      for (const { target, value } of todo) {
        const schema =
          target.kind === "settings"
            ? settingsSchema
            : target.kind === "page"
              ? (pageSchemas[target.key] as ZodType)
              : z.array(collectionRegistry[target.name].schema);
        const errors = problems(schema, value);
        if (errors) {
          skipped.push({ label: `${label(target)} (bundled content, not created)`, errors });
          continue;
        }
        const before = pick(snapshot, target);
        await writeStoredDoc(db, target, value, before);
        try {
          for (const entry of entriesFor(target, value, user)) await insertHistory(entry);
        } catch (error) {
          // Never a change without its history: take it back out.
          await writeStoredDoc(db, target, before, value).catch(() => undefined);
          throw error;
        }
        if (target.kind === "collection") {
          createdCounts.set(target.name, (value as unknown[]).length);
          report.created.push(`${label(target)} › ${(value as unknown[]).length} items`);
        } else {
          report.created.push(label(target));
        }
      }

      // Check what's stored now.
      const after = report.created.length > 0 ? (await readStoredContent(db)).snapshot : snapshot;
      const { invalid, badPages } = invalidDocs(after, mongoLocation);
      report.invalid = [...skipped, ...invalid];
      const createdPages = new Set(todo.filter((t) => t.target.kind === "page").map((t) => (t.target as { key: string }).key));
      report.pages = PAGE_KEYS.map((key) => ({
        key,
        label: PAGE_META[key].label,
        status: badPages.has(key) || after.pages[key] === undefined ? "invalid" : createdPages.has(key) ? "created" : "ok",
      }));
      report.collections = rows(after, createdCounts, notes);
      if (after.settings === undefined) report.invalid.unshift({ label: "Site settings", errors: ["Missing, and the bundled settings couldn't be created."] });
      return finish(report, started, after);
    });
  } catch (error) {
    const message = redactCredentials(error instanceof Error ? error.message : String(error));
    console.error("[admin] Sync failed:", message);
    return finish({ ...report, failure: message }, started, null);
  }
}

export async function runSync(user: SessionUser): Promise<SyncReport> {
  const started = Date.now();
  return usesMongoContent() ? syncMongo(user, started) : syncJson(started);
}

/** Everything the site reads, in the shape of the files in /content (for "Download backup"). */
export async function exportContent() {
  const snapshot = await readSnapshot();
  return {
    exportedAt: new Date().toISOString(),
    source: usesMongoContent() ? `mongo (${describeMongoTarget()})` : "json (content/)",
    format: "settings → content/settings.json, pages.<key> → content/pages/<key>.json, collections.<name> → its file in content/ (see src/lib/content/registry.ts).",
    settings: snapshot.settings,
    pages: snapshot.pages,
    collections: snapshot.collections,
  };
}
