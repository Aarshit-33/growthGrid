import "server-only";
import { rawCollections, rawPages, rawSettings } from "@/lib/content/raw";
import type { ContentSource } from "./source";

/** Default source: the JSON files in /content, bundled at build time. */
export const jsonSource: ContentSource = {
  name: "json",
  async getSettings() {
    return rawSettings;
  },
  async getPage(key) {
    return rawPages[key] ?? null;
  },
  async getCollection(name) {
    return rawCollections[name] ?? [];
  },
};
