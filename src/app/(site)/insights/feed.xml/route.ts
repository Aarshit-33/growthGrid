import { getInsights, getPage, getSettings } from "@/lib/data";
import { fullTitle } from "@/lib/seo/metadata";
import { FEED_PATH } from "@/lib/seo/paths";
import { absoluteUrl } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   /insights/feed.xml: RSS 2.0 feed of the articles, newest
   first, for feed readers, aggregators and AI tools that watch
   for new content. Every page links to it (<link rel="alternate">,
   from buildMetadata). Built at build time.
   ───────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xml = (text: string) => text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char]);

/** RFC 822 date (RSS) for an ISO calendar date, at midnight UTC. */
const rfc822 = (iso: string) => new Date(`${iso}T00:00:00Z`).toUTCString();

export async function GET() {
  const [settings, page, all] = await Promise.all([getSettings(), getPage("insights"), getInsights()]);
  const url = (path: string) => absoluteUrl(path, settings.url);
  const insights = all.filter((insight) => !insight.seo.noIndex);
  const latest = insights
    .map((insight) => insight.updatedAt ?? insight.publishedAt)
    .sort()
    .at(-1);

  const items = insights.map((insight) => {
    const link = url(`/insights/${insight.slug}`);
    return [
      "    <item>",
      `      <title>${xml(insight.title)}</title>`,
      `      <link>${xml(link)}</link>`,
      `      <guid isPermaLink="true">${xml(link)}</guid>`,
      `      <pubDate>${rfc822(insight.publishedAt)}</pubDate>`,
      `      <description>${xml(insight.excerpt)}</description>`,
      `      <category>${xml(insight.category.label)}</category>`,
      "    </item>",
    ].join("\n");
  });

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(fullTitle(settings, page.seo))}</title>`,
    `    <link>${xml(url("/insights"))}</link>`,
    `    <description>${xml(page.seo.description)}</description>`,
    `    <language>${xml(settings.locale.replace("_", "-").toLowerCase())}</language>`,
    ...(latest ? [`    <lastBuildDate>${rfc822(latest)}</lastBuildDate>`] : []),
    `    <atom:link href="${xml(url(FEED_PATH))}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
