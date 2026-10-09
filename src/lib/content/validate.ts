import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { svgTwin } from "@/lib/brand";
import {
  pageSchemas,
  settingsSchema,
  type Block,
  type Faq,
  type ImageAsset,
  type Insight,
  type PageKey,
  type Project,
  type Service,
  type Settings,
  type TeamMember,
  type TechnologyCategory,
  type Testimonial,
} from "@/lib/schemas";
import { FEED_PATH, LLMS_FULL_PATH, LLMS_PATH } from "@/lib/seo/paths";
import { plainText } from "@/lib/utils/text";
import { rawCollections, rawPages, rawSettings } from "./raw";
import { collectionNames, collectionRegistry, type CollectionName } from "./registry";

/* ─────────────────────────────────────────────────────────────
   Content validation: schema checks + referential integrity +
   internal-link, asset and SEO checks. Runs before every build
   (`prebuild`) and before seeding MongoDB, so broken content can
   never reach production.
   ───────────────────────────────────────────────────────────── */

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  counts: Record<string, number>;
}

/** Every raw content document: what the JSON files (or a database) hold. */
export interface ContentSnapshot {
  settings: unknown;
  pages: Record<PageKey, unknown>;
  collections: Record<CollectionName, unknown[]>;
}

interface Options {
  /** Project root (defaults to cwd). Used to resolve /public assets. */
  root?: string;
  /** Verify that every referenced image exists in /public. */
  checkAssets?: boolean;
  /** Content to check. Defaults to the JSON bundled from /content; the admin passes an edited copy before saving. */
  content?: ContentSnapshot;
}

const indent = (text: string) =>
  text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

const MARKDOWN_LINK = /\[[^\]]+\]\(([^)\s]+)\)/g;

/** Longest FAQ answer, in words, that still reads well aloud (voice answers average ~30). */
const SPOKEN_ANSWER_WORDS = 80;

/** Recursively collect every `href` value and markdown link inside a value. */
function collectLinks(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    for (const match of value.matchAll(MARKDOWN_LINK)) out.push(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectLinks(v, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "href" && typeof v === "string") out.push(v);
      else collectLinks(v, out);
    }
  }
  return out;
}

function blockImages(body: Block[]): ImageAsset[] {
  return body.flatMap((b) => (b.type === "image" ? [b.image] : []));
}

export function validateContent(options: Options = {}): ValidationReport {
  const root = options.root ?? process.cwd();
  const checkAssets = options.checkAssets ?? true;
  const content = options.content ?? { settings: rawSettings, pages: rawPages, collections: rawCollections };
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};

  /* ── 1. Schema validation ─────────────────────────────── */

  const settingsResult = settingsSchema.safeParse(content.settings);
  if (!settingsResult.success) {
    errors.push(`settings.json\n${indent(z.prettifyError(settingsResult.error))}`);
  }

  const parsed: Partial<Record<CollectionName, unknown[]>> = {};
  for (const name of collectionNames) {
    const { schema, key, file } = collectionRegistry[name];
    const result = z.array(schema).safeParse(content.collections[name]);
    if (!result.success) {
      errors.push(`${file}\n${indent(z.prettifyError(result.error))}`);
      continue;
    }
    parsed[name] = result.data;
    counts[name] = result.data.length;

    const seen = new Set<string>();
    for (const item of result.data as Record<string, unknown>[]) {
      const id = String(item[key]);
      if (seen.has(id)) errors.push(`${file}: duplicate ${key} "${id}"`);
      seen.add(id);
    }
  }

  const pages: Partial<Record<PageKey, unknown>> = {};
  for (const key of Object.keys(pageSchemas) as PageKey[]) {
    const result = pageSchemas[key].safeParse(content.pages[key]);
    if (!result.success) {
      errors.push(`pages/${key}.json\n${indent(z.prettifyError(result.error))}`);
      continue;
    }
    if (result.data.key !== key) {
      errors.push(`pages/${key}.json: "key" must be "${key}" (found "${result.data.key}")`);
    }
    pages[key] = result.data;
  }
  counts.pages = Object.keys(pages).length;

  // Referential checks need structurally valid data.
  if (errors.length > 0) return { errors, warnings, counts };

  const settings = settingsResult.data as Settings;
  const services = parsed.services as Service[];
  const projects = parsed.projects as Project[];
  const insights = parsed.insights as Insight[];
  const testimonials = parsed.testimonials as Testimonial[];
  const team = parsed.team as TeamMember[];
  const faqs = parsed.faqs as Faq[];
  const technologies = parsed.technologies as TechnologyCategory[];

  const serviceSlugs = new Set(services.map((s) => s.slug));
  const projectSlugs = new Set(projects.map((p) => p.slug));
  const testimonialIds = new Set(testimonials.map((t) => t.id));
  const teamSlugs = new Set(team.map((m) => m.slug));
  const techSlugs = new Set<string>();
  for (const category of technologies) {
    for (const tech of category.technologies) {
      if (techSlugs.has(tech.slug)) errors.push(`technologies.json: duplicate technology slug "${tech.slug}"`);
      techSlugs.add(tech.slug);
    }
  }

  const expect = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };

  /* ── 2. Referential integrity ─────────────────────────── */

  for (const s of services) {
    s.technologies.forEach((t) =>
      expect(techSlugs.has(t), `services.json › ${s.slug}: unknown technology "${t}"`),
    );
    s.relatedProjects.forEach((p) =>
      expect(projectSlugs.has(p), `services.json › ${s.slug}: unknown related project "${p}"`),
    );
  }

  for (const p of projects) {
    p.services.forEach((s) =>
      expect(serviceSlugs.has(s), `projects.json › ${p.slug}: unknown service "${s}"`),
    );
    p.stack.forEach((t) =>
      expect(techSlugs.has(t), `projects.json › ${p.slug}: unknown technology "${t}"`),
    );
    if (p.testimonial) {
      expect(
        testimonialIds.has(p.testimonial),
        `projects.json › ${p.slug}: unknown testimonial "${p.testimonial}"`,
      );
    }
  }

  for (const t of testimonials) {
    if (t.project) {
      expect(projectSlugs.has(t.project), `testimonials.json › ${t.id}: unknown project "${t.project}"`);
    }
  }

  for (const i of insights) {
    expect(teamSlugs.has(i.author), `insights.json › ${i.slug}: unknown author "${i.author}"`);
  }

  for (const f of faqs) {
    for (const scope of f.scopes) {
      if (scope.startsWith("service:")) {
        const slug = scope.slice("service:".length);
        expect(serviceSlugs.has(slug), `faqs.json › ${f.id}: unknown service scope "${scope}"`);
      }
    }
  }

  /* ── 3. Internal links resolve to real routes ─────────── */

  const routes = new Set<string>([
    "/",
    "/services",
    "/work",
    "/about",
    "/insights",
    "/contact",
    "/privacy",
    "/terms",
    // Machine-readable files (route handlers), linkable from content such as the footer.
    FEED_PATH,
    LLMS_PATH,
    LLMS_FULL_PATH,
    ...[...serviceSlugs].map((s) => `/services/${s}`),
    ...[...projectSlugs].map((s) => `/work/${s}`),
    ...insights.map((i) => `/insights/${i.slug}`),
  ]);
  // Hidden items keep their routes here (so hiding one never blocks a save),
  // but a link to one would 404 on the site: flag it.
  const hiddenRoutes = new Set<string>([
    ...services.filter((s) => s.published === false).map((s) => `/services/${s.slug}`),
    ...projects.filter((p) => p.published === false).map((p) => `/work/${p.slug}`),
    ...insights.filter((i) => i.published === false).map((i) => `/insights/${i.slug}`),
  ]);

  const linkSources: [string, unknown][] = [
    ["settings.json", settings],
    ...Object.entries(pages).map(([k, v]) => [`pages/${k}.json`, v] as [string, unknown]),
    ...insights.map((i) => [`insights.json › ${i.slug}`, i.body] as [string, unknown]),
  ];
  for (const [label, value] of linkSources) {
    for (const href of collectLinks(value)) {
      if (!href.startsWith("/")) continue;
      const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
      expect(routes.has(path), `${label}: internal link "${href}" does not match any page`);
      if (hiddenRoutes.has(path)) warnings.push(`${label}: links to "${href}", which is hidden from the site`);
    }
  }

  /* ── 4. Referenced images exist in /public ────────────── */

  if (checkAssets) {
    const exists = (src: string) => existsSync(join(root, "public", src));
    const images: [string, ImageAsset][] = [
      ...projects.flatMap((p) =>
        [p.cover, ...p.gallery].map((img) => [`projects.json › ${p.slug}`, img] as [string, ImageAsset]),
      ),
      ...insights.flatMap((i) =>
        [i.cover, ...blockImages(i.body)].map(
          (img) => [`insights.json › ${i.slug}`, img] as [string, ImageAsset],
        ),
      ),
      ...team.flatMap((m) => (m.avatar ? [[`team.json › ${m.slug}`, m.avatar] as [string, ImageAsset]] : [])),
    ];
    for (const [label, img] of images) {
      if (img.src.startsWith("/") && !exists(img.src)) {
        errors.push(`${label}: image not found at public${img.src}`);
      }
    }
    // On the site an SVG with the same name takes over from a brand image
    // (src/lib/brand-files.ts), so either file will do.
    const brandImages = [
      ["settings.json › brand.logo", settings.brand?.logo.image],
      ["settings.json › brand.logo.mark", settings.brand?.logo.mark],
      ["settings.json › brand.logo.stacked", settings.brand?.logo.stacked],
      ["settings.json › brand.app.icon", settings.brand?.app.icon],
    ] as const;
    for (const [label, img] of brandImages) {
      if (!img?.src.startsWith("/")) continue;
      const twin = svgTwin(img.src);
      if (!exists(img.src) && !(twin && exists(twin))) {
        errors.push(`${label}: image not found at public${img.src}${twin ? ` (or public${twin})` : ""}`);
      }
    }
  }

  /* ── 5. SEO hygiene (warnings) ────────────────────────── */

  if (settings.seo.discourageSearchEngines) {
    warnings.push("settings.json › seo: search engines are asked not to index the site (Discourage search engines is on)");
  }

  const template = settings.seo.titleTemplate;
  const seoEntries: [string, { title: string; description: string }][] = [
    ...Object.entries(pages).flatMap(([k, v]) => {
      const seo = (v as { seo?: { title: string; description: string } }).seo;
      return seo ? [[`pages/${k}.json`, seo] as [string, typeof seo]] : [];
    }),
    ...services.map((s) => [`services.json › ${s.slug}`, s.seo] as [string, Service["seo"]]),
    ...projects.map((p) => [`projects.json › ${p.slug}`, p.seo] as [string, Project["seo"]]),
    ...insights.map((i) => [`insights.json › ${i.slug}`, i.seo] as [string, Insight["seo"]]),
  ];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  for (const [label, seo] of seoEntries) {
    const isHome = label === "pages/home.json";
    const full = isHome ? seo.title : template.replace("%s", seo.title);
    if (full.length > 65) {
      warnings.push(`${label}: rendered title is ${full.length} chars (search engines show ~60): "${full}"`);
    }
    const dupTitle = titles.get(seo.title);
    if (dupTitle) warnings.push(`${label}: SEO title duplicates ${dupTitle}`);
    titles.set(seo.title, label);
    const dupDesc = descriptions.get(seo.description);
    if (dupDesc) warnings.push(`${label}: meta description duplicates ${dupDesc}`);
    descriptions.set(seo.description, label);
  }

  /* ── 6. Answer-readiness: voice and AI answers (warnings) ── */

  if (settings.seo.blockAiAnswers) {
    warnings.push(
      "settings.json › seo: AI answer engines (ChatGPT search, Perplexity, Claude…) are asked not to read the site, so they can't cite it (Block AI answer engines is on)",
    );
  }
  // Voice assistants read a single short answer aloud, and FAQ rich results and
  // AI engines lift question-and-answer pairs as they are written.
  for (const f of faqs.filter((faq) => faq.published !== false)) {
    if (!f.question.trim().endsWith("?")) {
      warnings.push(`faqs.json › ${f.id}: end the question with "?" and word it the way people ask it aloud`);
    }
    const words = plainText(f.answer).split(/\s+/).filter(Boolean).length;
    if (words > SPOKEN_ANSWER_WORDS) {
      warnings.push(
        `faqs.json › ${f.id}: the answer is ${words} words; voice assistants read about ${SPOKEN_ANSWER_WORDS} at most, so open with a one-sentence answer and keep it short`,
      );
    }
  }

  return { errors, warnings, counts };
}
