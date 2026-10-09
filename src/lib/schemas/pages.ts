import { z } from "zod";
import { blockSchema } from "./blocks";
import {
  ctaBlockSchema,
  iconNameSchema,
  isoDateSchema,
  linkSchema,
  sectionIntroSchema,
  seoSchema,
} from "./common";

/* ─────────────────────────────────────────────────────────────
   Page documents (collection: `pages`, keyed by `key`).
   Pages hold section copy; lists (services, projects…) come
   from their own collections so they're reusable everywhere.
   ───────────────────────────────────────────────────────────── */

const pageHeroSchema = z.object({
  eyebrow: z.string().min(1),
  /** Supports *emphasis*. */
  headline: z.string().min(1),
  lede: z.string().min(1),
});

const logLineSchema = z.object({
  level: z.enum(["err", "warn", "ok", "info"]),
  text: z.string().min(1),
});

const rangeSchema = z.object({
  label: z.string().min(1),
  from: z.number(),
  to: z.number(),
  decimals: z.number().int().min(0).max(3).optional(),
  suffix: z.string().optional(),
});

/* ── After launch ── the warranty, handover and care plans that follow
   every project. Authored once (services page) and shown on the home
   page and every service page. Copy may use {days} for the warranty. */

const carePlanSchema = z.object({
  name: z.string().min(1),
  icon: iconNameSchema,
  summary: z.string().min(1),
  bestFor: z.string().min(1),
  /** Guaranteed first-response time (the plan's SLA). */
  response: z.string().min(1),
  features: z.array(z.string().min(1)).min(1),
  /** Highlighted as the most chosen plan (at most one). */
  featured: z.boolean().optional(),
  /** No prices: each plan asks for a quote. */
  cta: linkSchema,
});

const aftercareSchema = sectionIntroSchema.extend({
  warranty: z.object({
    days: z.number().int().min(1).max(365),
    /** Unit beside the big number, e.g. "days". */
    unit: z.string().min(1),
    label: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    /** Three stops on the warranty timeline: launch, end of warranty, after. */
    timeline: z.array(z.string().min(1)).length(3),
  }),
  handover: z.object({
    label: z.string().min(1),
    items: z
      .array(z.object({ icon: iconNameSchema, title: z.string().min(1), text: z.string().min(1) }))
      .min(1),
  }),
  plans: z.object({
    label: z.string().min(1),
    lede: z.string().optional(),
    responseLabel: z.string().min(1),
    bestForLabel: z.string().min(1),
    featuredLabel: z.string().min(1),
    items: z
      .array(carePlanSchema)
      .min(1)
      .refine((plans) => plans.filter((p) => p.featured).length <= 1, "At most one care plan can be featured"),
    note: z.string().optional(),
  }),
  /** Service pages: link to the full breakdown on the home page. */
  moreLink: linkSchema,
});
export type Aftercare = z.infer<typeof aftercareSchema>;
export type CarePlan = z.infer<typeof carePlanSchema>;

/* ── Home layout ── order and visibility of the home sections, managed
   from the admin. The hero always opens the page and the closing CTA
   always ends it; sections the list doesn't mention still show, after
   the listed ones (see src/lib/content/home-sections.ts). */

export const HOME_SECTION_IDS = [
  "proof",
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
  "cta",
] as const;
export const homeSectionIdSchema = z.enum(HOME_SECTION_IDS);
export type HomeSectionId = z.infer<typeof homeSectionIdSchema>;

const homeSectionsSchema = z
  .array(z.object({ id: homeSectionIdSchema, enabled: z.boolean() }))
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, "Each home section can be listed once");
export type HomeSectionConfig = z.infer<typeof homeSectionsSchema>[number];

export const homePageSchema = z.object({
  key: z.literal("home"),
  seo: seoSchema,
  /** Section order + on/off switches (admin → Homepage). Omitted: the default order, all on. */
  sections: homeSectionsSchema.optional(),
  hero: pageHeroSchema.extend({
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
    scrollCue: z.string().min(1),
  }),
  proof: z.object({
    eyebrow: z.string().min(1),
    industries: z.array(z.string().min(1)).min(3),
  }),
  problem: sectionIntroSchema.extend({
    monitor: z.object({
      label: z.string().min(1),
      brokenState: z.string().min(1),
      healedState: z.string().min(1),
      hint: z.string().min(1),
      brokenLogs: z.array(logLineSchema).min(3),
      healedLogs: z.array(logLineSchema).min(3),
      stats: z.object({
        errors: rangeSchema,
        warnings: rangeSchema,
        uptime: rangeSchema,
      }),
    }),
  }),
  services: sectionIntroSchema.extend({ cta: linkSchema }),
  process: sectionIntroSchema,
  /** Intro for the home "After launch" section (the offer itself: services page `aftercare`). */
  aftercare: sectionIntroSchema,
  work: sectionIntroSchema.extend({
    cta: linkSchema,
    /** Accessible labels for the deck's arrow buttons. */
    prevLabel: z.string().min(1).default("Previous project"),
    nextLabel: z.string().min(1).default("Next project"),
  }),
  principles: sectionIntroSchema,
  technology: sectionIntroSchema.extend({ hint: z.string().min(1) }),
  audiences: sectionIntroSchema,
  testimonials: sectionIntroSchema.extend({
    prevLabel: z.string().min(1),
    nextLabel: z.string().min(1),
    pauseLabel: z.string().min(1),
    playLabel: z.string().min(1),
    /** Slide position, e.g. "{index} of {total}". */
    slideLabel: z.string().min(1),
    projectLabel: z.string().min(1),
  }),
  insights: sectionIntroSchema.extend({
    cta: linkSchema,
    /** Link on the open insight card, e.g. "Read article". */
    readLabel: z.string().min(1).default("Read article"),
    /** Accessible labels for the accordion's arrow buttons. */
    prevLabel: z.string().min(1).default("Previous insight"),
    nextLabel: z.string().min(1).default("Next insight"),
  }),
  faq: sectionIntroSchema,
  cta: ctaBlockSchema,
});

export const aboutPageSchema = z.object({
  key: z.literal("about"),
  seo: seoSchema,
  hero: pageHeroSchema,
  story: sectionIntroSchema.extend({
    paragraphs: z.array(z.string().min(1)).min(1),
    highlight: z.string().min(1),
  }),
  stats: sectionIntroSchema,
  principles: sectionIntroSchema,
  process: sectionIntroSchema,
  engagement: sectionIntroSchema.extend({
    bestForLabel: z.string().min(1),
    durationLabel: z.string().min(1),
    models: z
      .array(
        z.object({
          title: z.string().min(1),
          icon: iconNameSchema,
          summary: z.string().min(1),
          bestFor: z.string().min(1),
          duration: z.string().min(1),
        }),
      )
      .min(1),
  }),
  team: sectionIntroSchema.extend({
    /** aria-label template for member social links: "{name} on {platform}". */
    socialLabel: z.string().min(1),
  }),
  faq: sectionIntroSchema,
  cta: ctaBlockSchema,
});

export const servicesPageSchema = z.object({
  key: z.literal("services"),
  seo: seoSchema,
  hero: pageHeroSchema,
  list: sectionIntroSchema.extend({ viewLabel: z.string().min(1) }),
  process: sectionIntroSchema,
  faq: sectionIntroSchema,
  cta: ctaBlockSchema,
  /** The after-launch offer (the intro here heads the service-page block). */
  aftercare: aftercareSchema,
  detail: z.object({
    overviewLabel: z.string().min(1),
    outcomesHeading: z.string().min(1),
    deliverablesHeading: z.string().min(1),
    capabilitiesHeading: z.string().min(1),
    approachHeading: z.string().min(1),
    technologiesHeading: z.string().min(1),
    workHeading: z.string().min(1),
    faqHeading: z.string().min(1),
    nextLabel: z.string().min(1),
    ctaLabel: z.string().min(1),
    viewWorkLabel: z.string().min(1),
    allLabel: z.string().min(1),
    tocLabel: z.string().min(1),
  }),
});

export const workPageSchema = z.object({
  key: z.literal("work"),
  seo: seoSchema,
  hero: pageHeroSchema,
  /** Breadcrumb label for /work. */
  breadcrumb: z.string().min(1),
  filters: z.object({
    label: z.string().min(1),
    all: z.string().min(1),
    empty: z.string().min(1),
    /** Live result count, e.g. "{count} of {total} case studies". */
    count: z.string().min(1),
  }),
  cta: ctaBlockSchema,
  detail: z.object({
    client: z.string().min(1),
    industry: z.string().min(1),
    year: z.string().min(1),
    duration: z.string().min(1),
    services: z.string().min(1),
    challenge: z.string().min(1),
    approach: z.string().min(1),
    solution: z.string().min(1),
    highlights: z.string().min(1),
    results: z.string().min(1),
    snapshot: z.string().min(1),
    snapshotLede: z.string().min(1),
    stack: z.string().min(1),
    testimonial: z.string().min(1),
    next: z.string().min(1),
    view: z.string().min(1),
    /** Case-study "On this page" nav label. */
    toc: z.string().min(1),
    /** Showcase control labels: triage confidence meter, flow pause, triage replay. */
    confidence: z.string().min(1),
    pause: z.string().min(1),
    replay: z.string().min(1),
  }),
});

export const insightsPageSchema = z.object({
  key: z.literal("insights"),
  seo: seoSchema,
  hero: pageHeroSchema,
  filters: z.object({
    label: z.string().min(1),
    all: z.string().min(1),
    /** Live result count, pluralised via Intl.PluralRules; both must contain "{count}". */
    results: z.object({
      one: z.string().includes("{count}"),
      other: z.string().includes("{count}"),
    }),
  }),
  featuredLabel: z.string().min(1),
  cta: ctaBlockSchema,
  detail: z.object({
    takeaway: z.string().min(1),
    share: z.string().min(1),
    copyLink: z.string().min(1),
    copied: z.string().min(1),
    related: z.string().min(1),
    minRead: z.string().min(1),
    writtenBy: z.string().min(1),
    updated: z.string().min(1),
    contents: z.string().min(1),
  }),
});

export const contactPageSchema = z.object({
  key: z.literal("contact"),
  seo: seoSchema,
  hero: pageHeroSchema,
  form: z.object({
    nameLabel: z.string().min(1),
    namePlaceholder: z.string().min(1),
    emailLabel: z.string().min(1),
    emailPlaceholder: z.string().min(1),
    companyLabel: z.string().min(1),
    companyPlaceholder: z.string().min(1),
    servicesLabel: z.string().min(1),
    timelineLabel: z.string().min(1),
    timelineOptions: z.array(z.string().min(1)).min(2),
    messageLabel: z.string().min(1),
    messagePlaceholder: z.string().min(1),
    submitLabel: z.string().min(1),
    submittingLabel: z.string().min(1),
    successTitle: z.string().min(1),
    successMessage: z.string().min(1),
    errorMessage: z.string().min(1),
    privacyNote: z.string().min(1),
    heading: z.string().min(1),
    optionalLabel: z.string().min(1),
    honeypotLabel: z.string().min(1),
    resetLabel: z.string().min(1),
    /** Pre-written (editable) message when a care plan's quote link opens the form; {plan} = plan name. */
    planMessage: z.string().min(1).default("Hi! I'd like a quote for the {plan} care plan."),
    /** Validation copy, keyed by field + failure (mapped from Zod issue codes). */
    errors: z.object({
      nameMin: z.string().min(1),
      nameMax: z.string().min(1),
      email: z.string().min(1),
      companyMax: z.string().min(1),
      messageMin: z.string().min(1),
      messageMax: z.string().min(1),
      invalid: z.string().min(1),
      summary: z.string().min(1),
      rateLimited: z.string().min(1),
    }),
  }),
  details: z.object({
    heading: z.string().min(1),
    emailLabel: z.string().min(1),
    responseLabel: z.string().min(1),
    locationLabel: z.string().min(1),
    bookingLabel: z.string().min(1),
  }),
  steps: z.object({
    heading: z.string().min(1),
    items: z
      .array(z.object({ title: z.string().min(1), description: z.string().min(1) }))
      .min(1),
  }),
  faq: sectionIntroSchema,
});

export const legalPageSchema = z.object({
  key: z.enum(["privacy", "terms"]),
  seo: seoSchema,
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  updatedAt: isoDateSchema,
  /** Label before the date, e.g. "Last updated". */
  updatedLabel: z.string().min(1),
  /** Table of contents label, e.g. "On this page". */
  contentsLabel: z.string().min(1),
  body: z.array(blockSchema).min(1),
});

export const notFoundPageSchema = z.object({
  key: z.literal("not-found"),
  eyebrow: z.string().min(1),
  headline: z.string().min(1),
  lede: z.string().min(1),
  /** Accessible name for the recovery links nav. */
  linksLabel: z.string().min(1),
  links: z.array(linkSchema).min(1),
});

/** Registry used by the repository to validate and type page lookups. */
export const pageSchemas = {
  home: homePageSchema,
  about: aboutPageSchema,
  services: servicesPageSchema,
  work: workPageSchema,
  insights: insightsPageSchema,
  contact: contactPageSchema,
  privacy: legalPageSchema,
  terms: legalPageSchema,
  "not-found": notFoundPageSchema,
} as const;

export type PageKey = keyof typeof pageSchemas;
export type PageContent<K extends PageKey> = z.infer<(typeof pageSchemas)[K]>;

export type HomePage = z.infer<typeof homePageSchema>;
export type AboutPage = z.infer<typeof aboutPageSchema>;
export type ServicesPage = z.infer<typeof servicesPageSchema>;
export type WorkPage = z.infer<typeof workPageSchema>;
export type InsightsPage = z.infer<typeof insightsPageSchema>;
export type ContactPage = z.infer<typeof contactPageSchema>;
export type LegalPage = z.infer<typeof legalPageSchema>;
export type NotFoundPage = z.infer<typeof notFoundPageSchema>;
