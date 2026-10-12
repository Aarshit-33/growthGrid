import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge that knows our custom theme tokens. Without this, custom
 * sizes like `text-h2` are mistaken for colours and dropped when a colour
 * class (e.g. `text-ink`) appears later in the same `cn()` call.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "h2", "h3", "h4", "lede"],
      radius: ["card", "panel"],
      shadow: ["glow", "panel"],
    },
  },
});

/** Compose class names, letting later Tailwind utilities win conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Design around what changes" → "design-around-what-changes" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Zero-padded index label, e.g. 1 → "01". */
export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** settings.locale ("en_US", Open Graph style) as a BCP 47 tag ("en-US") for Intl and `lang`. */
export function localeTag(locale: string): string {
  return locale.replaceAll("_", "-");
}

/** The language part of settings.locale ("en_US" → "en"), for `<html lang>` in emails. */
export function localeLanguage(locale: string): string {
  return localeTag(locale).split("-")[0];
}

/** Locale-aware date label for an ISO calendar date (UTC, no TZ drift). `locale`: a BCP 47 tag (see `localeTag`). */
export function formatDate(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Resolve a site-relative path against the canonical site URL. */
export function absoluteUrl(path: string, base: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

/** Two-letter monogram for people without an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * "Role, Company" line under a quote's author. Anonymised quotes are
 * attributed by role alone (author === role), so the role isn't repeated.
 */
export function byline({ author, role, company }: { author: string; role?: string; company?: string }): string {
  return [role && role !== author ? role : null, company].filter(Boolean).join(", ");
}

/** Fill `{placeholders}` in a content string: ("{count} of {total}", { count: 2, total: 6 }) → "2 of 6". */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
