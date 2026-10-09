/* ─────────────────────────────────────────────────────────────
   Analytics configuration (Google Analytics 4).
   The measurement ID comes from Studio › Site settings › Analytics,
   else NEXT_PUBLIC_GA_ID (e.g. "G-XXXXXXXXXX"). With neither, no
   analytics code ships, and the cookie banner only notes that the
   site uses no tracking cookies.
   The measurement ID is public by design; it is not a secret.
   ───────────────────────────────────────────────────────────── */

const GA_PATTERN = /^G-[A-Z0-9]{4,}$/;

const raw = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";

/** Validated GA4 measurement ID from the environment, or null. */
export const GA_ID: string | null = GA_PATTERN.test(raw) ? raw : null;

/** The GA4 ID in effect: Site settings › Analytics first, then the environment; null when analytics is off. */
export function gaIdOf(settings: { analytics?: { gaId: string | null } }): string | null {
  const id = settings.analytics?.gaId?.trim() ?? "";
  return GA_PATTERN.test(id) ? id : GA_ID;
}
