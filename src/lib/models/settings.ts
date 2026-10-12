import { logoStyleSchema, settingsSchema, type Settings } from "@/lib/schemas";
import {
  defineSchema,
  defineModel,
  HEX_PATTERN,
  linkSchema,
  nullableString,
  num,
  optionalBool,
  req,
  required,
  requiredStrings,
  socialPlatform,
  strings,
  sub,
  validateWithZod,
} from "./_shared";

/** A brand image: like any image, but alt text is optional (the site's name is always there as text). */
const brandImage = sub({ src: req, alt: { type: String, trim: true }, width: num, height: num });

/** The settings collection holds a single document with this key. */
export const SETTINGS_KEY = "site";

const settingsMongooseSchema = defineSchema(
  {
    key: { type: String, required: true, unique: true, default: SETTINGS_KEY },
    name: req,
    legalName: req,
    wordmark: req,
    // Optional: without it the site uses the built-in mark and icon.
    brand: sub({
      logo: required(
        sub({
          image: { type: brandImage, default: null },
          style: { type: String, required: true, enum: logoStyleSchema.options },
          height: { type: Number, required: true, min: 16, max: 96 },
          mark: { type: brandImage, default: null },
          stacked: { type: brandImage, default: null },
        }),
      ),
      app: required(
        sub({
          icon: { type: brandImage, default: null },
          iconBackground: { type: String, default: null, match: HEX_PATTERN },
          themeColor: { type: String, required: true, match: HEX_PATTERN },
        }),
      ),
    }),
    tagline: req,
    description: req,
    url: req,
    locale: req,
    contact: required(
      sub({
        email: { ...req, lowercase: true },
        phone: nullableString,
        bookingUrl: nullableString,
        responseTime: req,
      }),
    ),
    location: required(
      sub({ label: req, city: nullableString, country: nullableString, timezone: nullableString }),
    ),
    availability: required(
      sub({ status: { type: String, required: true, enum: ["open", "limited", "closed"] }, label: req }),
    ),
    socials: { type: [sub({ platform: socialPlatform, label: req, url: req })], default: [] },
    navigation: required(
      sub({
        primary: { type: [linkSchema], default: [] },
        cta: required(linkSchema),
        footer: { type: [sub({ title: req, links: { type: [linkSchema], default: [] } })], default: [] },
        legal: { type: [linkSchema], default: [] },
      }),
    ),
    seo: required(
      sub({
        defaultTitle: req,
        titleTemplate: req,
        description: req,
        keywords: strings,
        twitterHandle: { type: String, trim: true },
        googleVerification: { type: String, trim: true },
        bingVerification: { type: String, trim: true },
        discourageSearchEngines: optionalBool,
        blockAiAnswers: optionalBool,
        blockAiTraining: optionalBool,
        indexNowKey: { type: String, trim: true },
        areaServed: req,
        availableLanguages: strings,
        contactType: req,
        offerCatalogName: req,
        deliverablesName: req,
        category: req,
        manifestCategories: strings,
      }),
    ),
    analytics: sub({ gaId: nullableString }),
    ui: required(
      sub({
        home: req,
        skipToContent: req,
        menu: req,
        openMenu: req,
        closeMenu: req,
        servicesTitle: req,
        connectTitle: req,
        backToTop: req,
        rights: req,
        localTime: req,
        homeLinkLabel: req,
        primaryNavLabel: req,
        footerNavLabel: req,
        breadcrumbLabel: req,
        copyCode: req,
        copiedCode: req,
        copyCodeLabel: req,
        callouts: required(requiredStrings("info", "tip", "warning")),
      }),
    ),
    consent: required(
      sub({
        title: req,
        message: req,
        policyLabel: req,
        accept: req,
        decline: req,
        settings: req,
        // Analytics off: the notice's message and button.
        essentialMessage: req,
        acknowledge: req,
      }),
    ),
    llms: required(
      sub({
        fullLede: req,
        headings: required(
          requiredStrings(
            "services",
            "caseStudies",
            "insights",
            "company",
            "optional",
            "about",
            "principles",
            "process",
            "engagement",
            "aftercare",
            "faq",
            "contact",
          ),
        ),
        labels: required(
          requiredStrings(
            "website",
            "phone",
            "location",
            "availability",
            "fullContent",
            "fullContentDescription",
            "feed",
            "more",
            "deliverables",
            "url",
            "serviceQuestions",
            "outcome",
            "published",
            "tags",
            "startProject",
          ),
        ),
      }),
    ),
  },
  { timestamps: true },
);

validateWithZod(settingsMongooseSchema, settingsSchema, "Settings");

export const SettingsModel = defineModel<Settings & { key: string }>(
  "Settings",
  settingsMongooseSchema,
  "settings",
);
