import "server-only";
import type { Model } from "mongoose";
import { stampFields } from "@/lib/db/content-store";
import { connectToDatabase } from "@/lib/db/mongoose";
import { collectionModels, PageModel, SettingsModel, SETTINGS_KEY } from "@/lib/models";
import type { PageKey } from "@/lib/schemas";
import type { ContentSource, SavedAt } from "./source";

type Raw = Record<string, unknown>;

/** A Date as an ISO string, or undefined when missing or invalid. */
const iso = (value: unknown) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined);

/** `id → last saved` for a model, read from the field its `timestamps` option writes. */
async function savedTimes(model: Model<unknown>, idField: string): Promise<Record<string, string>> {
  const updated = stampFields(model)[1];
  if (!updated) return {};
  const docs = await model.find({}, { [idField]: 1, [updated]: 1 }).lean<Raw[]>();
  const out: Record<string, string> = {};
  for (const doc of docs) {
    const at = iso(doc[updated]);
    if (at) out[String(doc[idField])] = at;
  }
  return out;
}

/**
 * MongoDB source (CONTENT_SOURCE=mongo). Returns lean documents; `_id`,
 * `__v` and timestamps are stripped by the Zod schemas in the repository.
 * Seed the database from the JSON files with `npm run seed`.
 */
export const mongoSource: ContentSource = {
  name: "mongo",
  async getSettings() {
    await connectToDatabase();
    return SettingsModel.findOne({ key: SETTINGS_KEY }).lean();
  },
  async getPage(key) {
    await connectToDatabase();
    return PageModel.findOne({ key }).lean();
  },
  async getCollection(name) {
    await connectToDatabase();
    // A stable order: by `order` where the collection has one, then insertion.
    return collectionModels[name].find().sort({ order: 1, _id: 1 }).lean();
  },
  // Studio stamps a document only when it actually changed, so these are real
  // "last edited" times (note: `npm run seed` re-stamps everything it writes).
  async getSavedAt(): Promise<SavedAt> {
    await connectToDatabase();
    const [pages, services] = await Promise.all([
      savedTimes(PageModel as unknown as Model<unknown>, "key"),
      savedTimes(collectionModels.services, "slug"),
    ]);
    return { pages: pages as Partial<Record<PageKey, string>>, services };
  },
};
