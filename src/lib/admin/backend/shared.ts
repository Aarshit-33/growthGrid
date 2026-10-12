import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import { pageSchemas, type PageKey } from "@/lib/schemas";
import type { DocTarget } from "./types";

/* Snapshot helpers shared by the store and both backends. */

export const PAGE_KEYS = Object.keys(pageSchemas) as PageKey[];

/** Every content document: settings, each page, each collection. */
export const allTargets = (): DocTarget[] => [
  { kind: "settings" },
  ...PAGE_KEYS.map((key) => ({ kind: "page", key }) as const),
  ...collectionNames.map((name) => ({ kind: "collection", name }) as const),
];

/** No settings or pages, every collection empty. */
export const emptySnapshot = (): ContentSnapshot => ({
  settings: undefined,
  pages: {} as Record<PageKey, unknown>,
  collections: Object.fromEntries(collectionNames.map((name) => [name, []])) as unknown as Record<CollectionName, unknown[]>,
});

/** What a snapshot holds for `target`. */
export function pick(snapshot: ContentSnapshot, target: DocTarget): unknown {
  if (target.kind === "settings") return snapshot.settings;
  if (target.kind === "page") return snapshot.pages[target.key];
  return snapshot.collections[target.name];
}

/** Puts `value` where `target` lives in a snapshot. */
export function place(snapshot: ContentSnapshot, target: DocTarget, value: unknown) {
  if (target.kind === "settings") snapshot.settings = value;
  else if (target.kind === "page") snapshot.pages[target.key] = value;
  else snapshot.collections[target.name] = value as unknown[];
}

/** Path inside /content, e.g. "pages/home.json" (the JSON file for a document). */
export function fileLabel(target: DocTarget): string {
  switch (target.kind) {
    case "settings":
      return "settings.json";
    case "page":
      return `pages/${target.key}.json`;
    case "collection":
      return collectionRegistry[target.name].file;
  }
}
