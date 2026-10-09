import type { ImageAsset } from "@/lib/schemas/common";
import type { Brand } from "@/lib/schemas/settings";

/* ─────────────────────────────────────────────────────────────
   Brand assets (Studio › Branding) as the site uses them: the
   logo, the stacked logo for the intro, the mark for small
   spots and the app-icon files. No zod or Node imports, so
   server code, the icon route and client components (the page
   transition, the Branding preview) all share it.
   ───────────────────────────────────────────────────────────── */

/** A site without a `brand` block: the built-in grid mark and icon, on the site's own colour. */
export const DEFAULT_BRAND: Brand = {
  logo: { image: null, style: "with-name", height: 28, mark: null, stacked: null },
  app: { icon: null, iconBackground: null, themeColor: "#04070a" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function imageOf(value: unknown): ImageAsset | null {
  if (!isRecord(value) || typeof value.src !== "string" || !value.src.startsWith("/")) return null;
  return {
    src: value.src,
    alt: typeof value.alt === "string" ? value.alt : "",
    width: positive(value.width) ? Math.round(value.width) : 0,
    height: positive(value.height) ? Math.round(value.height) : 0,
  };
}

/**
 * The brand in effect, from settings (validated or not: the Studio's raw
 * files, the editor's unsaved value). Anything missing or malformed falls
 * back to the built-in default, so a bad value can never break the header.
 */
export function resolveBrand(settings: unknown): Brand {
  const brand = isRecord(settings) && isRecord(settings.brand) ? settings.brand : {};
  const logo = isRecord(brand.logo) ? brand.logo : {};
  const app = isRecord(brand.app) ? brand.app : {};
  const height = typeof logo.height === "number" && logo.height >= 16 && logo.height <= 96 ? Math.round(logo.height) : DEFAULT_BRAND.logo.height;
  return {
    logo: {
      image: imageOf(logo.image),
      style: logo.style === "logo-only" ? "logo-only" : "with-name",
      height,
      mark: imageOf(logo.mark),
      stacked: imageOf(logo.stacked),
    },
    app: {
      icon: imageOf(app.icon),
      iconBackground: typeof app.iconBackground === "string" && HEX.test(app.iconBackground) ? app.iconBackground : null,
      themeColor: typeof app.themeColor === "string" && HEX.test(app.themeColor) ? app.themeColor : DEFAULT_BRAND.app.themeColor,
    },
  };
}

/** A custom image for the small brand spots: the page transition, the sign-in badge, the Studio's bar. */
export interface BrandMarkImage {
  src: string;
  /** A full logo (it spells the name): sized by height instead of fitted into a square. */
  wide: boolean;
}

/**
 * What the small spots show: the symbol (logo.mark), else a symbol logo, else
 * the app icon, else a full logo (sized by height). null: the built-in grid mark.
 */
export function brandMark(brand: Brand): BrandMarkImage | null {
  const { logo, app } = brand;
  if (logo.mark) return { src: logo.mark.src, wide: false };
  if (logo.image && logo.style === "with-name") return { src: logo.image.src, wide: false };
  if (app.icon) return { src: app.icon.src, wide: false };
  if (logo.image) return { src: logo.image.src, wide: true };
  return null;
}

/* ── App icons (src/app/brand/[asset]/route.ts) ───────────── */

export interface BrandAsset {
  /** Pixel size (square). */
  size: number;
  type: "image/png" | "image/x-icon" | "image/svg+xml";
  /** Full-bleed, content inside the safe zone (Android adaptive icons). */
  maskable?: boolean;
}

/** Every icon file the site serves under /brand. /favicon.ico is rewritten to /brand/favicon.ico. */
export const BRAND_ASSETS = {
  "favicon.ico": { size: 48, type: "image/x-icon" },
  "icon.svg": { size: 32, type: "image/svg+xml" },
  "icon-32.png": { size: 32, type: "image/png" },
  "apple-icon.png": { size: 180, type: "image/png" },
  "icon-192.png": { size: 192, type: "image/png" },
  "icon-512.png": { size: 512, type: "image/png" },
  "maskable-512.png": { size: 512, type: "image/png", maskable: true },
} as const satisfies Record<string, BrandAsset>;

export type BrandAssetName = keyof typeof BRAND_ASSETS;

export const isBrandAsset = (name: string): name is BrandAssetName => Object.hasOwn(BRAND_ASSETS, name);

/** How one icon file presents a custom app icon. */
export interface IconTileStyle {
  /** Tile colour (null: transparent). */
  background: string | null;
  /** Padding on each side, as a share of the size. */
  inset: number;
  /** Corner radius, as a share of the size. */
  radius: number;
}

/**
 * The tile a custom icon sits on in each file. With an icon background it's
 * padded on a rounded tile of that colour; otherwise it's used as it is.
 * Shared by the icon route and the Branding preview.
 */
export function iconTileStyle(name: BrandAssetName, brand: Brand): IconTileStyle {
  const { iconBackground, themeColor } = brand.app;
  const padded = iconBackground !== null;
  switch (name) {
    // iOS fills transparency with black and rounds the corners itself.
    case "apple-icon.png":
      return { background: iconBackground ?? themeColor, inset: padded ? 0.14 : 0, radius: 0 };
    // Android masks it to any shape: keep everything inside the central 80% circle.
    case "maskable-512.png":
      return { background: iconBackground ?? themeColor, inset: 0.22, radius: 0 };
    default:
      return { background: iconBackground, inset: padded ? 0.1 : 0, radius: padded ? 0.23 : 0 };
  }
}

/** Short, stable fingerprint of the icon settings: appended as ?v= so browsers drop a cached icon when it changes. */
export function brandVersion(brand: Brand): string {
  const text = JSON.stringify([brand.app.icon?.src ?? null, brand.app.iconBackground, brand.app.themeColor]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The icon URL for `name`, versioned. */
export const brandAssetUrl = (brand: Brand, name: BrandAssetName) =>
  `${name === "favicon.ico" ? "/favicon.ico" : `/brand/${name}`}?v=${brandVersion(brand)}`;

/** Image formats the icon and social-card renderer can embed (no WebP or AVIF). A ?v= fingerprint may follow. */
export const RENDERABLE_IMAGE = /\.(?:png|jpe?g|gif|svg)(?:[?#]|$)/i;

/**
 * The SVG that takes over from a brand image: same folder, same name
 * ("/logo/primary.png" → "/logo/primary.svg"). null: it's an SVG already. On
 * the site (src/lib/brand-files.ts) the SVG wins whenever it exists, so a
 * designer's vector file is a drop-in: nothing in the settings changes.
 */
export function svgTwin(src: string): string | null {
  const path = src.split(/[?#]/, 1)[0];
  return /\.(?:png|jpe?g|gif|webp|avif)$/i.test(path) ? path.replace(/\.[^./]+$/, ".svg") : null;
}
