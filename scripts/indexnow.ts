/**
 * Tells the IndexNow search engines (Bing, Yandex, Naver, Seznam…) which pages
 * changed, so they recrawl in minutes instead of days. Bing's index also feeds
 * Copilot and ChatGPT search, so AI answers pick the changes up sooner too.
 *
 *   npm run indexnow                           # every URL in the live sitemap
 *   npm run indexnow -- /insights/a-new-post   # only these paths (or full URLs)
 *   npm run indexnow -- --dry-run              # show what would be sent
 *   npm run indexnow -- --site=https://example.com
 *
 * Run it after a deploy. The key and the sitemap are read from the live site,
 * so they always match what's deployed: add the key in Studio › Site settings ›
 * SEO › IndexNow key and deploy before the first run. The site defaults to
 * NEXT_PUBLIC_SITE_URL (.env.local / .env), else the URL in Site settings.
 */
import { rawSettings } from "../src/lib/content/raw";
import { indexNowKeySchema, settingsSchema } from "../src/lib/schemas";
import { INDEXNOW_KEY_PATH } from "../src/lib/seo/paths";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* optional */
  }
}

/** The shared endpoint: one submission reaches every participating engine. */
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** Most URLs the protocol accepts in one request. */
const BATCH = 10_000;

/** What each response means (indexnow.org/documentation). */
const STATUS: Record<number, string> = {
  200: "Submitted.",
  202: "Accepted. The engines are still verifying the key; later runs go straight through.",
  400: "Bad request: the submission was malformed.",
  403: "Forbidden: the key wasn't found at the key location, or doesn't match it.",
  422: "Unprocessable: some URLs don't belong to the host, or the key isn't valid.",
  429: "Too many requests: wait a while before submitting again.",
};

/** Hosts IndexNow can't crawl: this machine and private networks. */
const PRIVATE_HOST = /^(localhost|.+\.localhost|.+\.local|127(\.\d+){3}|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|\[::1\])$/;

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (text: string) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const siteArg = args.find((arg) => arg.startsWith("--site="))?.slice("--site=".length);
const paths = args.filter((arg) => !arg.startsWith("--"));

function fail(message: string): never {
  console.error(`\n✖  ${message}\n`);
  process.exit(1);
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The live site's origin: --site, else NEXT_PUBLIC_SITE_URL, else Site settings › URL. */
function siteOrigin(): URL {
  const fromSettings = settingsSchema.pick({ url: true }).safeParse(rawSettings).data?.url;
  const raw = [siteArg, process.env.NEXT_PUBLIC_SITE_URL, fromSettings].map((value) => value?.trim()).find(Boolean);
  if (!raw || !URL.canParse(raw)) fail("No site URL. Pass one: npm run indexnow -- --site=https://your-domain");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") fail(`${raw} isn't a web address.`);
  if (PRIVATE_HOST.test(url.hostname)) {
    fail(`${url.origin} isn't public, and IndexNow only crawls live sites. Pass one: --site=https://your-domain`);
  }
  return new URL(url.origin);
}

async function get(url: string): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    fail(`Couldn't reach ${url}: ${reason(error)}`);
  }
}

/** The key the live site publishes (proof the submissions come from its owner). */
async function liveKey(keyLocation: string): Promise<string> {
  const response = await get(keyLocation);
  if (response.status === 404) {
    fail(
      `No IndexNow key at ${keyLocation}.\n   Add one in Studio › Site settings › SEO › IndexNow key (with Discourage search engines off), deploy, then run this again.`,
    );
  }
  if (!response.ok) fail(`${keyLocation} answered ${response.status}.`);
  const key = (await response.text()).trim();
  if (!indexNowKeySchema.safeParse(key).success) fail(`${keyLocation} doesn't hold a valid key (8–128 letters, digits or dashes).`);
  return key;
}

/** Every page URL in the live sitemap (image entries are <image:loc>, so they're skipped). */
async function sitemapUrls(site: URL): Promise<string[]> {
  const sitemap = new URL("/sitemap.xml", site).href;
  const response = await get(sitemap);
  if (!response.ok) fail(`${sitemap} answered ${response.status}.`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => decodeXml(match[1]));
}

async function main() {
  const site = siteOrigin();
  const keyLocation = new URL(INDEXNOW_KEY_PATH, site).href;
  const key = await liveKey(keyLocation);

  const requested = paths.length > 0 ? paths.map((path) => new URL(path, site).href) : await sitemapUrls(site);
  const urls = [...new Set(requested)];
  if (urls.length === 0) fail("Nothing to submit: the sitemap lists no pages.");
  const elsewhere = urls.filter((url) => new URL(url).host !== site.host);
  if (elsewhere.length > 0) {
    fail(
      `These URLs aren't on ${site.host}, so IndexNow would reject them:\n   ${elsewhere.slice(0, 5).join("\n   ")}\n   The sitemap uses the site's own URL: pass that with --site=…`,
    );
  }

  console.log(`\nIndexNow · ${site.host}`);
  console.log(`  key   ${keyLocation} ✓`);
  console.log(`  URLs  ${urls.length}${paths.length > 0 ? "" : " (the whole sitemap)"}`);

  if (dryRun) {
    for (const url of urls) console.log(`        ${url}`);
    console.log("\n(dry run: nothing was sent)\n");
    return;
  }

  for (let start = 0; start < urls.length; start += BATCH) {
    const urlList = urls.slice(start, start + BATCH);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: site.host, key, keyLocation, urlList }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      fail(`Couldn't reach ${ENDPOINT}: ${reason(error)}`);
    }
    const meaning = STATUS[response.status] ?? (await response.text()).trim().slice(0, 200);
    if (!response.ok) fail(`IndexNow answered ${response.status}. ${meaning}`);
    console.log(`\n✔  ${response.status} · ${urlList.length} URL(s). ${meaning}`);
  }
  console.log("   Bing, Yandex and the other IndexNow engines will recrawl them shortly.\n");
}

main().catch((error) => fail(reason(error)));
