import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/data";
import { aiCrawlerRules, PRIVATE_PATHS } from "@/lib/seo/ai-crawlers";
import { absoluteUrl } from "@/lib/utils";

/**
 * /robots.txt — crawl everything public, never the API; point to the sitemap.
 * Site settings › SEO › Discourage search engines (staging, pre-launch): every
 * page carries a noindex tag and the sitemap isn't advertised. Crawling stays
 * allowed on purpose: a crawler blocked here never sees the noindex, and
 * blocked URLs can still be listed from links elsewhere.
 *
 * AI crawlers get blocks of their own (lib/seo/ai-crawlers.ts): answer engines
 * that cite the site, and training crawlers, each switched in Site settings ›
 * SEO. With Discourage search engines on, both are shut out.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  const rules = [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, ...aiCrawlerRules(settings.seo)];
  if (settings.seo.discourageSearchEngines) return { rules };
  return {
    rules,
    sitemap: absoluteUrl("/sitemap.xml", settings.url),
    host: settings.url,
  };
}
