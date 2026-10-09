import "server-only";
import { z, type ZodType } from "zod";
import { collectionRegistry, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";
import { pageSchemas, settingsSchema, type PageKey } from "@/lib/schemas";
import { AFTERCARE_META, BRAND_META, COLLECTION_META } from "./meta";
import type { FormContext, JsonSchema, RefMap, RefOption } from "./types";

/* ─────────────────────────────────────────────────────────────
   Form definitions for the admin editors, derived from the Zod
   schemas (the single source of truth): a field added to a schema
   shows up in the admin with no extra work.
   ───────────────────────────────────────────────────────────── */

const jsonSchemas = new Map<ZodType, JsonSchema>();

export function jsonSchemaOf(schema: ZodType): JsonSchema {
  let result = jsonSchemas.get(schema);
  if (!result) {
    // A plain JSON copy: zod attaches a non-enumerable `~standard` helper (with
    // functions) that React refuses to pass to Client Components.
    const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
    result = JSON.parse(JSON.stringify(generated)) as JsonSchema;
    jsonSchemas.set(schema, result);
  }
  return result;
}

/** Top-level fields each editor leaves to other admin screens. */
export const HIDDEN_FIELDS = {
  /** Order: list drag & drop. Visibility flags: the editor's Visibility panel. */
  collection: ["order", "published", "home"],
  /** `sections`: the Homepage layout screen. */
  page: ["key", "sections"],
  /** `brand`: the Branding screen. */
  settings: [BRAND_META.field] as string[],
};

/** Parts of a page edited on a screen of their own (After launch: the services page's `aftercare`). */
const OWN_SCREEN: Partial<Record<PageKey, string[]>> = {
  [AFTERCARE_META.page]: [AFTERCARE_META.field],
};

/** Where `featured` is the homepage switch, the Visibility panel owns it too. */
const hiddenFor = (name: CollectionName) =>
  COLLECTION_META[name].home === "featured" ? [...HIDDEN_FIELDS.collection, "featured"] : HIDDEN_FIELDS.collection;

type Raw = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const itemsOf = (snapshot: ContentSnapshot, name: CollectionName) =>
  (Array.isArray(snapshot.collections[name]) ? snapshot.collections[name] : []) as Raw[];

function options(snapshot: ContentSnapshot, name: CollectionName, labelField: string): RefOption[] {
  const key = collectionRegistry[name].key;
  return itemsOf(snapshot, name).map((item) => ({
    value: text(item[key]),
    label: text(item[labelField]) || text(item[key]),
    hidden: item.published === false,
  }));
}

function technologyOptions(snapshot: ContentSnapshot): RefOption[] {
  return itemsOf(snapshot, "technologies").flatMap((category) =>
    (Array.isArray(category.technologies) ? (category.technologies as Raw[]) : []).map((tech) => ({
      value: text(tech.slug),
      label: text(tech.name) || text(tech.slug),
      group: text(category.name),
      hidden: tech.published === false || category.published === false,
    })),
  );
}

function faqScopeOptions(snapshot: ContentSnapshot): RefOption[] {
  return [
    { value: "home", label: "Homepage" },
    { value: "services", label: "Services page" },
    { value: "about", label: "About" },
    { value: "contact", label: "Contact" },
    ...itemsOf(snapshot, "services").map((service) => ({
      value: `service:${text(service.slug)}`,
      label: text(service.title) || text(service.slug),
      group: "Service pages",
      hidden: service.published === false,
    })),
  ];
}

/** Choices for fields that point at other content, by field path. */
export function collectionRefs(snapshot: ContentSnapshot, name: CollectionName): RefMap {
  switch (name) {
    case "projects":
      return {
        services: options(snapshot, "services", "title"),
        stack: technologyOptions(snapshot),
        testimonial: options(snapshot, "testimonials", "author"),
      };
    case "services":
      return {
        technologies: technologyOptions(snapshot),
        relatedProjects: options(snapshot, "projects", "title"),
      };
    case "testimonials":
      return { project: options(snapshot, "projects", "title") };
    case "insights":
      return { author: options(snapshot, "team", "name") };
    case "faqs":
      return { scopes: faqScopeOptions(snapshot) };
    default:
      return {};
  }
}

/** Every internal page, suggested in link fields. */
export function siteLinks(snapshot: ContentSnapshot): string[] {
  return [
    "/",
    "/services",
    "/work",
    "/about",
    "/insights",
    "/contact",
    "/privacy",
    "/terms",
    ...itemsOf(snapshot, "services").map((s) => `/services/${text(s.slug)}`),
    ...itemsOf(snapshot, "projects").map((p) => `/work/${text(p.slug)}`),
    ...itemsOf(snapshot, "insights").map((i) => `/insights/${text(i.slug)}`),
  ];
}

export function collectionForm(snapshot: ContentSnapshot, name: CollectionName): FormContext {
  return {
    schema: jsonSchemaOf(collectionRegistry[name].schema),
    refs: collectionRefs(snapshot, name),
    links: siteLinks(snapshot),
    hidden: hiddenFor(name),
  };
}

export function pageForm(snapshot: ContentSnapshot, key: PageKey): FormContext {
  return {
    schema: jsonSchemaOf(pageSchemas[key]),
    refs: {},
    links: siteLinks(snapshot),
    hidden: [...HIDDEN_FIELDS.page, ...(OWN_SCREEN[key] ?? [])],
  };
}

/**
 * The After launch screen: only the services page's after-launch offer, a panel
 * per part (warranty, handover, care plans). The rest of the page rides along
 * untouched, so saving works exactly as on Pages › Services.
 */
export function aftercareForm(snapshot: ContentSnapshot): FormContext {
  return {
    ...pageForm(snapshot, AFTERCARE_META.page),
    focus: AFTERCARE_META.field,
    panels: AFTERCARE_META.panels,
  };
}

export function settingsForm(snapshot: ContentSnapshot): FormContext {
  return { schema: jsonSchemaOf(settingsSchema), refs: {}, links: siteLinks(snapshot), hidden: HIDDEN_FIELDS.settings };
}

/**
 * The Branding screen: only the settings' `brand` block (logo, app icon and
 * colours), a panel per part. The rest of the settings ride along untouched,
 * so saving, conflicts and History work exactly as on Site settings.
 */
export function brandForm(snapshot: ContentSnapshot): FormContext {
  return { ...settingsForm(snapshot), focus: BRAND_META.field, panels: BRAND_META.panels };
}
