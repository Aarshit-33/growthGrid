import type { Metadata } from "next";
import type { Seo, Settings } from "@/lib/schemas";
import { absoluteUrl } from "@/lib/utils";
import { FEED_PATH } from "./paths";

/* ─────────────────────────────────────────────────────────────
   Page metadata builder. Every route calls this from
   generateMetadata so titles, descriptions, canonicals and social
   cards are consistent and always come from content.

   OG images come from `opengraph-image.tsx` files (file-based
   metadata), which Next merges in automatically — so we never set
   `openGraph.images` here.
   ───────────────────────────────────────────────────────────── */

interface BuildMetadataOptions {
  settings: Settings;
  seo: Seo;
  /** Site-relative path of the page, e.g. "/services/websites". */
  path: string;
  /** Use the SEO title verbatim instead of the site title template. */
  absoluteTitle?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  tags?: string[];
}

/** True when the title should skip the "%s | Brand" template (explicitly, or because it already names the brand). */
function isAbsolute(settings: Settings, seo: Seo, absolute: boolean) {
  return absolute || seo.title.toLowerCase().includes(settings.name.toLowerCase());
}

export function fullTitle(settings: Settings, seo: Seo, absolute = false) {
  return isAbsolute(settings, seo, absolute) ? seo.title : settings.seo.titleTemplate.replace("%s", seo.title);
}

export function buildMetadata({
  settings,
  seo,
  path,
  absoluteTitle = false,
  type = "website",
  publishedTime,
  modifiedTime,
  authors,
  tags,
}: BuildMetadataOptions): Metadata {
  const url = absoluteUrl(path, settings.url);
  const absolute = isAbsolute(settings, seo, absoluteTitle);
  const title = fullTitle(settings, seo, absolute);
  // Only set when this page differs from the root layout: Next replaces the whole
  // `robots` field, so even an undefined value here would drop the site's tags.
  const robots: Metadata["robots"] = settings.seo.discourageSearchEngines
    ? { index: false, follow: false } // Site settings › SEO › Discourage search engines
    : seo.noIndex
      ? { index: false, follow: true }
      : undefined;

  return {
    title: absolute ? { absolute: seo.title } : seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
      // Feed readers and AI tools discover the articles' RSS feed from any page. Set here,
      // not in the root layout: a page's `alternates` replace the layout's entirely.
      types: { "application/rss+xml": [{ url: absoluteUrl(FEED_PATH, settings.url), title: settings.name }] },
    },
    openGraph: {
      type,
      url,
      title,
      description: seo.description,
      siteName: settings.name,
      locale: settings.locale,
      ...(type === "article"
        ? { publishedTime, modifiedTime: modifiedTime ?? publishedTime, authors, tags }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: seo.description,
      site: settings.seo.twitterHandle,
      creator: settings.seo.twitterHandle,
    },
    ...(robots ? { robots } : {}),
  };
}
