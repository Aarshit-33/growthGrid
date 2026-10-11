import { z } from "zod";
import { hexColorSchema, imageSchema, linkSchema, socialPlatformSchema } from "./common";

/**
 * "with-name": the image beside the wordmark text (a symbol) ·
 * "logo-only": the image alone (it already spells the name).
 */
export const logoStyleSchema = z.enum(["with-name", "logo-only"]);
export type LogoStyle = z.infer<typeof logoStyleSchema>;

/**
 * A brand image. Alt text is optional: the site's name is always there as
 * text (beside the logo, or read out in its place), and icons have none.
 */
const brandImageSchema = imageSchema.extend({ alt: z.string().optional() });

/**
 * Brand assets (the Studio's Branding screen). An empty image falls back to
 * the built-in grid mark or icon, so a site without a `brand` block looks
 * exactly as designed. Defaults: DEFAULT_BRAND in src/lib/brand.ts.
 */
export const brandSchema = z.object({
  logo: z.object({
    /** Replaces the built-in grid mark in the header, footer and everywhere else. null: the built-in mark. */
    image: brandImageSchema.nullable(),
    style: logoStyleSchema,
    /** Height of the logo in the header and footer, in px. */
    height: z.number().int().min(16).max(96),
    /** The symbol alone, without the name: the page transition and other small spots. null: the logo or app icon. */
    mark: brandImageSchema.nullable().optional(),
    /** The symbol above the name, centred on the intro screen. null: the symbol and the wordmark. */
    stacked: brandImageSchema.nullable().optional(),
  }),
  app: z.object({
    /** Square image for the favicon and app icons. null: the built-in grid icon. */
    icon: brandImageSchema.nullable(),
    /** Set: the icon sits on a padded tile of this colour (for transparent logos). null: the icon as it is. */
    iconBackground: hexColorSchema.nullable(),
    /** Browser toolbar and installed-app colour. */
    themeColor: hexColorSchema,
  }),
});
export type Brand = z.infer<typeof brandSchema>;

/** GA4 measurement ID, e.g. "G-XXXXXXXXXX". */
export const gaIdSchema = z.string().regex(/^G-[A-Z0-9]{4,}$/, "Use a GA4 measurement ID like G-XXXXXXXXXX");

/** IndexNow key: 8–128 letters, digits or dashes (a UUID works). */
export const indexNowKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{8,128}$/, "Use 8–128 letters, digits or dashes, e.g. a UUID");

/** Global, singleton site configuration (collection: `settings`). */
export const settingsSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().min(1),
  /** Wordmark rendered in the header/footer, exactly as written ("growthGrid"). */
  wordmark: z.string().min(1),
  /** Logo, icons and theme colour (Studio › Branding). */
  brand: brandSchema.optional(),
  tagline: z.string().min(1),
  description: z.string().min(50),
  url: z.url(),
  locale: z.string().min(2),
  contact: z.object({
    email: z.email(),
    phone: z.string().nullable(),
    /** Calendly / Cal.com link. When null the "Book a call" button is hidden. */
    bookingUrl: z.url().nullable(),
    responseTime: z.string().min(1),
  }),
  location: z.object({
    label: z.string().min(1),
    city: z.string().nullable(),
    country: z.string().nullable(),
    /** IANA timezone, e.g. "Europe/London". Enables the footer studio clock. */
    timezone: z.string().nullable(),
  }),
  availability: z.object({
    status: z.enum(["open", "limited", "closed"]),
    label: z.string().min(1),
  }),
  socials: z.array(
    z.object({
      platform: socialPlatformSchema,
      label: z.string().min(1),
      url: z.url(),
    }),
  ),
  navigation: z.object({
    primary: z.array(linkSchema).min(1),
    cta: linkSchema,
    footer: z.array(
      z.object({
        title: z.string().min(1),
        links: z.array(linkSchema).min(1),
      }),
    ),
    legal: z.array(linkSchema),
  }),
  seo: z.object({
    defaultTitle: z.string().min(10),
    /** Must contain "%s", e.g. "%s | growthGrid". */
    titleTemplate: z.string().includes("%s"),
    description: z.string().min(50).max(170),
    keywords: z.array(z.string()),
    twitterHandle: z.string().optional(),
    /** Google Search Console: the `content` of its google-site-verification meta tag. */
    googleVerification: z.string().trim().min(1).max(200).optional(),
    /** Bing Webmaster Tools: the `content` of its msvalidate.01 meta tag. */
    bingVerification: z.string().trim().min(1).max(200).optional(),
    /** Ask search engines to keep every page out of their results (staging, pre-launch). */
    discourageSearchEngines: z.boolean().optional(),
    /** robots.txt shuts out AI answer engines (ChatGPT search, Perplexity…), so they can't quote or cite the site. Off: welcome. */
    blockAiAnswers: z.boolean().optional(),
    /** robots.txt asks AI training crawlers (GPTBot, ClaudeBot, Google-Extended…) to stay away. Search and AI answers unaffected. */
    blockAiTraining: z.boolean().optional(),
    /** IndexNow (Bing, Yandex…): served at /indexnow-key.txt; `npm run indexnow` submits the sitemap after a deploy. */
    indexNowKey: indexNowKeySchema.optional(),
  }),
  /** Google Analytics. Without an ID here, NEXT_PUBLIC_GA_ID (env) is used; with neither, no analytics code ships. */
  analytics: z
    .object({
      gaId: gaIdSchema.nullable(),
    })
    .optional(),
  /** Interface labels for the site shell (header, menu, footer). */
  ui: z.object({
    /** Root breadcrumb label (the "/" crumb on every inner page). */
    home: z.string().min(1),
    skipToContent: z.string().min(1),
    menu: z.string().min(1),
    openMenu: z.string().min(1),
    closeMenu: z.string().min(1),
    servicesTitle: z.string().min(1),
    connectTitle: z.string().min(1),
    backToTop: z.string().min(1),
    rights: z.string().min(1),
    localTime: z.string().min(1),
  }),
  /** Cookie banner copy, shown to every first-time visitor. With analytics available
   *  it asks for consent (message, accept, decline); otherwise it notes that only
   *  essential browser settings are used (essentialMessage, acknowledge). */
  consent: z.object({
    title: z.string().min(1),
    message: z.string().min(1),
    /** Link text pointing at the privacy policy. */
    policyLabel: z.string().min(1),
    accept: z.string().min(1),
    decline: z.string().min(1),
    /** Footer button that reopens the banner. */
    settings: z.string().min(1),
    /** Analytics off: the banner's message. Optional (older settings): a built-in line then. */
    essentialMessage: z.string().trim().min(1).optional(),
    /** Analytics off: its only button, which closes it. Optional: "Accept" then. */
    acknowledge: z.string().trim().min(1).optional(),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
