import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { resolveBrand } from "@/lib/brand";
import type { Settings } from "@/lib/schemas";
import { embeddableImage } from "@/lib/seo/brand-icons";
import { type HeadingToken, parseHeading } from "@/lib/utils/text";

/* ─────────────────────────────────────────────────────────────
   Branded Open Graph card (1200×630) rendered with next/og.
   Used by every `opengraph-image.tsx` route so social previews
   share one consistent design. Fonts are the self-hosted TTFs.
   ───────────────────────────────────────────────────────────── */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

let fontCache: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" | "italic" }[]> | null = null;

function loadFonts() {
  fontCache ??= Promise.all([
    readFile(join(FONT_DIR, "SpaceGrotesk-500.ttf")).then((data) => ({ name: "Space Grotesk", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "SpaceGrotesk-600.ttf")).then((data) => ({ name: "Space Grotesk", data, weight: 600 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "Inter-400.ttf")).then((data) => ({ name: "Inter", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "JetBrainsMono-500.ttf")).then((data) => ({ name: "JetBrains Mono", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(FONT_DIR, "InstrumentSerif-Italic.ttf")).then((data) => ({ name: "Instrument Serif", data, weight: 400 as const, style: "italic" as const })),
  ]);
  return fontCache;
}

const EM = "#3ce49a";
const HOT = "#7dffc4";

interface OgOptions {
  /** Small mono label above the title, e.g. "Case study · Healthcare". */
  eyebrow: string;
  /** Title; supports *emphasis* (rendered in serif italic emerald). */
  title: string;
  /** Brand details from settings: logo and wordmark (top-left) and site URL (default footer line). */
  settings: Pick<Settings, "wordmark" | "url" | "brand">;
  /** Footer line; defaults to the site host. */
  meta?: string;
}

/**
 * Image metadata for `generateImageMetadata` in opengraph-image routes, so the
 * card's alt text (og:image:alt) comes from content instead of a static export.
 */
export function ogImageMetadata(alt: string) {
  return [{ id: "card", alt, size: OG_SIZE, contentType: OG_CONTENT_TYPE }];
}

interface OgLogo {
  src: string;
  width: number;
  height: number;
  /** A full logo that spells the name: drawn without the wordmark. */
  alone: boolean;
}

/**
 * The uploaded logo (Studio › Branding), sized for the card header. null: the
 * built-in grid mark, including when the file is WebP/AVIF (next/og can't draw those).
 */
async function ogLogo(settings: Pick<Settings, "brand">): Promise<OgLogo | null> {
  const { logo } = resolveBrand(settings);
  if (!logo.image) return null;
  const src = await embeddableImage(logo.image.src);
  if (!src) {
    console.warn(`[og] The logo ${logo.image.src} is missing or isn't PNG, JPG, GIF or SVG: social cards use the built-in mark.`);
    return null;
  }
  const { width: w, height: h } = logo.image;
  const ratio = w > 0 && h > 0 ? w / h : 1;
  const alone = logo.style === "logo-only";
  // A full logo gets the room the mark and wordmark had; a symbol matches the wordmark's size.
  const width = Math.min(alone ? 520 : 160, (alone ? 52 : 40) * ratio);
  return { src, width: Math.round(width), height: Math.round(width / ratio), alone };
}

/** The gap between title words: Space Grotesk's space (0.255em) plus the title's -0.04em tracking. */
const WORD_GAP = 0.215;

/**
 * A title line as the card's wrap units: runs with no space inside (a word, or
 * an emphasised phrase plus anything glued to it, like a closing full stop).
 * Rows break only between units, so an emphasised phrase moves as one piece and
 * wraps inside itself only when it's wider than the card. The spaces between
 * units become the row's column gap: a wrapped row never starts with a gap, and
 * a trailing space never pushes a word to the next row.
 */
function wrapUnits(tokens: HeadingToken[]): HeadingToken[][] {
  const units: HeadingToken[][] = [];
  let open = false; // the last unit continues until a space
  for (const { text, em } of tokens) {
    const pieces = em ? [text.match(/^\s*/)![0], text.trim(), text.match(/\s*$/)![0]] : text.split(/(\s+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      if (!piece.trim()) {
        open = false;
        continue;
      }
      if (open) units[units.length - 1].push({ text: piece, em });
      else units.push([{ text: piece, em }]);
      open = true;
    }
  }
  return units;
}

export async function renderOgImage({ eyebrow, title, settings, meta = new URL(settings.url).host }: OgOptions) {
  const wordmark = settings.wordmark;
  const [fonts, logo] = await Promise.all([loadFonts(), ogLogo(settings)]);
  const lines = parseHeading(title);
  const length = title.replace(/[*\n]/g, "").length;
  const titleSize = length > 70 ? 58 : length > 48 ? 66 : 78;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#04070a",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 85% 110%, rgba(60,228,154,0.28), transparent 70%), radial-gradient(ellipse 50% 40% at 10% -10%, rgba(60,228,154,0.10), transparent 70%)",
          color: "#f0f4f7",
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* Blueprint grid */}
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={`v${i}`}
              style={{ position: "absolute", top: 0, bottom: 0, left: 36 + i * 112, width: 1, backgroundColor: "rgba(140,170,190,0.09)" }}
            />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`h${i}`}
              style={{ position: "absolute", left: 0, right: 0, top: 35 + i * 112, height: 1, backgroundColor: "rgba(140,170,190,0.09)" }}
            />
          ))}
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og
              <img src={logo.src} width={logo.width} height={logo.height} alt="" style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", width: 34, height: 34, gap: 3 }}>
                {[0.2, 0.2, 1, 0.2, 1, 0.4, 1, 0.4, 0.4].map((o, i) => (
                  <div
                    key={i}
                    style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: o === 1 ? EM : `rgba(240,244,247,${o})` }}
                  />
                ))}
              </div>
            )}
            {!logo?.alone && (
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 30, letterSpacing: -1.4 }}>{wordmark}</div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(60,228,154,0.35)",
              backgroundColor: "rgba(60,228,154,0.08)",
              fontFamily: "JetBrains Mono",
              fontSize: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: EM,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: EM }} />
            {eyebrow}
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
          {lines.map((tokens, li) => {
            const lineStyle = {
              fontFamily: "Space Grotesk",
              fontWeight: 500,
              fontSize: titleSize,
              lineHeight: 1.02,
              letterSpacing: -titleSize * 0.04,
            };
            // A plain line (most case studies and articles) is one text block: Satori
            // wraps it inside the card and balances the rows.
            if (!tokens.some((t) => t.em)) {
              return (
                <div key={li} style={{ display: "flex", ...lineStyle, textWrap: "balance" }}>
                  {tokens.map((t) => t.text).join("").trim()}
                </div>
              );
            }
            return (
              <div key={li} style={{ display: "flex", flexWrap: "wrap", columnGap: titleSize * WORD_GAP, ...lineStyle }}>
                {wrapUnits(tokens).map((unit, ui) => (
                  <div key={ui} style={{ display: "flex", flexShrink: 1 }}>
                    {unit.map((segment, si) =>
                      segment.em ? (
                        <span
                          key={si}
                          style={{
                            fontFamily: "Instrument Serif",
                            fontStyle: "italic",
                            fontWeight: 400,
                            letterSpacing: -titleSize * 0.01,
                            color: HOT,
                            flexShrink: 1,
                          }}
                        >
                          {segment.text}
                        </span>
                      ) : (
                        <span key={si}>{segment.text}</span>
                      ),
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(140,170,190,0.18)",
            paddingTop: 24,
            fontFamily: "JetBrains Mono",
            fontSize: 18,
            color: "#8a9aaa",
            letterSpacing: 1,
          }}
        >
          <div style={{ display: "flex" }}>{meta}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 34 }}>
            {[10, 16, 13, 22, 19, 28, 34].map((h, i) => (
              <div key={i} style={{ width: 8, height: h, borderRadius: 2, backgroundColor: i === 6 ? EM : "rgba(60,228,154,0.35)" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
