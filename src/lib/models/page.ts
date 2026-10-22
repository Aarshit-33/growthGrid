import type { Model, Schema } from "mongoose";
import type { ZodType } from "zod";
import { CARD_ROWS, HOME_SECTION_IDS, pageSchemas, type PageKey } from "@/lib/schemas";
import {
  defineSchema,
  attachBlockTypes,
  blockArray,
  bool,
  ctaBlockSchema,
  defineModel,
  hexColor,
  icon,
  intro,
  isoDate,
  linkSchema,
  num,
  opt,
  optionalBool,
  req,
  required,
  requiredStrings,
  sectionIntroFields,
  seoSchema,
  strings,
  sub,
  titleDescriptionSchema,
  validateWithZod,
} from "./_shared";

/* ─────────────────────────────────────────────────────────────
   Pages (collection: `pages`) — one document per page, keyed by
   `key`. Each page type is a Mongoose discriminator whose value is
   the page key, mirroring the per-page Zod schemas in pages.ts.
   ───────────────────────────────────────────────────────────── */

const heroFields = { eyebrow: req, headline: req, lede: req };
const pageHero = () => sub(heroFields);

/* ── home ─────────────────────────────────────────────────── */

const logLine = () =>
  sub({ level: { type: String, required: true, enum: ["err", "warn", "ok", "info"] }, text: req });
const range = () =>
  sub({ label: req, from: num, to: num, decimals: { type: Number, min: 0, max: 3 }, suffix: opt });

const homePage = () =>
  defineSchema({
    seo: required(seoSchema),
    /** Section order + on/off switches; omitted means the default layout. */
    sections: {
      type: [sub({ id: { type: String, required: true, enum: HOME_SECTION_IDS }, enabled: { type: Boolean, required: true } })],
      default: undefined,
    },
    hero: required(
      sub({
        ...heroFields,
        primaryCta: required(linkSchema),
        secondaryCta: required(linkSchema),
        scrollCue: req,
      }),
    ),
    proof: required(sub({ eyebrow: req, industries: strings })),
    problem: required(
      sub({
        ...sectionIntroFields,
        monitor: required(
          sub({
            label: req,
            brokenState: req,
            healedState: req,
            hint: req,
            brokenLogs: { type: [logLine()], default: [] },
            healedLogs: { type: [logLine()], default: [] },
            stats: required(
              // `errors` is a reserved *document* path in Mongoose; it's safe on this nested subdocument.
              defineSchema(
                { errors: required(range()), warnings: required(range()), uptime: required(range()) },
                { _id: false, id: false, suppressReservedKeysWarning: true },
              ),
            ),
          }),
        ),
      }),
    ),
    services: required(intro({ cta: required(linkSchema) })),
    process: required(intro()),
    aftercare: required(intro()),
    work: required(intro({ cta: required(linkSchema), prevLabel: req, nextLabel: req })),
    principles: required(intro()),
    technology: required(intro({ hint: req })),
    audiences: required(intro()),
    testimonials: required(
      intro({
        prevLabel: req,
        nextLabel: req,
        pauseLabel: req,
        playLabel: req,
        slideLabel: req,
        projectLabel: req,
        carouselLabel: req,
        slideRoleLabel: req,
      }),
    ),
    insights: required(intro({ cta: required(linkSchema), readLabel: req, prevLabel: req, nextLabel: req })),
    faq: required(intro()),
    cta: required(ctaBlockSchema),
  });

/* ── about ────────────────────────────────────────────────── */

const aboutPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    story: required(intro({ paragraphs: strings, highlight: req })),
    stats: required(intro()),
    principles: required(intro()),
    process: required(intro()),
    engagement: required(
      intro({
        bestForLabel: req,
        durationLabel: req,
        models: {
          type: [sub({ title: req, icon, summary: req, bestFor: req, duration: req })],
          default: [],
        },
      }),
    ),
    team: required(intro({ socialLabel: req })),
    faq: required(intro()),
    cta: required(ctaBlockSchema),
  });

/* ── services ─────────────────────────────────────────────── */

const carePlan = () =>
  sub({
    name: req,
    icon,
    summary: req,
    bestFor: req,
    response: req,
    features: strings,
    featured: optionalBool,
    cta: required(linkSchema),
  });

const aftercare = () =>
  intro({
    warranty: required(
      sub({
        icon,
        days: { type: Number, required: true, min: 1, max: 365 },
        unit: req,
        label: req,
        title: req,
        text: req,
        timeline: strings,
      }),
    ),
    handover: required(sub({ label: req, items: { type: [sub({ icon, title: req, text: req })], default: [] } })),
    plans: required(
      sub({
        label: req,
        lede: opt,
        responseLabel: req,
        bestForLabel: req,
        featuredLabel: req,
        items: { type: [carePlan()], default: [] },
        note: opt,
      }),
    ),
    moreLink: required(linkSchema),
  });

const servicesPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    list: required(intro({ viewLabel: req })),
    process: required(intro()),
    faq: required(intro()),
    cta: required(ctaBlockSchema),
    aftercare: required(aftercare()),
    detail: required(
      requiredStrings(
        "overviewLabel",
        "outcomesHeading",
        "deliverablesHeading",
        "capabilitiesHeading",
        "approachHeading",
        "technologiesHeading",
        "workHeading",
        "faqHeading",
        "nextLabel",
        "ctaLabel",
        "viewWorkLabel",
        "allLabel",
        "tocLabel",
      ),
    ),
  });

/* ── work ─────────────────────────────────────────────────── */

const workPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    breadcrumb: req,
    filters: required(requiredStrings("label", "all", "empty", "count")),
    cta: required(ctaBlockSchema),
    detail: required(
      requiredStrings(
        "client",
        "industry",
        "year",
        "duration",
        "services",
        "challenge",
        "approach",
        "solution",
        "highlights",
        "results",
        "snapshot",
        "snapshotLede",
        "stack",
        "testimonial",
        "next",
        "view",
        "toc",
        "confidence",
        "pause",
        "replay",
      ),
    ),
  });

/* ── insights ─────────────────────────────────────────────── */

const insightsPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    filters: required(
      sub({ label: req, all: req, results: required(requiredStrings("one", "other")) }),
    ),
    featuredLabel: req,
    cta: required(ctaBlockSchema),
    detail: required(
      sub({
        takeaway: req,
        share: req,
        copyLink: req,
        copied: req,
        related: req,
        minRead: req,
        writtenBy: req,
        updated: req,
        contents: req,
        shareOn: required(requiredStrings("x", "linkedin")),
      }),
    ),
  });

/* ── contact ──────────────────────────────────────────────── */

const contactPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    form: required(
      // `errors` (validation messages) is a reserved *document* path in Mongoose; safe on this nested subdocument.
      defineSchema(
        {
        nameLabel: req,
        namePlaceholder: req,
        emailLabel: req,
        emailPlaceholder: req,
        companyLabel: req,
        companyPlaceholder: req,
        servicesLabel: req,
        timelineLabel: req,
        timelineOptions: strings,
        messageLabel: req,
        messagePlaceholder: req,
        submitLabel: req,
        submittingLabel: req,
        successTitle: req,
        successMessage: req,
        errorMessage: req,
        privacyNote: req,
        heading: req,
        optionalLabel: req,
        honeypotLabel: req,
        resetLabel: req,
        planMessage: req,
        errors: required(
          requiredStrings(
            "nameMin",
            "nameMax",
            "email",
            "companyMax",
            "messageMin",
            "messageMax",
            "invalid",
            "summary",
            "rateLimited",
          ),
        ),
        },
        { _id: false, id: false, suppressReservedKeysWarning: true },
      ),
    ),
    details: required(requiredStrings("heading", "emailLabel", "responseLabel", "locationLabel", "bookingLabel")),
    steps: required(sub({ heading: req, items: { type: [titleDescriptionSchema], default: [] } })),
    faq: required(intro()),
    emails: required(
      sub({
        alert: required(
          requiredStrings(
            "senderName",
            "subject",
            "subjectWithCompany",
            "badge",
            "heading",
            "nameLabel",
            "companyLabel",
            "emailLabel",
            "servicesLabel",
            "timelineLabel",
            "pageLabel",
            "messageLabel",
            "replyLabel",
            "replySubject",
            "leadsLabel",
            "openLeadsLabel",
            "footer",
            "notSavedPrefix",
            "notSavedTitle",
            "notSaved",
          ),
        ),
        confirmation: required(
          withOptional(requiredStrings("subject", "greeting", "body", "signOff", "heading", "message"), {
            badge: opt,
            heroAlt: opt,
            summaryLabel: opt,
            ctaLabel: opt,
            replyNote: opt,
            footer: opt,
          }),
        ),
      }),
    ),
  });

/* ── legal (privacy, terms) ───────────────────────────────── */

const legalPage = () => {
  const schema = defineSchema({
    seo: required(seoSchema),
    eyebrow: req,
    title: req,
    updatedAt: isoDate,
    updatedLabel: req,
    contentsLabel: req,
    body: blockArray(),
  });
  attachBlockTypes(schema);
  return schema;
};

/* ── not-found ────────────────────────────────────────────── */

const notFoundPage = () =>
  defineSchema({
    eyebrow: req,
    headline: req,
    lede: req,
    linksLabel: req,
    links: { type: [linkSchema], default: [] },
  });

/* ── cards ────────────────────────────────────────────────────────── */

const cardRow = { type: String, required: true, enum: CARD_ROWS };

/** An embedded schema plus optional fields. */
function withOptional(schema: Schema, fields: Parameters<Schema["add"]>[0]): Schema {
  schema.add(fields);
  return schema;
}

const cardsPage = () =>
  defineSchema({
    seo: required(seoSchema),
    hero: required(pageHero()),
    breadcrumb: req,
    member: required(requiredStrings("eyebrow", "seoTitle", "seoDescription", "shareText")),
    labels: required(
      withOptional(requiredStrings(
        "front",
        "back",
        "flipHint",
        "flip",
        "open",
        "all",
        "saveContact",
        "share",
        "copyLink",
        "copied",
        "whatsapp",
        "email",
        "download",
        "downloadHint",
        "preparing",
        "details",
        "phone",
        "emailLabel",
        "website",
        "cardAlt",
        "empty",
      ), { print: opt }),
    ),
    design: required(
      sub({
        front: required(
          sub({
            background: hexColor,
            logo: hexColor,
            wordmark: hexColor,
            qrPanel: hexColor,
            qrInk: hexColor,
            qr: { type: String, required: true, enum: ["card", "contact", "website"] },
          }),
        ),
        back: required(
          sub({
            background: hexColor,
            logo: hexColor,
            wordmark: hexColor,
            rows: { type: [cardRow], default: undefined },
            pill: hexColor,
            pillInk: hexColor,
            highlight: cardRow,
            highlightPill: hexColor,
            highlightInk: hexColor,
            sideTab: bool,
          }),
        ),
        shape: required(
          sub({
            corners: { type: Number, required: true, min: 0, max: 60 },
            radius: { type: Number, required: true, min: 0, max: 40 },
          }),
        ),
      }),
    ),
  });

/* ── Base model + discriminators ──────────────────────────── */

const pageBaseSchema = defineSchema(
  {},
  {
    discriminatorKey: "key",
    // Legal pages have an editorial `updatedAt`; keep Mongoose's own timestamps separate.
    timestamps: { createdAt: "_createdAt", updatedAt: "_updatedAt" },
  },
);
pageBaseSchema.index({ key: 1 }, { unique: true });

export const PageModel = defineModel<{ key: PageKey }>("Page", pageBaseSchema, "pages");

const pageDefinitions: Record<PageKey, { model: string; build: () => Schema }> = {
  home: { model: "HomePage", build: homePage },
  about: { model: "AboutPage", build: aboutPage },
  services: { model: "ServicesPage", build: servicesPage },
  work: { model: "WorkPage", build: workPage },
  insights: { model: "InsightsPage", build: insightsPage },
  contact: { model: "ContactPage", build: contactPage },
  privacy: { model: "PrivacyPage", build: legalPage },
  terms: { model: "TermsPage", build: legalPage },
  "not-found": { model: "NotFoundPage", build: notFoundPage },
  cards: { model: "CardsPage", build: cardsPage },
};

function registerPageModel(key: PageKey): Model<unknown> {
  const { model, build } = pageDefinitions[key];
  const existing = PageModel.discriminators?.[model];
  if (existing) return existing as Model<unknown>;
  const schema = validateWithZod(build(), pageSchemas[key] as ZodType, `Page "${key}"`);
  return PageModel.discriminator(model, schema, key) as unknown as Model<unknown>;
}

/** Discriminator model for each page key (use these to create/update pages). */
export const pageModels = Object.fromEntries(
  (Object.keys(pageDefinitions) as PageKey[]).map((key) => [key, registerPageModel(key)]),
) as Record<PageKey, Model<unknown>>;
