import "server-only";
import { HOME_INSIGHTS } from "@/lib/content/home-sections";
import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import type { HomeSectionId } from "@/lib/schemas";
import { formatDate, localeTag } from "@/lib/utils";
import { COLLECTION_META, isOnHomepage, isPublished } from "./meta";
import { aftercareStats } from "./overview";
import type { ListRow } from "./types";

/* ─────────────────────────────────────────────────────────────
   Collection lists: the rows each list screen shows, in the
   order the site shows them. Only what a row needs travels to
   the browser, not the whole item.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

export const isCollectionName = (name: string): name is CollectionName => (collectionNames as string[]).includes(name);

const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** Value at a dot path ("tab.title"). */
function at(item: Raw, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Raw)[key] : undefined), item);
}

/** An item's thumbnail: its cover, avatar or image. */
export const imageOf = (item: Raw) => {
  for (const key of ["cover", "avatar", "image"]) {
    const src = at(item, `${key}.src`);
    if (typeof src === "string" && src) return src;
  }
  return undefined;
};

/** What an item is called in lists and in History (its title field, else its slug/key). */
export function itemTitle(name: CollectionName, item: Raw): string {
  return text(at(item, COLLECTION_META[name].titleField)) || text(item[collectionRegistry[name].key]) || "Untitled";
}

/** The collection has an item with this slug/key right now. */
export function hasItem(snapshot: ContentSnapshot, name: string, id: string): boolean {
  if (!isCollectionName(name)) return false;
  const items = snapshot.collections[name];
  return Array.isArray(items) && (items as Raw[]).some((item) => String(item[collectionRegistry[name].key]) === id);
}

/** FAQ scope labels: "home" → "Homepage", "service:web-apps" → the service's title. */
function scopeLabels(snapshot: ContentSnapshot, scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  const services = new Map(
    ((snapshot.collections.services ?? []) as Raw[]).map((service) => [text(service.slug), text(service.title)]),
  );
  const fixed: Record<string, string> = { home: "Homepage", services: "Services", about: "About", contact: "Contact" };
  return scopes.map((scope) => {
    const value = text(scope);
    if (fixed[value]) return fixed[value];
    if (value.startsWith("service:")) return services.get(value.slice(8)) || value.slice(8);
    return value;
  });
}

/** Dates read in the site's language (Site settings › Locale); the ISO date until one is set. */
function subtitleOf(name: CollectionName, item: Raw, locale: string): string | undefined {
  const meta = COLLECTION_META[name];
  if (name === "stats") return `${text(item.prefix)}${text(item.value)}${text(item.suffix)}`;
  if (name === "insights") return typeof item.publishedAt === "string" ? (locale ? formatDate(item.publishedAt, locale) : item.publishedAt) : undefined;
  if (name === "projects") return [text(item.category), text(item.year)].filter(Boolean).join(" · ") || undefined;
  if (name === "faqs" || !meta.subtitleField) return undefined;
  return text(at(item, meta.subtitleField)) || undefined;
}

function rowOf(snapshot: ContentSnapshot, name: CollectionName, item: Raw): ListRow {
  const meta = COLLECTION_META[name];
  const key = collectionRegistry[name].key;
  const id = text(item[key]);
  const scopes = Array.isArray(item.scopes) ? item.scopes : [];

  const row: ListRow = {
    id,
    title: itemTitle(name, item),
    subtitle: subtitleOf(name, item, localeTag(text((snapshot.settings as Raw | null)?.locale))),
    published: isPublished(item),
    home: isOnHomepage(meta.home, item),
  };

  const image = imageOf(item);
  if (image) row.image = image;
  const icon = text(item.icon) || text(at(item, "category.icon"));
  if (icon) row.icon = icon;
  const accent = text(item.accent) || text(item.color);
  if (accent) row.accent = accent;

  if (name === "faqs") {
    row.chips = scopeLabels(snapshot, scopes);
    row.homeLocked = scopes.length === 1 && scopes[0] === "home";
  }
  if (name === "insights") {
    const category = text(at(item, "category.label"));
    if (category) row.chips = [category];
  }
  if (name === "technologies") {
    row.children = (Array.isArray(item.technologies) ? (item.technologies as Raw[]) : []).map((tech) => ({
      id: text(tech.slug),
      title: text(tech.name) || text(tech.slug),
      published: isPublished(tech),
    }));
  }
  return row;
}

/** The list's rows, in site order: by `order`, by file position, or newest first. */
export function listRows(snapshot: ContentSnapshot, name: CollectionName): ListRow[] {
  const items = (Array.isArray(snapshot.collections[name]) ? snapshot.collections[name] : []) as Raw[];
  const sort = COLLECTION_META[name].sort;
  const sorted =
    sort === "order"
      ? [...items].sort((a, b) => (typeof a.order === "number" ? a.order : Infinity) - (typeof b.order === "number" ? b.order : Infinity))
      : sort === "date"
        ? [...items].sort((a, b) => text(b.publishedAt).localeCompare(text(a.publishedAt)))
        : items;
  return sorted.map((item) => rowOf(snapshot, name, item));
}

/**
 * Titles of what each homepage section shows, in site order. Same picks as
 * the homepage: visible and on the homepage; technology categories with a
 * visible tool; the latest insights only; every care plan.
 */
export function homeSectionItems(snapshot: ContentSnapshot): Partial<Record<HomeSectionId, string[]>> {
  const items: Partial<Record<HomeSectionId, string[]>> = {};
  for (const name of collectionNames) {
    const { homeSection, home } = COLLECTION_META[name];
    if (!homeSection || home === "none") continue;
    let rows = listRows(snapshot, name).filter((row) => row.published && row.home);
    if (name === "technologies") rows = rows.filter((row) => row.children?.some((child) => child.published));
    if (name === "insights") rows = rows.slice(0, HOME_INSIGHTS);
    items[homeSection] = rows.map((row) => row.title);
  }
  items.aftercare = aftercareStats(snapshot).plans;
  return items;
}
