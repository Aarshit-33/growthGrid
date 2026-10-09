import "server-only";
import { HOME_INSIGHTS } from "@/lib/content/home-sections";
import { collectionNames, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import type { HomeSectionId } from "@/lib/schemas";
import { AFTERCARE_META, COLLECTION_META, isOnHomepage, isPublished } from "./meta";
import type { HomeSectionStatus } from "./types";

/* ─────────────────────────────────────────────────────────────
   Read-only summaries of the content on disk: counts for the
   dashboard and sidebar, and what each homepage section will
   show. Mirrors the filters of the public pages.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

const itemsOf = (snapshot: ContentSnapshot, name: CollectionName): Raw[] =>
  (Array.isArray(snapshot.collections[name]) ? snapshot.collections[name] : []) as Raw[];

export interface CollectionStats {
  total: number;
  hidden: number;
  /** Visible items the homepage shows (null: the collection isn't on the homepage). */
  onHome: number | null;
}

export function collectionStats(snapshot: ContentSnapshot): Record<CollectionName, CollectionStats> {
  const stats = {} as Record<CollectionName, CollectionStats>;
  for (const name of collectionNames) {
    const items = itemsOf(snapshot, name);
    const rule = COLLECTION_META[name].home;
    stats[name] = {
      total: items.length,
      hidden: items.filter((item) => !isPublished(item)).length,
      onHome: rule === "none" ? null : items.filter((item) => isPublished(item) && isOnHomepage(rule, item)).length,
    };
  }
  return stats;
}

/** Visible technologies in a category. */
const visibleTechs = (category: Raw) =>
  (Array.isArray(category.technologies) ? (category.technologies as Raw[]) : []).filter(isPublished).length;

const recordAt = (value: unknown, key: string): Raw => {
  const child = value && typeof value === "object" ? (value as Raw)[key] : undefined;
  return child && typeof child === "object" && !Array.isArray(child) ? (child as Raw) : {};
};

export interface AftercareStats {
  /** Care plan names, in order. */
  plans: string[];
  /** Length of the bug-fix warranty (null: not set). */
  days: number | null;
}

/** The after-launch offer at a glance (the services page's `aftercare`). */
export function aftercareStats(snapshot: ContentSnapshot): AftercareStats {
  const offer = recordAt(recordAt(snapshot, "pages")[AFTERCARE_META.page], AFTERCARE_META.field);
  const plans = recordAt(offer, "plans").items;
  const days = recordAt(offer, "warranty").days;
  return {
    plans: (Array.isArray(plans) ? (plans as unknown[]) : []).flatMap((plan) => {
      const name = plan && typeof plan === "object" ? (plan as Raw).name : undefined;
      return typeof name === "string" && name ? [name] : [];
    }),
    days: typeof days === "number" ? days : null,
  };
}

/** What each homepage section shows right now (same rules as the homepage). */
export function homeSectionStatus(snapshot: ContentSnapshot): Record<HomeSectionId, HomeSectionStatus> {
  const picked = (name: CollectionName) =>
    itemsOf(snapshot, name).filter((item) => isPublished(item) && isOnHomepage(COLLECTION_META[name].home, item)).length;

  const counts: Record<HomeSectionId, number | null> = {
    proof: picked("stats"),
    problem: picked("problems"),
    services: picked("services"),
    process: picked("process"),
    aftercare: aftercareStats(snapshot).plans.length,
    work: picked("projects"),
    principles: picked("principles"),
    technology: itemsOf(snapshot, "technologies").filter((c) => isPublished(c) && visibleTechs(c) > 0).length,
    audiences: picked("audiences"),
    testimonials: picked("testimonials"),
    insights: Math.min(picked("insights"), HOME_INSIGHTS),
    faq: picked("faqs"),
    cta: null,
  };

  const status = {} as Record<HomeSectionId, HomeSectionStatus>;
  for (const [id, count] of Object.entries(counts) as [HomeSectionId, number | null][]) {
    // The proof band always has its industries marquee, and After launch its
    // warranty and handover, so they never empty.
    status[id] = { count, empty: count === 0 && id !== "proof" && id !== "aftercare" };
  }
  return status;
}
