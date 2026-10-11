# growthGrid — website

The marketing site for **growthGrid**, a growth-focused digital product studio. It's built to be fast, accessible and SEO-first. Every piece of copy lives in content files, not in components.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4, with tokens in `src/app/globals.css` |
| Motion | Motion (`motion/react`), GSAP + ScrollTrigger, Lenis smooth scroll |
| 3D | three.js via React Three Fiber and drei: one shared canvas, loaded on idle |
| Content | JSON files in `/content` validated by Zod. Can be switched to MongoDB (Mongoose models included). |

## Getting started

Requires **Node 20.19+, 22.13+ or 24+** (ESLint 10's minimum; the site itself runs on Node ≥ 20.9). The project was built with Node 24 via nvm.

```bash
npm install
npm run dev          # http://localhost:3000
```

If Node isn't on your PATH (nvm install): `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` / `npm start` | Production build (runs `validate:content` first) and serve |
| `BUILD_STANDALONE=1 npm run build` | Same build, plus a self-contained server in `.next/standalone` for a VPS or Docker. Copy `public/` and `.next/static/` into it (Next doesn't), then run `HOSTNAME=0.0.0.0 node server.js` |
| `npm run validate:content` | Validates all content: schemas, cross-references, internal links, image files, SEO lengths, FAQ answers that read well aloud |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run seed` | Copies `/content` into MongoDB (see below) |
| `npm run indexnow` | After a deploy: tells Bing, Yandex and the other IndexNow engines which pages changed (see SEO) |

## Editing content

All user-visible text, labels, SEO metadata and image alt text live in `/content`:

```
content/
  settings.json          # brand, navigation, contact details, socials, UI labels
  services.json          # the six services (+ detail pages)
  projects.json          # case studies (+ interactive "live snapshot" data)
  insights.json          # articles (portable rich-text blocks)
  testimonials.json  team.json  faqs.json  technologies.json
  process.json  principles.json  audiences.json  problems.json  stats.json
  pages/*.json           # per-page copy: home, about, services, work, insights,
                         # contact, privacy, terms, not-found
```

- **Schemas are the source of truth.** Each file is validated by the Zod schemas in `src/lib/schemas/*`, both at runtime and by `npm run validate:content`. A typo fails loudly and points at the exact field.
- **Inline formatting.** Headings accept `*emphasis*` (rendered in the serif accent) and `\n` line breaks. Body text accepts `**bold**`, `*italic*`, `` `code` `` and `[links](/path)`.
- **Typography.** Straight quotes are fine. `we're` and `"quote"` render as `we’re` and `“quote”`.
- **Images.** They live in `public/images/**`; upload them in Studio › Media library or add them to the folder. Every image needs `alt` text in the content (the logo and app icon are the exception: the site's name is always there as text). The logo files have their own folder: see below.
- New case studies, articles and services get their pages, sitemap entries, JSON-LD and Open Graph images automatically.

## Logo and icons

The brand files live in `public/logo/`. `content/settings.json › brand` (Studio › Branding) says which goes where:

| File | Where it shows |
|---|---|
| `primary.png` | Header, footer and social cards |
| `secondary.png` | Intro screen, while the 3D loads (the symbol above the name) |
| `submark.png` | Page transition (the symbol alone) |
| `app-icon.png` | Favicon, bookmarks and home-screen icons: every size is generated from it |

**To change one, just replace the file.** Either overwrite it with a new one of the same name, or drop an SVG with the same name next to it (`primary.svg` beside `primary.png`): the SVG takes over, and the PNG can stay or go. Then commit, build and deploy. Nothing else needs editing. Sizes are read from the files, and every URL carries a fingerprint of the file (`?v=…`), so browsers fetch the new version (`src/lib/brand-files.ts`).

**When asking the designer for SVGs:** text converted to outlines (an SVG shown as an image can't load the site's fonts, so live text falls back to another typeface), the artboard cropped to the artwork with no extra margin (the site sizes the logo from the file), and the app icon on a square artboard.

The artwork is made for the dark site (white lettering), so search engines get the app icon as the Organization logo, which reads on white too.

## Switching to MongoDB

Pages read content through a single repository, `src/lib/data`, so switching the source needs no page changes.

1. Copy `.env.example` to `.env.local`. Set `MONGODB_URI` (and optionally `MONGODB_DB`).
2. Run `npm run seed -- --check` for a dry run. It needs no database: it round-trips every document through the Mongoose models.
3. Run `npm run seed` to upsert everything. `npm run seed -- --prune` also deletes documents that have been removed from the JSON.
4. Set `CONTENT_SOURCE=mongo` and restart.

The Mongoose models are in `src/lib/models`. Every document is still validated by Zod when it's read, whatever the source.

## Contact form and leads

`/contact` works with or without JavaScript:

- **Without JS** it's a native form POST, followed by a redirect back with a status message.
- **With JS** it validates inline and shows the result in place.

`POST /api/contact` re-validates the submission with the same schema. It also rejects spam via a honeypot field and rate-limits each IP to 5 submissions per 10 minutes.

Leads are stored in MongoDB when `MONGODB_URI` is set. Otherwise they're appended to `.data/leads.ndjson`, which is git-ignored and meant for local development only. Either way, they're read, triaged and exported in Studio › Leads.

Each enquiry is emailed to `hello@growthgrid.studio` and `aarshitjolapara11@gmail.com` over SMTP (Gmail with an App Password, Zoho, Google Workspace, Resend…). `LEAD_EMAIL_TO` can add more recipients. The person who submitted the form also receives a confirmation that their message arrived. When the lead is saved, both emails are sent after the response so the form doesn't wait for the mail server. If saving fails (for example, on a read-only host), the route sends the emails before reporting success; if the studio notification fails, the visitor can retry. Emails use Reply-To to answer the visitor directly, and storage-fallback notifications are marked "Not saved". Spam caught by the honeypot isn't emailed. SMTP credentials are required; setup is in `.env.example`, and the code is in `src/lib/leads/email.ts`.

## Studio (admin)

A private editor for everything in `/content`, at `/admin` (or the address in `ADMIN_PATH`). It only exists when `ADMIN_SESSION_SECRET` and at least one `ADMIN_<n>_…` user are set: see `.env.example` for users and roles. Every change is checked on the server against the person's role, and content changes are recorded in History.

Alongside the content screens (collections, pages, homepage layout, history), it has:

| Screen | Who | What it's for |
|---|---|---|
| Branding | owner | Logo (next to the site name or on its own, and its height), symbol, stacked logo, favicon and app icon, icon background and theme colour, with a live preview |
| Media library | everyone (deleting: owner, editor) | Every image in `/public` and where the content uses it. Upload with the button, by drag and drop, or by pasting |
| Leads | owner, editor | Contact-form enquiries: search, filter and set a status, reply by email, export to CSV, delete |
| Site settings | owner | Name, contact details, navigation, SEO and analytics |

- **Branding.** With nothing set, the site uses the built-in grid mark and icon files, byte for byte. A logo shows in the header, footer, Studio and Open Graph images; the symbol in the page transition; the stacked logo on the intro screen. Every icon (`/favicon.ico` and `/brand/*`: 32, 180, 192 and 512 px, plus a maskable 512) is generated from the app icon, which is also the Organization JSON-LD logo (the uploaded logo is used there only without an app icon).
- **Uploads** go into `public/images/uploads` (or another folder in `public/images`): PNG, JPG, WebP, AVIF, GIF or SVG, up to 8 MB (SVGs 1 MB, with no scripts). They need a writable file system, so upload while running the studio locally with `npm run dev`, then commit and redeploy.
- **Deleting** only works for images in `public/images` that nothing in the content uses. The file moves to `.data/deleted-media` (git-ignored), so it can be put back by hand.
- **Analytics.** The GA4 measurement ID in Site settings wins over `NEXT_PUBLIC_GA_ID`. With neither, no analytics code ships and there's no cookie banner.
- **Search engines.** Site settings › SEO takes the Google and Bing verification codes. "Discourage search engines" (for a staging copy) adds `noindex, nofollow` to every page and drops the sitemap from `robots.txt`. Crawling stays allowed, so search engines can see the `noindex`.
- **AI search.** Also in Site settings › SEO: "Block AI answer engines" (ChatGPT search, Perplexity, Claude…: off by default, so they can quote and link to the site), "Block AI training crawlers" (GPTBot, ClaudeBot, Google-Extended…: off by default) and the IndexNow key. Both blocks are switched on automatically while search engines are discouraged.

## SEO

- Per-page metadata comes from content: canonical URL, Open Graph and Twitter tags. Page titles are de-duplicated against the brand name.
- JSON-LD covers:
  - Organization (with `knowsAbout`: the services and technologies) and WebSite
  - Service and ProfessionalService
  - BlogPosting (articles, with the key takeaway as `abstract`) and CreativeWork (case studies)
  - FAQPage and BreadcrumbList
  - WebPage, CollectionPage, AboutPage and ContactPage
- Dynamic Open Graph images (`opengraph-image.tsx`) are generated for every page and item.
- `sitemap.xml` includes real `lastmod` dates and images; there's also `robots.txt`, a web manifest and icons (from Studio › Branding, or the built-in set).
- Semantic landmarks, one `h1` per page, and server-rendered content (widgets only enhance it).
- `NEXT_PUBLIC_SITE_URL` overrides the site URL for a deployment. It defaults to `url` in `content/settings.json`.

### AI answers, voice and search experience (GEO, LLMO, VSO, SXO)

Everything is generated from content, so it stays current with no extra work.

- **AI answer engines (GEO).** `robots.txt` names the AI crawlers in two groups (see `src/lib/seo/ai-crawlers.ts`). Answer engines fetch pages to quote and cite them; training crawlers collect text for models. Each group has its own switch in Site settings › SEO. With "Block AI training crawlers" on, pages also carry the W3C TDMRep `tdm-reservation` opt-out.
- **LLM-readable site (LLMO).** `/llms.txt` is a short Markdown map of the site ([llmstxt.org](https://llmstxt.org)). `/llms-full.txt` has every service, case study, article and FAQ in one file. Pages flagged `noIndex` stay out. So do stats, service outcome figures, testimonials and team bios: they're claims that need verifying first, and AI engines repeat whatever they read.
- **Voice search (VSO).** Every page's JSON-LD has `speakable` selectors pointing at the hero headline and lede, plus the key takeaway on articles (ids in `src/lib/seo/speakable.ts`). FAQ answers double as spoken answers, so `validate:content` flags questions without a `?` and answers over 80 words.
- **Search experience (SXO).** Breadcrumbs, FAQ rich results, an RSS feed at `/insights/feed.xml` (linked from every page), and in-page anchors such as `/about#process` that land on the right section.
- **IndexNow.** Add a key in Site settings › SEO and deploy; it's served at `/indexnow-key.txt`. After each deploy, `npm run indexnow` submits every sitemap URL (`-- /path` for specific pages, `-- --dry-run` to preview). Bing's index also feeds Copilot and ChatGPT search.

## Project structure

```
src/
  app/                 routes, metadata files (sitemap, robots, manifest, OG images), brand icons, API
  assets/brand/        the built-in favicon, SVG and Apple icons
  components/
    admin/             the Studio: editors, branding, media library, leads inbox
    ui/                primitives (buttons, reveal, split headings, accordion, icons…)
    layout/            header, mobile menu, footer, smooth scroll, cursor
    sections/          shared page sections (hero, CTA, FAQ, stats, process)
    home/ services/ work/ insights/ contact/ …   page-specific components
    showcase/          interactive case-study widgets (flow, dashboard, triage)
    three/             R3F stage + scenes (growth field, principles, tech orbit)
  lib/
    admin/             Studio server code: auth, roles, actions, media, leads, history
    data/              content repository (JSON | Mongo)
    schemas/           Zod schemas + types
    models/            Mongoose models
    seo/               metadata, JSON-LD, speakable ids, AI crawler rules, llms.txt, OG and icon helpers
content/               JSON content
scripts/               validate-content, seed, indexnow
```

## Accessibility and motion

- The site is keyboard-operable, with visible focus states, a skip link, and ARIA tabs, carousel and accordion patterns.
- Live regions announce dynamic changes.
- `prefers-reduced-motion` is respected everywhere: pinned and scroll-driven effects fall back to static layouts, and the 3D scenes pause when off-screen.
