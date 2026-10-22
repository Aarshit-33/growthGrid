import type { CollectionName } from "@/lib/content/registry";
import type { HomeSectionId, PageKey } from "@/lib/schemas";
import type { PanelCopy } from "./types";

/* ─────────────────────────────────────────────────────────────
   How the admin presents each piece of content: names, list
   titles, where items appear, and how "On homepage" works for
   each collection. Client-safe (type imports only).
   ───────────────────────────────────────────────────────────── */

/**
 * How a collection's items get onto the homepage:
 * • flag     — own "On homepage" switch (`home`), the item stays on its other pages
 * • featured — the `featured` switch (selected work, testimonials)
 * • scope    — FAQ shown in the "home" scope
 * • always   — every visible item (collections used only on the homepage)
 * • none     — not on the homepage
 */
export type HomeRule = "flag" | "featured" | "scope" | "always" | "none";

export interface CollectionMeta {
  label: string;
  singular: string;
  description: string;
  /** Row title / subtitle in lists (dot paths). */
  titleField: string;
  subtitleField?: string;
  /** "order": numbered by `order` · "array": file order · "date": newest first (not reorderable). */
  sort: "order" | "array" | "date";
  home: HomeRule;
  homeSection?: HomeSectionId;
  /** Public page of an item, `{id}` = its slug. */
  href?: string;
  /** Where items show up on the site. */
  appearsOn: string;
  group: "content" | "studio";
}

export const COLLECTION_META: Record<CollectionName, CollectionMeta> = {
  services: {
    label: "Services",
    singular: "service",
    description: "What the studio offers. Each service has its own page.",
    titleField: "title",
    subtitleField: "tagline",
    sort: "order",
    home: "flag",
    homeSection: "services",
    href: "/services/{id}",
    appearsOn: "Homepage · Services · Navigation & footer · Contact form",
    group: "content",
  },
  projects: {
    label: "Case studies",
    singular: "case study",
    description: "Client work. Featured case studies appear in the homepage deck.",
    titleField: "title",
    subtitleField: "category",
    sort: "order",
    home: "featured",
    homeSection: "work",
    href: "/work/{id}",
    appearsOn: "Homepage (featured) · Work",
    group: "content",
  },
  insights: {
    label: "Insights",
    singular: "article",
    description: "Articles and field notes, newest first.",
    titleField: "title",
    subtitleField: "publishedAt",
    sort: "date",
    home: "flag",
    homeSection: "insights",
    href: "/insights/{id}",
    appearsOn: "Homepage (latest) · Insights",
    group: "content",
  },
  testimonials: {
    label: "Testimonials",
    singular: "testimonial",
    description: "Client quotes. Featured ones rotate on the homepage.",
    titleField: "author",
    subtitleField: "company",
    sort: "order",
    home: "featured",
    homeSection: "testimonials",
    appearsOn: "Homepage (featured) · Case studies",
    group: "content",
  },
  faqs: {
    label: "FAQs",
    singular: "question",
    description: "Questions and answers, shown on the pages listed in each one's scopes.",
    titleField: "question",
    subtitleField: "scopes",
    sort: "order",
    home: "scope",
    homeSection: "faq",
    appearsOn: "Homepage · Services · About · Contact",
    group: "content",
  },
  team: {
    label: "Team",
    singular: "team member",
    description: "The people behind the studio.",
    titleField: "name",
    subtitleField: "role",
    sort: "order",
    home: "none",
    appearsOn: "About · Article bylines · Business cards",
    group: "studio",
  },
  process: {
    label: "Process",
    singular: "step",
    description: "How a project runs, step by step.",
    titleField: "title",
    subtitleField: "duration",
    sort: "order",
    home: "flag",
    homeSection: "process",
    appearsOn: "Homepage · About · Services",
    group: "studio",
  },
  principles: {
    label: "Principles",
    singular: "principle",
    description: "What the studio stands for.",
    titleField: "title",
    subtitleField: "label",
    sort: "order",
    home: "flag",
    homeSection: "principles",
    appearsOn: "Homepage · About",
    group: "studio",
  },
  stats: {
    label: "Stats",
    singular: "stat",
    description: "Headline numbers.",
    titleField: "label",
    subtitleField: "value",
    sort: "order",
    home: "flag",
    homeSection: "proof",
    appearsOn: "Homepage (proof band) · About",
    group: "studio",
  },
  problems: {
    label: "Problems",
    singular: "problem",
    description: "The pains the homepage's problem section names.",
    titleField: "title",
    sort: "order",
    home: "always",
    homeSection: "problem",
    appearsOn: "Homepage",
    group: "studio",
  },
  audiences: {
    label: "Audiences",
    singular: "audience",
    description: "Who the studio works with (homepage tabs).",
    titleField: "tab.title",
    subtitleField: "label",
    sort: "order",
    home: "always",
    homeSection: "audiences",
    appearsOn: "Homepage",
    group: "studio",
  },
  technologies: {
    label: "Technology",
    singular: "category",
    description: "The tech orbit: categories and the tools in each.",
    titleField: "name",
    subtitleField: "description",
    sort: "order",
    home: "always",
    homeSection: "technology",
    appearsOn: "Homepage · Service & case study stacks",
    group: "studio",
  },
};

/** Sidebar order. */
export const COLLECTION_ORDER: CollectionName[] = [
  "services",
  "projects",
  "insights",
  "testimonials",
  "faqs",
  "team",
  "process",
  "principles",
  "stats",
  "problems",
  "audiences",
  "technologies",
];

type Item = Record<string, unknown>;

/** The item is visible on the site (missing `published` means yes). */
export const isPublished = (item: Item) => item.published !== false;

/**
 * Whether a visible item is picked for the homepage, by its collection's rule.
 * Mirrors the filters in src/app/(site)/page.tsx.
 */
export function isOnHomepage(rule: HomeRule, item: Item): boolean {
  switch (rule) {
    case "flag":
      return item.home !== false;
    case "featured":
      return item.featured === true;
    case "scope":
      return Array.isArray(item.scopes) && item.scopes.includes("home");
    case "always":
      return true;
    case "none":
      return false;
  }
}

/** Wording of the homepage switch, by rule. */
export const HOME_SWITCH_COPY: Record<"flag" | "featured" | "scope", { label: string; on: string; off: string }> = {
  flag: { label: "On homepage", on: "Shown in its homepage section", off: "Only on its other pages" },
  featured: { label: "Featured on homepage", on: "Featured in the homepage section", off: "Not featured" },
  scope: { label: "On homepage", on: "In the homepage FAQ", off: "Only on the pages in its scopes" },
};

export interface PageMeta {
  label: string;
  description: string;
  href?: string;
}

export const PAGE_META: Record<PageKey, PageMeta> = {
  home: { label: "Homepage", description: "Hero, section intros and the closing call to action.", href: "/" },
  about: { label: "About", description: "Story, engagement models and section intros.", href: "/about" },
  services: { label: "Services", description: "Services overview and service page labels.", href: "/services" },
  work: { label: "Work", description: "Work index and case study page labels.", href: "/work" },
  insights: { label: "Insights", description: "Insights index and article page labels.", href: "/insights" },
  contact: { label: "Contact", description: "Contact page and form copy.", href: "/contact" },
  privacy: { label: "Privacy policy", description: "Legal text.", href: "/privacy" },
  terms: { label: "Terms", description: "Legal text.", href: "/terms" },
  "not-found": { label: "404 page", description: "Shown for unknown URLs." },
  cards: { label: "Business cards", description: "Card page copy, labels and share text.", href: "/cards" },
};

export const PAGE_ORDER: PageKey[] = ["home", "about", "services", "work", "insights", "contact", "cards", "privacy", "terms", "not-found"];

/**
 * The After launch screen: the warranty, handover and care plans that follow
 * every project. Stored once, in the services page (`aftercare`), and shown on
 * the homepage and every service page.
 */
export const AFTERCARE_META = {
  label: "After launch",
  description: "Bug-fix warranty, handover and care plans.",
  /** Its admin screen (src/app/admin/(panel)/aftercare). */
  path: "/aftercare",
  /** The homepage section (service pages show a shorter version). */
  href: "/#aftercare",
  /** Where it's stored. */
  page: "services",
  field: "aftercare",
  /** Panel titles on its screen, by path key. */
  panels: {
    aftercare: {
      label: "Service page intro",
      description: "Heads the After launch block on every service page. The homepage section has its own heading and intro.",
    },
    "aftercare.warranty": {
      label: "Bug-fix warranty",
      description: "The card with the big number. Write {days} in its title or timeline to show the number of days.",
    },
    "aftercare.handover": {
      label: "Included in every handover",
      description: "The list beside the warranty card.",
    },
    "aftercare.plans": {
      label: "Care plans",
      description: "Quote-only plans, shown side by side. The contact form offers the same plans by name.",
    },
    "aftercare.moreLink": {
      label: "Service page link",
      description: "Closes the After launch block on every service page.",
    },
  },
} as const satisfies {
  label: string;
  description: string;
  path: string;
  href: string;
  page: PageKey;
  field: string;
  panels: Record<string, PanelCopy>;
};

/**
 * The Branding screen: the logo, the app icon and the browser colours. Stored
 * in the site settings (`brand`) and used everywhere the brand appears.
 */
export const BRAND_META = {
  label: "Branding",
  /** Its admin screen (src/app/admin/(panel)/branding). */
  path: "/branding",
  field: "brand",
  panels: {
    "brand.logo": {
      label: "Logo",
      description:
        "The logo shows in the header, the footer and on social cards; the symbol in the page transition; the stacked logo on the intro screen. Leave the image empty for the built-in grid mark. An SVG with the same name next to a file (primary.svg beside primary.png) takes over on the site.",
    },
    "brand.app": {
      label: "Favicon & app icon",
      description: "Browser tabs, bookmarks and phone home screens. Every size is made from one square image (an SVG with the same name next to it takes over).",
    },
  },
} as const satisfies { label: string; path: string; field: string; panels: Record<string, PanelCopy> };

/**
 * The Business cards screen: colours, the QR code and the contact rows of
 * every team member's card, with a live preview. Stored in the cards page
 * (`design`); each person's own phone, email or website is on their Team entry.
 */
export const CARDS_META = {
  label: "Business cards",
  description: "Colours, QR code and contact rows for every team card.",
  /** Its admin screen (src/app/admin/(panel)/business-cards). */
  path: "/business-cards",
  href: "/cards",
  page: "cards",
  field: "design",
  panels: {
    "design.front": {
      label: "Front (dark side)",
      description: "The logo and the QR code. Keep the code's colour much darker than its tile, or phones may not read it.",
    },
    "design.back": {
      label: "Back (light side)",
      description: "The logo and the contact rows. Rows with nothing to show (no phone number, say) are left out.",
    },
    "design.shape": {
      label: "Shape",
      description: "Corner roundness of the card and of the tiles and rows on it.",
    },
  },
} as const satisfies {
  label: string;
  description: string;
  path: string;
  href: string;
  page: PageKey;
  field: string;
  panels: Record<string, PanelCopy>;
};

export interface HomeSectionMeta {
  label: string;
  description: string;
  /** Collection that feeds the section. */
  collection?: CollectionName;
  /** What the section counts, singular and plural ("service", "services"). */
  units?: [string, string];
}

export const HOME_SECTION_META: Record<HomeSectionId, HomeSectionMeta> = {
  proof: { label: "Proof band", description: "Industries marquee and headline stats", collection: "stats", units: ["stat", "stats"] },
  problem: { label: "Problem", description: "The pains clients come with", collection: "problems", units: ["problem", "problems"] },
  services: { label: "Services", description: "What the studio offers", collection: "services", units: ["service", "services"] },
  process: { label: "Process", description: "How a project runs", collection: "process", units: ["step", "steps"] },
  aftercare: { label: "After launch", description: "Warranty, handover and care plans", units: ["care plan", "care plans"] },
  work: { label: "Selected work", description: "Featured case studies", collection: "projects", units: ["case study", "case studies"] },
  principles: { label: "Principles", description: "What the studio stands for", collection: "principles", units: ["principle", "principles"] },
  technology: { label: "Technology", description: "The tech orbit", collection: "technologies", units: ["category", "categories"] },
  audiences: { label: "Who it's for", description: "Audience tabs", collection: "audiences", units: ["audience", "audiences"] },
  testimonials: { label: "Testimonials", description: "Featured client quotes", collection: "testimonials", units: ["quote", "quotes"] },
  insights: { label: "Insights", description: "Latest articles", collection: "insights", units: ["article", "articles"] },
  faq: { label: "FAQ", description: "Questions in the home scope", collection: "faqs", units: ["question", "questions"] },
  cta: { label: "Closing call to action", description: "Always the last section" },
};

/** Guidance under fields, by dot path (most specific first) or field name. */
export const FIELD_HINTS: Record<string, string> = {
  "seo.title": "Search results and browser tab. The site name is added after it; aim for under 50 characters.",
  "seo.description": "The snippet under the title in search results. Aim for 120–160 characters.",
  "seo.noIndex": "Keep this page out of search engines.",
  // Site settings: search engines and analytics
  "seo.googleVerification": "Google Search Console › Ownership verification › HTML tag: paste only the content=\"…\" value.",
  "seo.bingVerification": "Bing Webmaster Tools › HTML meta tag (msvalidate.01): paste only the content=\"…\" value.",
  "seo.discourageSearchEngines":
    "Asks search engines to leave the whole site out: every page gets a noindex tag and the sitemap isn't advertised. For staging or before launch: turn it off when you go live.",
  // Site settings: AI answers and instant indexing (GEO)
  "seo.blockAiAnswers":
    "Off (recommended): ChatGPT search, Perplexity, Claude and other AI answer engines may read the site, so they can quote it and link to it. On: robots.txt asks them to stay away.",
  "seo.blockAiTraining":
    "On: robots.txt asks AI training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Common Crawl…) not to use the site to train models, and pages carry a text-and-data-mining opt-out. Search results and AI answers that cite the site aren't affected.",
  "seo.indexNowKey":
    "Optional. Lets Bing, Yandex and other IndexNow engines pick up changes within minutes (Bing also powers Copilot and ChatGPT search). Any 8–128 letters, digits or dashes, e.g. a UUID. It's published at /indexnow-key.txt; after each deploy, run npm run indexnow.",
  analytics: "Google Analytics 4. Visitors are only counted after they accept cookies.",
  "analytics.gaId": "Measurement ID, like G-XXXXXXXXXX (GA4 › Admin › Data streams). Empty: NEXT_PUBLIC_GA_ID is used if it's set, else analytics stay off.",
  // Site settings: the cookie banner (settings `consent`)
  consent:
    "The cookie banner every first-time visitor sees. With Google Analytics on, it asks them to accept analytics cookies. With it off, the site sets no cookies, so the banner only says so.",
  "consent.message": "Analytics on: asks visitors to accept analytics cookies.",
  "consent.accept": "Analytics on: the button that turns analytics on for the visitor.",
  "consent.decline": "Analytics on: the button that keeps analytics off.",
  "consent.essentialMessage":
    "Analytics off: no cookies are set, only a few essential settings (like this choice) in the browser, so say that rather than ask for consent.",
  "consent.acknowledge": "Analytics off: the banner's only button; it just closes it.",
  "consent.settings": "Footer link that reopens the banner.",
  // Branding (settings `brand`)
  "brand.logo.image":
    "SVG or a transparent PNG reads best on the dark site. Social cards can draw PNG, JPG, GIF and SVG; a WebP or AVIF logo shows on the site only.",
  "brand.logo.image.alt": "Optional. Screen readers hear the site's name either way, so this can stay empty.",
  "brand.logo.style": "With name: the image sits before the site's name (a symbol or monogram). Logo only: the image replaces the name (a full logo).",
  "brand.logo.height": "In pixels (16–96), in the header and footer. The header keeps it inside the bar.",
  "brand.logo.mark": "Optional. The symbol on its own, without the name: the page transition and other small spots. Empty: the app icon.",
  "brand.logo.mark.alt": "Optional. It's decorative, so this can stay empty.",
  "brand.logo.stacked":
    "Optional. The symbol above the name, centred on the intro screen while the 3D loads. Empty: the symbol and the site's name.",
  "brand.logo.stacked.alt": "Optional. It's decorative, so this can stay empty.",
  "brand.app.icon": "Square, at least 512 × 512, PNG or SVG. Leave it empty for the built-in icon.",
  "brand.app.icon.alt": "Optional. Icons aren't described anywhere, so this can stay empty.",
  "brand.app.iconBackground":
    "Sets the icon on a rounded tile of this colour, with some padding. Empty: the image is used as it is (best when it has its own background).",
  "brand.app.themeColor": "Tints the browser bar on phones and the installed app's splash screen. Hex colour, e.g. #04070a.",
  heading: "Wrap words in *asterisks* to highlight them. Press Enter for a line break.",
  headline: "Wrap words in *asterisks* to highlight them.",
  slug: "Lowercase words joined by dashes. Used in the URL, so renaming it changes the link.",
  key: "Lowercase words joined by dashes. Used as an internal ID.",
  id: "Lowercase words joined by dashes. Used as an internal ID.",
  href: "Internal path (/work), section link (#faq), full URL, mailto: or tel: link.",
  external: "Open in a new tab.",
  alt: "Describe the image for screen readers and search engines.",
  src: "Pick a file from /public with Browse, or type its path (e.g. /images/work/cover.jpg).",
  accent: "Hex colour, e.g. #3ce49a.",
  color: "Hex colour, e.g. #3ce49a.",
  short: "1–4 characters drawn on the planet.",
  node: "Which node lights up in the monitor visual (0–9).",
  publishedAt: "Publish date. Articles are listed newest first.",
  updatedAt: "Shown as “Updated” when set.",
  featured: "Highlight this item.",
  published: "Off hides it from the site without deleting it.",
  "body[].text": "Supports **bold**, *emphasis*, `code` and [links](https://…).",
  // Answers that voice assistants and AI answers can quote (FAQs, articles)
  question: "Write it the way people ask, out loud or in a chat (“How long does a website take?”). Voice assistants and AI answers match questions like this.",
  answer: "Lead with the direct answer in one sentence, then the detail. Around 40–60 words reads well aloud and is easy for AI answers to quote.",
  takeaway: "The article's answer in one or two sentences. Shown at the end, read out by voice assistants, and given to AI engines as the summary.",
  "detail.takeaway": "Label above the key takeaway at the end of each article.",
  // After launch (services page `aftercare`)
  aftercare: "Heading and intro of the homepage's After launch section. The warranty, handover and care plans have a screen of their own: After launch, in the sidebar.",
  "aftercare.lede": "Write {days} to show the warranty length.",
  "aftercare.warranty.days": "Length of the free bug-fix window: the big number, and what {days} shows in the copy.",
  "aftercare.warranty.unit": "Beside the big number, e.g. “days”.",
  "aftercare.warranty.label": "Small heading at the top of the card.",
  "aftercare.warranty.title": "Write {days} to show the number of days.",
  "aftercare.warranty.timeline": "Exactly three stops under the card: launch, the end of the warranty, then what follows. {days} works here.",
  "aftercare.handover.label": "Heading of the list.",
  "aftercare.plans.label": "Heading above the plans.",
  "aftercare.plans.lede": "Under the heading, on the homepage. {days} works here too.",
  "aftercare.plans.responseLabel": "Heading above each plan's response time.",
  "aftercare.plans.bestForLabel": "Heading above each plan's “best for” line.",
  "aftercare.plans.featuredLabel": "Badge on the featured plan.",
  "aftercare.plans.note": "Small print shown with the plans. {days} works here too.",
  "aftercare.plans.items[].name": "Renaming a plan? Change its quote link (/contact?plan=…) to match.",
  "aftercare.plans.items[].response": "Guaranteed first-response time (the plan's SLA).",
  "aftercare.plans.items[].features": "What the plan includes (homepage only). Press Enter to add the next one.",
  "aftercare.plans.items[].featured": "Highlight it as the most chosen plan. Only one plan can be featured.",
  "aftercare.plans.items[].cta": "No prices: each plan asks for a quote. /contact?plan=Name starts the message with the plan's name.",
  // Site settings: structured data and app manifest (settings `seo`)
  "seo.areaServed": "Structured data: where the studio works, e.g. “Worldwide” or a country.",
  "seo.availableLanguages": "Structured data: languages you answer enquiries in, e.g. English.",
  "seo.contactType": "Structured data: the kind of contact, e.g. “sales” or “customer support”.",
  "seo.offerCatalogName": "Structured data: the name of your list of services.",
  "seo.deliverablesName": "Structured data: a service's list of deliverables. Write {title} for the service's title.",
  "seo.category": "Page metadata category, e.g. “technology”.",
  "seo.manifestCategories": "App store-style categories for the installed app, lowercase (business, productivity, design…).",
  // Site settings: screen-reader names and code blocks (settings `ui`)
  "ui.homeLinkLabel": "Screen readers: the logo link in the header and footer. Write {name} for the site's name.",
  "ui.primaryNavLabel": "Screen readers: the header's main navigation.",
  "ui.footerNavLabel": "Screen readers: the footer's link columns.",
  "ui.breadcrumbLabel": "Screen readers: the breadcrumb trail on inner pages.",
  "ui.copyCode": "Code blocks in articles and legal pages: the copy button.",
  "ui.copiedCode": "Code blocks: the button once the code is copied.",
  "ui.copyCodeLabel": "Code blocks: what screen readers call the copy button.",
  "ui.callouts": "Callout titles in articles and legal pages when a callout has no title of its own.",
  // Site settings: /llms.txt and /llms-full.txt (settings `llms`)
  llms: "The site as Markdown for AI assistants (/llms.txt, /llms-full.txt). Write headings and labels without Markdown: ## and : are added.",
  "llms.fullLede": "Under the intro of /llms-full.txt. Write {url} for the address of /llms.txt.",
  "llms.headings.about": "Write {name} for the site's name.",
  "llms.headings.process": "Also the name of the /llms.txt link to the process.",
  "llms.labels.fullContent": "The /llms.txt link to /llms-full.txt.",
  "llms.labels.fullContentDescription": "After that link.",
  "llms.labels.more": "Before the link to the process on the About page.",
  "llms.labels.deliverables": "After each process step.",
  "llms.labels.url": "Before each page's address.",
  "llms.labels.serviceQuestions": "Over a service's own FAQs. Write {title} for the service's title.",
  "llms.labels.startProject": "Before the link to the contact page.",
  // Pages: labels screen readers hear
  "work.prevLabel": "Screen readers: the previous-project button.",
  "work.nextLabel": "Screen readers: the next-project button.",
  "testimonials.carouselLabel": "Screen readers: what the carousel is, e.g. “carousel”.",
  "testimonials.slideRoleLabel": "Screen readers: what each quote is, e.g. “slide”.",
  "insights.readLabel": "Call to action on the open article card, e.g. “Read article”.",
  "insights.prevLabel": "Screen readers: the previous-article button.",
  "insights.nextLabel": "Screen readers: the next-article button.",
  "aftercare.warranty.icon": "Icon beside the warranty's label.",
  "detail.shareOn": "Platform names in the share buttons (“Share on X”).",
  "form.planMessage": "Starts the message when a visitor picks a care plan (/contact?plan=…). Write {plan} for the plan's name.",
  // Contact page: the emails each enquiry sends
  emails:
    "Sent for every enquiry. Placeholders: {name}, {firstName}, {company}, {site} (the site's name) and {host} (its domain).",
  "emails.alert": "To the studio (the owners and LEAD_EMAIL_TO).",
  "emails.alert.senderName": "Sender name, unless LEAD_EMAIL_FROM sets one.",
  "emails.alert.subjectWithCompany": "Subject when the visitor gave a company.",
  "emails.alert.notSavedPrefix": "Before the subject when the enquiry couldn't be saved to the database.",
  "emails.confirmation":
    "To the visitor, confirming you got their message. It also shows the studio's response time, contact details and socials from Site settings, and the contact page's “What happens next” steps.",
  "emails.confirmation.subject": "{firstName} and {site} work well here.",
  "emails.confirmation.greeting": "Plain-text version only (mail apps that don't show HTML).",
  "emails.confirmation.body": "Plain-text version only.",
  "emails.confirmation.signOff": "Plain-text version only; the site's name follows it.",
  "emails.confirmation.heading": "The big heading of the HTML email.",
  "emails.confirmation.message": "Under the heading. The response time from Site settings › Contact is shown after it.",
  "emails.confirmation.badge": "Pill in the dark header. Empty: “Inquiry received”.",
  "emails.confirmation.heroAlt": "Describes the picture under the header for screen readers and when images are off. Empty: “Message received”.",
  "emails.confirmation.summaryLabel": "Heading of the card that repeats the services and timeline the visitor picked. Empty: “Your inquiry”.",
  "emails.confirmation.ctaLabel": "The button to the work page. Empty: “Explore our work”. “Book a call” appears beside it when Site settings has a booking link.",
  "emails.confirmation.replyNote": "Above the contact details: tell them replying to the email reaches you. Empty: a built-in line.",
  "emails.confirmation.footer": "Small print at the bottom: why they got this email. Empty: a built-in line.",
  // Business cards: the design (cards page `design`)
  "design.front.background": "The dark side's background.",
  "design.front.logo": "The symbol and “Grid” in the wordmark.",
  "design.front.wordmark": "“growth” in the wordmark.",
  "design.front.qrPanel": "The tile behind the QR code. A light colour scans best.",
  "design.front.qrInk": "The QR code itself. Keep it dark (black or near-black) on a light tile.",
  "design.front.qr":
    "What scanning opens. Card: this person's card page (save the contact, share it). Contact: adds the contact straight to the phone (a denser code). Website: their website, or the studio's.",
  "design.back.background": "The light side's background.",
  "design.back.logo": "The symbol and “Grid” in the wordmark.",
  "design.back.wordmark": "“growth” in the wordmark.",
  "design.back.rows": "Up to five rows, top to bottom, each at most once. Phone, email and website fall back to the studio's when a person has none of their own.",
  "design.back.pill": "The rows' colour (and the tab on the left edge).",
  "design.back.pillInk": "Text and icons on the rows.",
  "design.back.highlight": "The row drawn in the highlight colours, usually the name.",
  "design.back.highlightPill": "The highlighted row's colour.",
  "design.back.highlightInk": "Text and icon on the highlighted row.",
  "design.back.sideTab": "The rounded tab on the left edge.",
  "design.shape.corners": "Card corners on screen, 0–60 (at the card's 1050 px width). Downloads stay square-cornered, ready for print.",
  "design.shape.radius": "The QR tile, side tab and rows, 0–40. 33 or more makes the rows full pills.",
  // Business cards: page copy
  "member.seoTitle": "Title of each person's card page and its share sheet. {name}, {role} and {site} are filled in.",
  "member.seoDescription": "Search snippet of each person's card page. {name}, {role} and {site} are filled in.",
  "member.shareText": "Sent with a shared link (WhatsApp, email, the phone's share sheet). {name}, {role} and {site} are filled in.",
  "labels.cardAlt": "What screen readers hear for the card. {name} and {side} are filled in.",
  "labels.downloadHint": "Under the download buttons.",
  // Team: each person's business card (team `card`)
  card: "Their business card at /cards/<slug>. Anything left empty uses the studio's details from Site settings.",
  "card.enabled": "Off: no card for this person. Hidden team members never get one.",
  "card.name": "Only if the card should spell the name differently from the About page.",
  "card.phone": "Their direct line, written as it should read, e.g. +91 83204 81381. Empty: the studio's number.",
  "card.email": "Empty: the studio's email.",
  "card.website": "A personal site or booking page. Empty: the studio's website.",
};
