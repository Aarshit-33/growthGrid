import "server-only";
import { connectToDatabase } from "@/lib/db/mongoose";
import { collectionModels, PageModel, SettingsModel, SETTINGS_KEY } from "@/lib/models";
import type { ContentSource } from "./source";

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
    return collectionModels[name].find().lean();
  },
};
