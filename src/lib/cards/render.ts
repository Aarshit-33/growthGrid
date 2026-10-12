import type { CardDesign, CardRow } from "@/lib/schemas";
import { SYMBOL, WORDMARK } from "./logo";
import type { CardPerson } from "./person";
import { encodeQr, qrPath } from "./qr";

/* ─────────────────────────────────────────────────────────────
   Business card artwork, as SVG markup.

   One function draws both sides for every surface: the cards on
   the site (inline), the Studio's live preview, and the
   downloads (/cards/<slug>/front.svg, rasterised to PNG in the
   browser). The artboard is a standard 3.5 × 2 in card at 300
   dpi: 1050 × 600. The layout follows the original artwork:
   front = the stacked logo beside a QR tile that runs off the
   right edge; back = the logo beside contact rows that do too.

   Pure string building with no DOM or server imports.
   ───────────────────────────────────────────────────────────── */

export const CARD_SIZE = { width: 1050, height: 600 } as const;
/** Physical size, for print-ready SVG downloads. */
export const CARD_PRINT = { width: "3.5in", height: "2in" } as const;

export type CardSide = "front" | "back";

export interface CardFont {
  /** CSS font-family list. */
  family: string;
  /** Extra CSS for the artwork (an embedded @font-face, for standalone files). */
  css?: string;
}

/** On a page that already loads Space Grotesk (next/font's CSS variable). */
export const INLINE_CARD_FONT: CardFont = {
  family: "var(--font-space-grotesk), 'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
};

export interface CardRenderOptions {
  font: CardFont;
  /** Accessible name; also the file's <title>. */
  label?: string;
  /** A standalone file: physical size, xmlns, no CSS variables. */
  standalone?: boolean;
  /** Print bleed in artboard px: backgrounds and edge-touching shapes run this far past the trim. */
  bleed?: number;
}

/** 3 mm at 300 dpi, the bleed most printers ask for. */
export const PRINT_BLEED = Math.round((3 / 25.4) * 300);

const W = CARD_SIZE.width;
const H = CARD_SIZE.height;

/* ── Helpers ──────────────────────────────────────────────── */

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const n = (value: number) => Number(value.toFixed(2));

/**
 * Rough advance widths for Space Grotesk 500, in em. No font metrics are
 * available while building a string (on the server or before fonts load),
 * so long lines are measured with this and squeezed to fit when needed.
 */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    if (" ".includes(ch)) em += 0.26;
    else if ("iljI.,:;'|!".includes(ch)) em += 0.26;
    else if ("ftr()[]-".includes(ch)) em += 0.36;
    else if ("mwMW@".includes(ch)) em += 0.86;
    else if (/[A-Z]/.test(ch)) em += 0.66;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else em += 0.57;
  }
  return em * size;
}

/** Text that never spills past `max`: squeezed (spacing and glyphs) only when it would. */
function fittedText(text: string, x: number, y: number, size: number, max: number, fill: string, weight = 500): string {
  const squeeze = textWidth(text, size) > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}"${squeeze}>${escapeXml(text)}</text>`;
}

/** A bar with rounded left corners and a square right end past the card's edge (by `bleed`). */
function leftRounded(x: number, y: number, h: number, r: number, bleed = 0): string {
  const radius = Math.min(r, h / 2);
  const end = W + bleed;
  return `M${end} ${y}H${n(x + radius)}A${radius} ${radius} 0 0 0 ${x} ${n(y + radius)}V${n(y + h - radius)}A${radius} ${radius} 0 0 0 ${n(x + radius)} ${y + h}H${end}Z`;
}

/** A tab with rounded right corners, running off the card's left edge (by `bleed`). */
function rightRounded(width: number, y: number, h: number, r: number, bleed = 0): string {
  const radius = Math.min(r, width, h / 2);
  return `M${-bleed} ${y}H${n(width - radius)}A${radius} ${radius} 0 0 1 ${width} ${n(y + radius)}V${n(y + h - radius)}A${radius} ${radius} 0 0 1 ${n(width - radius)} ${y + h}H${-bleed}Z`;
}

/** The full background, bleed included. */
const background = (fill: string, bleed: number) =>
  `<rect x="${-bleed}" y="${-bleed}" width="${W + 2 * bleed}" height="${H + 2 * bleed}" fill="${fill}"/>`;

/**
 * The stacked logo, centred on `cx`: the symbol over the wordmark.
 * `symbolWidth` and `wordmarkWidth` set the balance between the two.
 */
function stackedLogo({
  cx,
  top,
  symbolWidth,
  wordmarkWidth,
  gap,
  colors,
}: {
  cx: number;
  top: number;
  symbolWidth: number;
  wordmarkWidth: number;
  gap: number;
  colors: { logo: string; wordmark: string };
}): string {
  const s = symbolWidth / SYMBOL.width;
  const w = wordmarkWidth / WORDMARK.width;
  const symbolHeight = SYMBOL.height * s;
  const symbol = `<g transform="translate(${n(cx - symbolWidth / 2)} ${n(top)}) scale(${n(s * 1000) / 1000})" fill="${colors.logo}">${SYMBOL.paths
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g>`;
  const wordTop = top + symbolHeight + gap;
  const word = `<g transform="translate(${n(cx - wordmarkWidth / 2)} ${n(wordTop)}) scale(${n(w * 10000) / 10000}) translate(0 ${-WORDMARK.top})"><g fill="${colors.wordmark}">${WORDMARK.growth
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g><g fill="${colors.logo}">${WORDMARK.grid.map((d) => `<path d="${d}"/>`).join("")}</g></g>`;
  return `<g aria-hidden="true">${symbol}${word}</g>`;
}

/** Height of a stacked logo, for centring it. */
const stackHeight = (symbolWidth: number, wordmarkWidth: number, gap: number) =>
  SYMBOL.height * (symbolWidth / SYMBOL.width) + gap + WORDMARK.height * (wordmarkWidth / WORDMARK.width);

/* ── Icons (Lucide, 24-unit grid, stroked) ────────────────── */

const ICONS: Record<CardRow, string> = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  name: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  role: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  email: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  website: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
};

function icon(row: CardRow, cx: number, cy: number, size: number, color: string): string {
  const s = size / 24;
  return `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(s * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[row]}</g>`;
}

/** The text a row shows, or null when there's nothing to show (e.g. no phone number). */
export function rowText(row: CardRow, person: CardPerson): string | null {
  switch (row) {
    case "phone":
      return person.phone?.display ?? null;
    case "name":
      return person.name;
    case "role":
      return person.role;
    case "email":
      return person.email;
    case "website":
      return person.website.display;
  }
}

/* ── Sides ────────────────────────────────────────────────── */

function front(design: CardDesign, qr: string, bleed: number): string {
  const { front: f, shape } = design;
  // QR tile: runs off the right edge, like the original artwork.
  const tile = { x: 716, y: 130, h: 340 };
  const box = { x: 756, y: 172, size: 256 };
  let code = "";
  try {
    const matrix = encodeQr(qr);
    const unit = box.size / matrix.length;
    code = `<path transform="translate(${box.x} ${box.y}) scale(${n(unit * 10000) / 10000})" d="${qrPath(matrix)}" fill="${f.qrInk}" shape-rendering="crispEdges"/>`;
  } catch {
    // Too long to encode (only possible with a very long contact card): the tile stays empty.
  }
  const logoGap = 99.4 * (430 / WORDMARK.width); // the stacked logo's own spacing (secondary.svg)
  const height = stackHeight(SYMBOL.width * (430 / WORDMARK.width), 430, logoGap);
  return [
    background(f.background, bleed),
    stackedLogo({
      cx: 380,
      top: (H - height) / 2,
      symbolWidth: SYMBOL.width * (430 / WORDMARK.width),
      wordmarkWidth: 430,
      gap: logoGap,
      colors: f,
    }),
    `<path d="${leftRounded(tile.x, tile.y, tile.h, shape.radius, bleed)}" fill="${f.qrPanel}"/>`,
    code,
  ].join("");
}

function back(design: CardDesign, person: CardPerson, bleed: number): string {
  const { back: b, shape } = design;
  const rows = b.rows.map((row) => ({ row, text: rowText(row, person) })).filter((r): r is { row: CardRow; text: string } => !!r.text);

  const pill = { x: 624, h: 66, gap: 22 };
  const block = rows.length * pill.h + Math.max(0, rows.length - 1) * pill.gap;
  const top = (H - block) / 2;
  const textX = pill.x + 101;
  const textMax = W - textX - 28;

  // A slightly smaller symbol, and the logo raised a touch: optically centred against the rows.
  const logo = { symbolWidth: 186, wordmarkWidth: 330, gap: 30 };
  const logoHeight = stackHeight(logo.symbolWidth, logo.wordmarkWidth, logo.gap);

  return [
    background(b.background, bleed),
    b.sideTab ? `<path d="${rightRounded(60, 134, 332, shape.radius, bleed)}" fill="${b.pill}"/>` : "",
    stackedLogo({ cx: b.sideTab ? 341 : 318, top: (H - logoHeight) / 2 - 14, ...logo, colors: b }),
    ...rows.map(({ row, text }, i) => {
      const y = top + i * (pill.h + pill.gap);
      const highlighted = row === b.highlight;
      const fill = highlighted ? b.highlightPill : b.pill;
      const ink = highlighted ? b.highlightInk : b.pillInk;
      const size = 22;
      return [
        `<path d="${leftRounded(pill.x, n(y), pill.h, shape.radius, bleed)}" fill="${fill}"/>`,
        icon(row, pill.x + 48, y + pill.h / 2, 32, ink),
        fittedText(text, textX, y + pill.h / 2 + size * 0.35, size, textMax, ink, highlighted ? 600 : 500),
      ].join("");
    }),
  ].join("");
}

/** One side of a person's card as SVG markup. `qr` is the text the front's code encodes. */
export function renderCard(side: CardSide, person: CardPerson, design: CardDesign, qr: string, options: CardRenderOptions): string {
  const { font, label, standalone = false, bleed = 0 } = options;
  const inches = (px: number) => `${n(px / 300)}in`;
  const size = standalone ? ` width="${inches(W + 2 * bleed)}" height="${inches(H + 2 * bleed)}"` : "";
  const style = font.css ? `<style>${font.css}</style>` : "";
  const title = label ? `<title>${escapeXml(label)}</title>` : "";
  const a11y = label ? ` role="img" aria-label="${escapeXml(label)}"` : ` aria-hidden="true"`;
  const body = side === "front" ? front(design, qr, bleed) : back(design, person, bleed);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-bleed} ${-bleed} ${W + 2 * bleed} ${H + 2 * bleed}"${size}${a11y} style="font-family:${escapeXml(font.family)}">${title}${style}${body}</svg>`;
}

/** The card's on-screen corner radius as CSS, from the design's 1050 px artboard. */
export const cardRadius = (design: CardDesign) =>
  `${n((design.shape.corners / W) * 100)}% / ${n((design.shape.corners / H) * 100)}%`;
