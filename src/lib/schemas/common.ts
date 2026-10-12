import { z } from "zod";

/* ─────────────────────────────────────────────────────────────
   Shared primitives used by every content schema.
   Zod schemas are the single source of truth: TypeScript types
   are inferred from them, JSON content is validated against them,
   and the Mongoose models mirror their shape.
   ───────────────────────────────────────────────────────────── */

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase kebab-case slug");

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex colour, e.g. #3ce49a");

/** Internal path ("/work"), hash ("#faq"), absolute URL or mailto/tel link. */
export const hrefSchema = z
  .string()
  .min(1)
  .refine(
    (v) => /^(\/|#|https?:\/\/|mailto:|tel:)/.test(v),
    "Must be an internal path, hash, absolute URL, mailto: or tel: link",
  );

/** ISO calendar date, e.g. 2026-09-25 */
export const isoDateSchema = z.iso.date();

export const linkSchema = z.object({
  label: z.string().min(1),
  href: hrefSchema,
  external: z.boolean().optional(),
});
export type Link = z.infer<typeof linkSchema>;

export const imageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageAsset = z.infer<typeof imageSchema>;

export const metricSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});
export type Metric = z.infer<typeof metricSchema>;

export const seoSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(170),
  keywords: z.array(z.string()).optional(),
  noIndex: z.boolean().optional(),
});
export type Seo = z.infer<typeof seoSchema>;

/**
 * Show/hide switch on every list item (flipped from the admin). Missing
 * means shown; `false` keeps the item in the content but off the site.
 */
export const publishedSchema = z.boolean().optional();

/**
 * "On the home page" switch for items that also appear on other pages
 * (services, insights, process steps…). Missing means shown; `false`
 * keeps the item on its other pages but out of the home section.
 */
export const homeFlagSchema = z.boolean().optional();

/** Intro block that heads most sections: eyebrow + heading (+ optional lede). */
export const sectionIntroSchema = z.object({
  eyebrow: z.string().min(1),
  /** Supports *emphasis* and "\n" line breaks. */
  heading: z.string().min(1),
  lede: z.string().optional(),
});
export type SectionIntro = z.infer<typeof sectionIntroSchema>;

export const ctaBlockSchema = z.object({
  eyebrow: z.string().min(1),
  heading: z.string().min(1),
  lede: z.string().min(1),
  primary: linkSchema,
  secondary: linkSchema.optional(),
});
export type CtaBlock = z.infer<typeof ctaBlockSchema>;

export const socialPlatformSchema = z.enum([
  "linkedin",
  "github",
  "x",
  "threads",
  "instagram",
  "facebook",
]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

/**
 * Icons that content is allowed to reference. Each key maps to a Lucide
 * component in `src/components/ui/icon.tsx` (the map is type-checked to be
 * exhaustive, so adding a key here without an icon fails the build).
 */
export const ICON_NAMES = [
  "layers",
  "globe",
  "smartphone",
  "sparkles",
  "workflow",
  "refresh-cw",
  "gauge",
  "hourglass",
  "unplug",
  "mouse-pointer-click",
  "repeat",
  "trending-down",
  "rocket",
  "handshake",
  "compass",
  "shield-check",
  "zap",
  "target",
  "book-open",
  "graduation-cap",
  "key-round",
  "activity",
  "life-buoy",
] as const;
export const iconNameSchema = z.enum(ICON_NAMES);
export type IconName = z.infer<typeof iconNameSchema>;
