/* ─────────────────────────────────────────────────────────────
   Speakable (voice search): the parts of a page that read well
   aloud, which voice assistants may read as the answer. The
   components put these ids on the elements; the JSON-LD in
   schema.ts points at them. Keep both sides on these constants.
   ───────────────────────────────────────────────────────────── */

export const SPEAKABLE = {
  /** Inner pages: the hero's h1 and lede (PageHero). */
  title: "page-title",
  summary: "page-summary",
  /** Homepage: the hero's h1 and lede. */
  heroTitle: "hero-heading",
  heroSummary: "hero-summary",
  /** Articles: the key takeaway at the end. */
  takeaway: "key-takeaway",
} as const;

/** Inner pages read out their title and summary. */
export const PAGE_SPEAKABLE = [SPEAKABLE.title, SPEAKABLE.summary] as const;

/** schema.org SpeakableSpecification for elements with these ids. */
export function speakableSpec(ids: readonly string[]) {
  return { "@type": "SpeakableSpecification", cssSelector: ids.map((id) => `#${id}`) };
}
