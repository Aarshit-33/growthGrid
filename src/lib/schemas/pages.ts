import { z } from "zod";
import { blockSchema } from "./blocks";
import {
  ctaBlockSchema,
  hexColorSchema,
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
    /** Icon beside the warranty's label. */
    icon: iconNameSchema,
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
    prevLabel: z.string().min(1),
    nextLabel: z.string().min(1),
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
    /** What screen readers call the carousel and each slide, e.g. "carousel" and "slide". */
    carouselLabel: z.string().min(1),
    slideRoleLabel: z.string().min(1),
  }),
  insights: sectionIntroSchema.extend({
    cta: linkSchema,
    /** Link on the open insight card, e.g. "Read article". */
    readLabel: z.string().min(1),
    /** Accessible labels for the accordion's arrow buttons. */
    prevLabel: z.string().min(1),
    nextLabel: z.string().min(1),
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
    /** Platform names in the share buttons' labels (Share on X…). */
    shareOn: z.object({
      x: z.string().min(1),
      linkedin: z.string().min(1),
    }),
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
    planMessage: z.string().min(1),
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
  /** The emails each enquiry sends. Placeholders: {name}, {firstName}, {company}, {site} (the site's name), {host} (its domain). */
  emails: z.object({
    /** To the studio (the owners and LEAD_EMAIL_TO). */
    alert: z.object({
      /** Sender name, unless LEAD_EMAIL_FROM sets one. */
      senderName: z.string().min(1),
      subject: z.string().min(1),
      /** Subject when the visitor gave a company. */
      subjectWithCompany: z.string().min(1),
      /** Badge in the email's header. */
      badge: z.string().min(1),
      /** First line of the plain-text version. */
      heading: z.string().min(1),
      nameLabel: z.string().min(1),
      companyLabel: z.string().min(1),
      emailLabel: z.string().min(1),
      servicesLabel: z.string().min(1),
      timelineLabel: z.string().min(1),
      /** The page the enquiry was sent from. */
      pageLabel: z.string().min(1),
      messageLabel: z.string().min(1),
      replyLabel: z.string().min(1),
      /** Subject of the reply the "Reply" button starts. */
      replySubject: z.string().min(1),
      /** Link to Studio › Leads (when the Studio is on): its label in the text version, and the button. */
      leadsLabel: z.string().min(1),
      openLeadsLabel: z.string().min(1),
      footer: z.string().min(1),
      /** When saving failed and the email is the only copy: subject prefix, warning title and text. */
      notSavedPrefix: z.string().min(1),
      notSavedTitle: z.string().min(1),
      notSaved: z.string().min(1),
    }),
    /** Receipt to the visitor. */
    confirmation: z.object({
      subject: z.string().min(1),
      /** Plain-text version: greeting, body and sign-off (the site's name follows). */
      greeting: z.string().min(1),
      body: z.string().min(1),
      signOff: z.string().min(1),
      /** HTML version: heading and message. */
      heading: z.string().min(1),
      message: z.string().min(1),
      /* The rest of the HTML version. Each is optional: a built-in English
         line is used when it's empty (CONFIRMATION_DEFAULTS in lib/leads/email.ts). */
      /** Pill in the dark header, e.g. "Enquiry received". */
      badge: z.string().min(1).optional(),
      /** Alt text of the picture under the header. */
      heroAlt: z.string().min(1).optional(),
      /** Heading of the card that repeats the services and timeline the visitor picked. */
      summaryLabel: z.string().min(1).optional(),
      /** The button to the work page. */
      ctaLabel: z.string().min(1).optional(),
      /** Above the contact details: how to add to the enquiry. */
      replyNote: z.string().min(1).optional(),
      /** Small print at the very bottom: why they got this email. */
      footer: z.string().min(1).optional(),
    }),
  }),
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

/* ── Business cards ── /cards and /cards/<slug>. The copy is edited in
   Pages › Business cards; `design` (colours, QR code, rows) has its own
   Studio screen with a live preview. Defaults: content/pages/cards.json. */

export const CARD_ROWS = ["phone", "name", "role", "email", "website"] as const;
export const cardRowSchema = z.enum(CARD_ROWS);
export type CardRow = z.infer<typeof cardRowSchema>;

/** What the QR code on the front opens. */
export const cardQrTargetSchema = z.enum(["card", "contact", "website"]);
export type CardQrTarget = z.infer<typeof cardQrTargetSchema>;

export const cardDesignSchema = z.object({
  /** The dark side: the logo and the QR code. */
  front: z.object({
    background: hexColorSchema,
    /** The symbol and the accent half of the wordmark ("Grid"). */
    logo: hexColorSchema,
    /** The first half of the wordmark ("growth"). */
    wordmark: hexColorSchema,
    /** The tile behind the QR code. */
    qrPanel: hexColorSchema,
    /** The QR code's modules: keep it much darker than the tile, or phones can't read it. */
    qrInk: hexColorSchema,
    qr: cardQrTargetSchema,
  }),
  /** The light side: the logo and the contact rows. */
  back: z.object({
    background: hexColorSchema,
    logo: hexColorSchema,
    wordmark: hexColorSchema,
    /** Contact rows, top to bottom (each at most once). */
    rows: z
      .array(cardRowSchema)
      .min(1)
      .max(5)
      .refine((rows) => new Set(rows).size === rows.length, "Each row can be listed once"),
    pill: hexColorSchema,
    pillInk: hexColorSchema,
    /** The row drawn in the highlight colours. */
    highlight: cardRowSchema,
    highlightPill: hexColorSchema,
    highlightInk: hexColorSchema,
    /** The tab on the left edge. */
    sideTab: z.boolean(),
  }),
  shape: z.object({
    /** Card corners on screen, in px at the card's 1050 px width (downloads stay square for print). */
    corners: z.number().int().min(0).max(60),
    /** Roundness of the QR tile, the side tab and the rows, in px (rows max out as full pills). */
    radius: z.number().int().min(0).max(40),
  }),
});
export type CardDesign = z.infer<typeof cardDesignSchema>;

export const cardsPageSchema = z.object({
  key: z.literal("cards"),
  seo: seoSchema,
  hero: pageHeroSchema,
  /** Breadcrumb label for /cards. */
  breadcrumb: z.string().min(1),
  /** Each person's page (/cards/<slug>). {name}, {role} and {site} are filled in. */
  member: z.object({
    eyebrow: z.string().min(1),
    seoTitle: z.string().min(1),
    seoDescription: z.string().min(1),
    /** Text that travels with a shared link. */
    shareText: z.string().min(1),
  }),
  labels: z.object({
    front: z.string().min(1),
    back: z.string().min(1),
    /** Under the card, e.g. "Tap the card to flip it". */
    flipHint: z.string().min(1),
    /** The flip button's screen-reader name. */
    flip: z.string().min(1),
    /** Link from the list to a person's card. */
    open: z.string().min(1),
    /** Link from a card back to the list. */
    all: z.string().min(1),
    saveContact: z.string().min(1),
    share: z.string().min(1),
    copyLink: z.string().min(1),
    copied: z.string().min(1),
    whatsapp: z.string().min(1),
    email: z.string().min(1),
    download: z.string().min(1),
    /** Under the download buttons, e.g. "PNG for screens, SVG for print". */
    downloadHint: z.string().min(1),
    /** The print-ready PDF button (optional; a default is used without it). */
    print: z.string().min(1).optional(),
    preparing: z.string().min(1),
    /** Heading over the tap-to-call list. */
    details: z.string().min(1),
    phone: z.string().min(1),
    emailLabel: z.string().min(1),
    website: z.string().min(1),
    /** Card artwork alt text: {name} and {side} are filled in. */
    cardAlt: z.string().min(1),
    /** The list page when nobody has a card. */
    empty: z.string().min(1),
  }),
  design: cardDesignSchema,
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
  cards: cardsPageSchema,
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
export type CardsPage = z.infer<typeof cardsPageSchema>;
