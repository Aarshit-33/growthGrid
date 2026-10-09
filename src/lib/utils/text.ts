/* ─────────────────────────────────────────────────────────────
   Pure text helpers for content strings (no React), usable from
   server components, OG image routes, JSON-LD and scripts.
   ───────────────────────────────────────────────────────────── */

export interface HeadingToken {
  text: string;
  em: boolean;
}

/** Split a heading ("Built for\nthe *work*") into lines of plain / emphasised segments. */
export function parseHeading(source: string): HeadingToken[][] {
  return source.split("\n").map((line) => {
    const tokens: HeadingToken[] = [];
    const re = /\*([^*]+)\*/g;
    let last = 0;
    for (const match of line.matchAll(re)) {
      if (match.index > last) tokens.push({ text: line.slice(last, match.index), em: false });
      tokens.push({ text: match[1], em: true });
      last = match.index + match[0].length;
    }
    if (last < line.length) tokens.push({ text: line.slice(last), em: false });
    return tokens;
  });
}

/** Plain-text version of a heading (for aria-labels, metadata, alt text). */
export function headingText(source: string): string {
  return source.replace(/\*([^*]+)\*/g, "$1").replace(/\s*\n\s*/g, " ").trim();
}

/** Strip the inline markdown subset (**bold**, *em*, `code`, [links](…)) to plain text. */
export function plainText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
}

/* ── Typography ──────────────────────────────────────────────── */

/** Inline code spans and markdown link targets are never touched. */
const PROTECTED = /(`[^`]*`|\]\([^)\s]*\))/;

/**
 * Typographic quotes for display copy, so editors can type plain ASCII:
 * `we're` → `we’re`, `"as is"` → `“as is”`. Idempotent.
 */
export function smartQuotes(text: string): string {
  if (!text.includes("'") && !text.includes('"')) return text;
  return text
    .split(PROTECTED)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/(^|[\s([{\u2013\u2014/*_-])"/g, "$1\u201C")
            .replace(/"/g, "\u201D")
            .replace(/'/g, "\u2019"),
    )
    .join("");
}

/** Machine-readable fields that must keep their exact characters. */
const RAW_KEY = /^(?:id|key|slug|href|src|url|email|icon|code|language|shape)$|(?:Id|Slug|Href|Src|Url|Email)$/;

/**
 * Deep-apply `smartQuotes` to every display string in a content document
 * (machine fields such as slugs, hrefs and code are skipped by key).
 * Used by the content repository, so JSON and MongoDB content match.
 */
export function typeset<T>(value: T, key?: string): T {
  if (typeof value === "string") {
    return (key !== undefined && RAW_KEY.test(key) ? value : smartQuotes(value)) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => typeset(item, key)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = typeset(v, k);
    return out as T;
  }
  return value;
}
