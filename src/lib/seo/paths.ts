/* ─────────────────────────────────────────────────────────────
   Machine-readable files the site publishes, served by route
   handlers under src/app. One place for the paths, so metadata
   links, robots rules, scripts and content validation agree.
   ───────────────────────────────────────────────────────────── */

/** RSS 2.0 feed of the insights (src/app/(site)/insights/feed.xml). */
export const FEED_PATH = "/insights/feed.xml";

/** The site in brief for AI assistants (llmstxt.org). */
export const LLMS_PATH = "/llms.txt";

/** The site's content in one Markdown file for AI assistants. */
export const LLMS_FULL_PATH = "/llms-full.txt";

/** IndexNow key file (Site settings › SEO › IndexNow key). */
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";
