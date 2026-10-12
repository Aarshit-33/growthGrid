import "server-only";
import { cache } from "react";
import { z, type ZodType } from "zod";
import { withBrandFiles } from "@/lib/brand-files";
import type { CollectionName } from "@/lib/content/registry";
import { usesMongoContent } from "@/lib/db/uri";
import {
  audienceSchema,
  faqSchema,
  insightSchema,
  pageSchemas,
  principleSchema,
  problemSchema,
  processStepSchema,
  projectSchema,
  serviceSchema,
  settingsSchema,
  statSchema,
  teamMemberSchema,
  technologyCategorySchema,
  testimonialSchema,
  type InsightWithMeta,
  type PageContent,
  type PageKey,
  type Settings,
  type Technology,
  type TechnologyCategory,
} from "@/lib/schemas";
import { readingTime } from "@/lib/utils/reading-time";
import { typeset } from "@/lib/utils/text";
import type { ContentSource, SavedAt } from "./source";

/* ─────────────────────────────────────────────────────────────
   Content repository — the ONLY module pages and components use
   to read content.

   • Source is chosen by CONTENT_SOURCE ("json" default | "mongo"),
     so switching to MongoDB needs zero page changes.
   • Every document is validated with Zod on the way out, so the
     UI can trust its types regardless of where data came from.
   • Items switched off in the admin (`published: false`) are
     dropped here, so pages, static params, the sitemap and the
     navigation all skip them.
   • Reads are deduplicated per request with React `cache`.
   ───────────────────────────────────────────────────────────── */

const getSource = cache(async (): Promise<ContentSource> => {
  if (usesMongoContent()) {
    return (await import("./mongo-source")).mongoSource;
  }
  return (await import("./json-source")).jsonSource;
});

function parse<T>(schema: ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid content in ${label}:\n${z.prettifyError(result.error)}`);
  }
  // Typographic quotes (we're → we’re) so editors can type plain ASCII.
  return typeset(result.data);
}

/** Hidden items stay in the content (and the admin) but never reach the site. */
const isPublished = (item: { published?: boolean }) => item.published !== false;

async function load<T extends { published?: boolean }>(name: CollectionName, schema: ZodType<T>): Promise<T[]> {
  const source = await getSource();
  const items = parse(z.array(schema), await source.getCollection(name), `"${name}" (${source.name})`);
  return items.filter(isPublished);
}

const byOrder = <T extends { order: number }>(items: T[]) =>
  [...items].sort((a, b) => a.order - b.order);

/* ── Settings & pages ─────────────────────────────────────── */

export const getSettings = cache(async (): Promise<Settings> => {
  const source = await getSource();
  // Brand images as they ship: an SVG twin, the file's own size, a ?v= fingerprint (brand-files.ts).
  const settings = await withBrandFiles(parse(settingsSchema, await source.getSettings(), `settings (${source.name})`));
  // Per-deployment override (e.g. a staging host). Content keeps the production URL.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return envUrl && URL.canParse(envUrl) ? { ...settings, url: envUrl } : settings;
});

export const getPage = cache(async <K extends PageKey>(key: K): Promise<PageContent<K>> => {
  const source = await getSource();
  let raw = await source.getPage(key);
  let label: string = source.name;
  // A page added in a release but not yet in the database (Studio › Sync
  // creates it): show the bundled copy instead of failing the whole page.
  if (!raw && source.name !== "json") {
    raw = await (await import("./json-source")).jsonSource.getPage(key);
    label = `${source.name}, bundled fallback`;
    if (raw) console.warn(`[content] page "${key}" isn't in ${source.name} yet; using content/pages/${key}.json. Run Studio › Sync content to add it.`);
  }
  if (!raw) throw new Error(`Missing page content for "${key}" (${source.name})`);
  const schema = pageSchemas[key] as unknown as ZodType<PageContent<K>>;
  return parse(schema, raw, `page "${key}" (${label})`);
});

/** When pages and services were last saved, where the store records it (MongoDB); empty for JSON. */
export const getSavedAt = cache(async (): Promise<SavedAt> => {
  const source = await getSource();
  return (await source.getSavedAt?.()) ?? { pages: {}, services: {} };
});

/* ── Services ─────────────────────────────────────────────── */

export const getServices = cache(async () => byOrder(await load("services", serviceSchema)));

export const getServiceBySlug = cache(async (slug: string) =>
  (await getServices()).find((s) => s.slug === slug),
);

/* ── Projects (case studies) ──────────────────────────────── */

export const getProjects = cache(async () => byOrder(await load("projects", projectSchema)));

export const getFeaturedProjects = cache(async () =>
  (await getProjects()).filter((p) => p.featured),
);

export const getProjectBySlug = cache(async (slug: string) =>
  (await getProjects()).find((p) => p.slug === slug),
);

export const getProjectsForService = cache(async (serviceSlug: string) =>
  (await getProjects()).filter((p) => p.services.includes(serviceSlug)),
);

/* ── Insights (articles) ──────────────────────────────────── */

export const getInsights = cache(async (): Promise<InsightWithMeta[]> => {
  const items = await load("insights", insightSchema);
  return items
    .map((item) => ({ ...item, readingTime: readingTime(item.body) }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
});

export const getInsightBySlug = cache(async (slug: string) =>
  (await getInsights()).find((i) => i.slug === slug),
);

/* ── People & proof ───────────────────────────────────────── */

export const getTestimonials = cache(async () => {
  const [testimonials, projects] = await Promise.all([load("testimonials", testimonialSchema), getProjects()]);
  // A quote only links to its case study while that case study is live.
  const live = new Set(projects.map((project) => project.slug));
  return byOrder(testimonials).map((t) => (t.project && !live.has(t.project) ? { ...t, project: null } : t));
});

export const getTestimonialById = cache(async (id: string) =>
  (await getTestimonials()).find((t) => t.id === id),
);

export const getTeam = cache(async () => byOrder(await load("team", teamMemberSchema)));

export const getTeamMember = cache(async (slug: string) =>
  (await getTeam()).find((m) => m.slug === slug),
);

export const getStats = cache(async () => byOrder(await load("stats", statSchema)));

/* ── FAQs ─────────────────────────────────────────────────── */

export type FaqScope = "home" | "services" | "contact" | "about" | `service:${string}`;

/** Every published question, in order (pages pick theirs by scope). */
export const getAllFaqs = cache(async () => byOrder(await load("faqs", faqSchema)));

export const getFaqs = cache(async (scope: FaqScope) =>
  (await getAllFaqs()).filter((f) => f.scopes.includes(scope)),
);

/* ── Technology ───────────────────────────────────────────── */

export const getTechnologies = cache(async () =>
  byOrder(await load("technologies", technologyCategorySchema))
    .map((category) => ({ ...category, technologies: category.technologies.filter(isPublished) }))
    .filter((category) => category.technologies.length > 0),
);

export type TechnologyEntry = Technology & { category: Pick<TechnologyCategory, "key" | "name" | "color"> };

/** slug → technology (with its category), for resolving references. */
export const getTechnologyIndex = cache(async () => {
  const index = new Map<string, TechnologyEntry>();
  for (const category of await getTechnologies()) {
    for (const tech of category.technologies) {
      index.set(tech.slug, {
        ...tech,
        category: { key: category.key, name: category.name, color: category.color },
      });
    }
  }
  return index;
});

/** Resolve technology slugs, silently skipping unknown ones (validated at build). */
export async function resolveTechnologies(slugs: string[]): Promise<TechnologyEntry[]> {
  const index = await getTechnologyIndex();
  return slugs.flatMap((slug) => {
    const entry = index.get(slug);
    return entry ? [entry] : [];
  });
}

/* ── Studio narrative collections ─────────────────────────── */

export const getProcess = cache(async () => byOrder(await load("process", processStepSchema)));
export const getPrinciples = cache(async () => byOrder(await load("principles", principleSchema)));
export const getAudiences = cache(async () => byOrder(await load("audiences", audienceSchema)));
export const getProblems = cache(async () => byOrder(await load("problems", problemSchema)));
