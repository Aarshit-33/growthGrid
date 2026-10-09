import "server-only";
import { getPage, getSettings } from "@/lib/data";
import { headingText } from "@/lib/utils/text";
import { ogImageMetadata, renderOgImage } from "./og";

/* ─────────────────────────────────────────────────────────────
   Shared implementations for `opengraph-image.tsx` routes whose
   social card is simply the page hero (eyebrow + headline).
   Detail routes (services/work/insights [slug]) build their own
   cards from the item they render.
   ───────────────────────────────────────────────────────────── */

type HeroPageKey = "home" | "about" | "services" | "work" | "insights" | "contact";

/** For `generateImageMetadata`: alt text = the plain-text headline. */
export async function heroOgMetadata(key: HeroPageKey) {
  const page = await getPage(key);
  return ogImageMetadata(headingText(page.hero.headline));
}

/** For the default export: renders the branded card. */
export async function heroOgImage(key: HeroPageKey) {
  const [settings, page] = await Promise.all([getSettings(), getPage(key)]);
  return renderOgImage({ eyebrow: page.hero.eyebrow, title: page.hero.headline, settings });
}

type LegalPageKey = "privacy" | "terms";

/** For `generateImageMetadata` on legal pages: alt text = the document title. */
export async function legalOgMetadata(key: LegalPageKey) {
  const page = await getPage(key);
  return ogImageMetadata(page.title);
}

/** Branded card for legal pages (eyebrow + document title). */
export async function legalOgImage(key: LegalPageKey) {
  const [settings, page] = await Promise.all([getSettings(), getPage(key)]);
  return renderOgImage({ eyebrow: page.eyebrow, title: page.title, settings });
}
