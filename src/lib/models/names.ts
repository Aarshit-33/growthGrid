import type { DocTarget } from "@/lib/admin/backend/types";
import type { CollectionName } from "@/lib/content/registry";

/* ─────────────────────────────────────────────────────────────
   MongoDB collection names for site content, without loading
   Mongoose (the Studio shows them as a document's location).
   The Studio's Mongo backend checks them against the models on
   first use, so a renamed model collection fails loudly.
   ───────────────────────────────────────────────────────────── */

export const SETTINGS_COLLECTION = "settings";
export const PAGES_COLLECTION = "pages";
/** Studio History (one document per change). */
export const HISTORY_COLLECTION = "studio_history";
/** The Studio's cross-instance write lock. */
export const LOCKS_COLLECTION = "studio_locks";

export const CONTENT_COLLECTIONS: Record<CollectionName, string> = {
  services: "services",
  projects: "projects",
  insights: "insights",
  testimonials: "testimonials",
  team: "team",
  faqs: "faqs",
  technologies: "technologies",
  process: "process_steps",
  principles: "principles",
  audiences: "audiences",
  problems: "problems",
  stats: "stats",
};

/** Where a content document lives in MongoDB, for the Studio ("MongoDB: pages/home"). */
export function mongoLocation(target: DocTarget): string {
  if (target.kind === "settings") return `MongoDB: ${SETTINGS_COLLECTION}`;
  if (target.kind === "page") return `MongoDB: ${PAGES_COLLECTION}/${target.key}`;
  return `MongoDB: ${CONTENT_COLLECTIONS[target.name]}`;
}
