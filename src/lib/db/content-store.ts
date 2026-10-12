import type mongoose from "mongoose";
import type { Model } from "mongoose";
import type { DocTarget } from "@/lib/admin/backend/types";
import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import { collectionModels, PageModel, SettingsModel, SETTINGS_KEY } from "@/lib/models";
import { CONTENT_COLLECTIONS, PAGES_COLLECTION, SETTINGS_COLLECTION } from "@/lib/models/names";
import { pageSchemas, type PageKey } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   Site content in MongoDB as plain documents, shaped exactly like
   the files in /content (no _id, __v or Mongoose timestamps).
   Shared by the Studio's Mongo backend, Sync and the seed script;
   no "server-only" so the script can use it.

   Writes go through the native driver with the whole value the
   Studio validated (validateContent runs the same zod schemas as
   the models' pre-validate hook), and only touch what changed: one
   document for settings or a page, changed / added / removed items
   for a collection.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;
type Db = mongoose.mongo.Db;
type Session = mongoose.mongo.ClientSession;
type AnyBulkWriteOperation = mongoose.mongo.AnyBulkWriteOperation;

const PAGE_KEYS = Object.keys(pageSchemas) as PageKey[];

function modelOf(target: DocTarget): Model<unknown> {
  if (target.kind === "settings") return SettingsModel as unknown as Model<unknown>;
  if (target.kind === "page") return PageModel as unknown as Model<unknown>;
  return collectionModels[target.name];
}

/** Names of the fields Mongoose's `timestamps` option writes, or [] when off. */
export function stampFields(model: Model<unknown>): string[] {
  const option = model.schema.get("timestamps") as boolean | { createdAt?: string | boolean; updatedAt?: string | boolean } | undefined;
  if (!option) return [];
  if (option === true) return ["createdAt", "updatedAt"];
  const name = (value: string | boolean | undefined, fallback: string) => (typeof value === "string" ? value : value === false ? null : fallback);
  return [name(option.createdAt, "createdAt"), name(option.updatedAt, "updatedAt")].filter((field): field is string => !!field);
}

interface Place {
  collection: string;
  /** Top-level fields that are storage, not content. */
  internal: string[];
  /** [createdAt, updatedAt] field names, when the model keeps them. */
  stamps: string[];
}

function placeOf(target: DocTarget): Place {
  const stamps = stampFields(modelOf(target));
  if (target.kind === "settings") return { collection: SETTINGS_COLLECTION, internal: ["_id", "__v", "key", ...stamps], stamps };
  // A page's `key` is part of its content (pages/<key>.json has it); settings.json has none.
  if (target.kind === "page") return { collection: PAGES_COLLECTION, internal: ["_id", "__v", ...stamps], stamps };
  return { collection: CONTENT_COLLECTIONS[target.name], internal: ["_id", "__v", ...stamps], stamps };
}

let namesChecked = false;
/** The collection names in models/names.ts must be the models' own. */
export function checkCollectionNames(): void {
  if (namesChecked) return;
  const wrong: string[] = [];
  const expect = (model: Model<unknown>, name: string) => {
    if (model.collection.collectionName !== name) wrong.push(`${model.modelName}: "${model.collection.collectionName}" ≠ "${name}"`);
  };
  expect(SettingsModel as unknown as Model<unknown>, SETTINGS_COLLECTION);
  expect(PageModel as unknown as Model<unknown>, PAGES_COLLECTION);
  for (const name of collectionNames) expect(collectionModels[name], CONTENT_COLLECTIONS[name]);
  if (wrong.length > 0) throw new Error(`src/lib/models/names.ts is out of date: ${wrong.join("; ")}`);
  namesChecked = true;
}

/** A stored value without Mongo's `_id`s (at any depth). */
function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object" && !(value instanceof Date) && value.constructor === Object) {
    const out: Raw = {};
    for (const [key, inner] of Object.entries(value)) if (key !== "_id") out[key] = stripIds(inner);
    return out;
  }
  return value;
}

/** A stored document as content: the same shape as its JSON file. */
function toContent(doc: Raw, internal: string[]): Raw {
  const out: Raw = {};
  for (const [key, value] of Object.entries(doc)) if (!internal.includes(key)) out[key] = stripIds(value);
  return out;
}

const SORT = { order: 1, _id: 1 } as const;

export interface StoredContent {
  snapshot: ContentSnapshot;
  /** Settings and pages that have no document yet (collections may simply be empty). */
  missing: DocTarget[];
}

/** Every content document in the database, as the site's content files would hold it. */
export async function readStoredContent(db: Db, options: { session?: Session } = {}): Promise<StoredContent> {
  checkCollectionNames();
  const { session } = options;
  const settingsPlace = placeOf({ kind: "settings" });
  const pagesPlace = placeOf({ kind: "page", key: PAGE_KEYS[0] });

  const [settings, pages, ...lists] = await Promise.all([
    db.collection(settingsPlace.collection).findOne({ key: SETTINGS_KEY }, { session }),
    db.collection(pagesPlace.collection).find({ key: { $in: PAGE_KEYS } }, { session }).toArray(),
    ...collectionNames.map((name) =>
      db.collection(CONTENT_COLLECTIONS[name]).find({}, { session }).sort(SORT).toArray(),
    ),
  ]);

  const missing: DocTarget[] = [];
  const snapshot: ContentSnapshot = {
    settings: undefined,
    pages: {} as Record<PageKey, unknown>,
    collections: {} as Record<CollectionName, unknown[]>,
  };
  if (settings) snapshot.settings = toContent(settings, settingsPlace.internal);
  else missing.push({ kind: "settings" });

  const byKey = new Map(pages.map((page) => [String(page.key), page]));
  for (const key of PAGE_KEYS) {
    const page = byKey.get(key);
    if (page) snapshot.pages[key] = toContent(page, pagesPlace.internal);
    else missing.push({ kind: "page", key });
  }

  collectionNames.forEach((name, i) => {
    const { internal } = placeOf({ kind: "collection", name });
    snapshot.collections[name] = lists[i].map((doc) => toContent(doc, internal));
  });
  return { snapshot, missing };
}

/** `$set` / `$unset` turning `before` (null: no document) into `next`, plus Mongoose-style timestamps. */
function updateFor(next: Raw, before: Raw | null, identity: Raw, place: Place, now: Date) {
  const $set: Raw = { ...next, ...identity };
  const [created, updated] = place.stamps;
  if (updated && !(updated in next)) $set[updated] = now;
  const update: Raw = { $set };
  if (before) {
    const gone = Object.keys(before).filter((key) => !(key in next) && !(key in identity));
    if (gone.length > 0) update.$unset = Object.fromEntries(gone.map((key) => [key, ""]));
  }
  if (created && !(created in next)) update.$setOnInsert = { [created]: now };
  return update;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes `next` for `target` over `before` (what was read, in content shape).
 * Settings and pages: one upsert. Collections: deletes items that are gone,
 * upserts the ones that are new or changed, leaves the rest alone.
 */
export async function writeStoredDoc(
  db: Db,
  target: DocTarget,
  next: unknown,
  before: unknown,
  options: { session?: Session } = {},
): Promise<void> {
  checkCollectionNames();
  const place = placeOf(target);
  const collection = db.collection(place.collection);
  const now = new Date();
  const { session } = options;

  if (target.kind !== "collection") {
    const identity = target.kind === "settings" ? { key: SETTINGS_KEY } : { key: target.key };
    const value = next as Raw;
    await collection.updateOne(identity, updateFor(value, (before as Raw | undefined) ?? null, identity, place, now), {
      upsert: true,
      session,
    });
    return;
  }

  const { key } = collectionRegistry[target.name];
  const idOf = (item: Raw) => String(item[key]);
  const previous = new Map(((before as Raw[] | undefined) ?? []).map((item) => [idOf(item), item]));
  const kept = new Set((next as Raw[]).map(idOf));
  const operations: AnyBulkWriteOperation[] = [];
  for (const id of previous.keys()) {
    if (!kept.has(id)) operations.push({ deleteOne: { filter: { [key]: id } } });
  }
  for (const item of next as Raw[]) {
    const id = idOf(item);
    const was = previous.get(id) ?? null;
    if (was && same(was, item)) continue;
    const identity = { [key]: id };
    operations.push({ updateOne: { filter: identity, update: updateFor(item, was, identity, place, now), upsert: true } });
  }
  if (operations.length > 0) await collection.bulkWrite(operations, { ordered: true, session });
}
