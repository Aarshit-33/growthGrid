import type { CollectionName } from "@/lib/content/registry";
import type { PageKey } from "@/lib/schemas";

/**
 * A backing store for site content. Implementations return *raw* documents;
 * the repository (`src/lib/data/index.ts`) validates everything with Zod, so
 * a new source (MongoDB, a headless CMS, an API…) only has to fetch data.
 */
export interface ContentSource {
  readonly name: "json" | "mongo";
  getSettings(): Promise<unknown>;
  getPage(key: PageKey): Promise<unknown | null>;
  getCollection(name: CollectionName): Promise<unknown[]>;
}
