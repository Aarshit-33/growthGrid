import { createElement, type CSSProperties, type SVGProps } from "react";
import { cn } from "@/lib/utils";
import { TECH_LOGOS, type TechLogoData } from "./tech-logos";

/** The logo data for a technology slug (undefined when there is no mark). */
export const techLogo = (slug: string): TechLogoData | undefined => TECH_LOGOS[slug];

/** Colour a logo is drawn in: its brand colour, else the category colour. */
export const techLogoColor = (slug: string, fallback: string) => TECH_LOGOS[slug]?.color ?? fallback;

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * A technology's logo as inline SVG (24×24, `currentColor`). Decorative by
 * default; pass `aria-label` + `role="img"` if it must stand alone.
 */
export function TechLogo({ slug, ...props }: { slug: string } & SVGProps<SVGSVGElement>) {
  const logo = TECH_LOGOS[slug];
  if (!logo) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...(logo.stroke ? STROKE : { fill: "currentColor" })} {...props}>
      {logo.nodes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/**
 * A technology's mark in a round badge: the real logo in its brand colour
 * (generic concepts get their glyph in the category colour), or the short
 * label if there's no mark at all. Decorative: show the name beside it.
 * Exposes the colour as `--logo` (e.g. for a hover glow).
 */
export function TechBadge({
  slug,
  short,
  fallbackColor,
  className,
  logoClassName,
}: {
  slug: string;
  /** Abbreviation shown when there's no mark, e.g. "TS". */
  short: string;
  /** Category colour: used for generic glyphs and the short label. */
  fallbackColor: string;
  className?: string;
  logoClassName?: string;
}) {
  const color = techLogoColor(slug, fallbackColor);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border bg-white/[0.03] font-display font-semibold",
        className,
      )}
      style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, color, "--logo": color } as CSSProperties}
    >
      {TECH_LOGOS[slug] ? <TechLogo slug={slug} className={logoClassName} /> : short}
    </span>
  );
}

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Standalone SVG markup (for drawing the logo onto a canvas), or null. */
export function techLogoSvg(slug: string, color: string, size = 96): string | null {
  const logo = TECH_LOGOS[slug];
  if (!logo) return null;
  const paint = logo.stroke
    ? `fill="none" stroke="${escapeAttr(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${escapeAttr(color)}"`;
  const body = logo.nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ${paint}>${body}</svg>`;
}
