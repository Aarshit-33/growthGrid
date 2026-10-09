import { HOME_SECTION_IDS, type HomeSectionConfig, type HomeSectionId } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   Home page layout: which sections render, in what order.
   Stored in content/pages/home.json (`sections`) and edited from
   the admin. Shared by the home page and the admin so both read
   the layout the same way.
   ───────────────────────────────────────────────────────────── */

/** Sections that carry a numbered label ("01", "02"…); renumbered after reordering. */
export const NUMBERED_HOME_SECTIONS: ReadonlySet<HomeSectionId> = new Set<HomeSectionId>([
  "problem",
  "services",
  "process",
  "aftercare",
  "work",
  "principles",
  "technology",
  "audiences",
  "testimonials",
  "insights",
  "faq",
]);

/** The closing call to action: the journey's summit, always last. */
export const PINNED_LAST_SECTION: HomeSectionId = "cta";

/** Latest insights on the home page. The accordion handles any number; this keeps the page focused. */
export const HOME_INSIGHTS = 12;

/**
 * The full, ordered layout: listed sections first (in their order), then any
 * the list doesn't mention (default order, switched on), so a section added
 * in code shows up without touching the content. The CTA always ends the page.
 */
export function resolveHomeSections(config: readonly HomeSectionConfig[] | undefined): HomeSectionConfig[] {
  const seen = new Set<HomeSectionId>();
  const list: HomeSectionConfig[] = [];
  for (const { id, enabled } of config ?? []) {
    if (seen.has(id) || !HOME_SECTION_IDS.includes(id)) continue;
    seen.add(id);
    list.push({ id, enabled });
  }
  for (const id of HOME_SECTION_IDS) {
    if (!seen.has(id)) list.push({ id, enabled: true });
  }
  return [
    ...list.filter((section) => section.id !== PINNED_LAST_SECTION),
    ...list.filter((section) => section.id === PINNED_LAST_SECTION),
  ];
}
