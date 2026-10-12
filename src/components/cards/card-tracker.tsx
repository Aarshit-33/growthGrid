"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { CARD_SCAN_PARAM } from "@/lib/cards/person";

/* ─────────────────────────────────────────────────────────────
   Business card analytics: QR scans, saved contacts, shares and
   downloads, per person. Events go to Google Analytics (gtag) and
   Vercel Web Analytics, and only once the visitor has accepted
   analytics in the cookie banner: before that gtag doesn't exist
   and Vercel's script isn't loaded, so nothing is sent.

   In GA4 they're events named card_* with a `card` parameter (the
   person's slug); register `card` as a custom dimension to break
   them down by person. In Vercel: Analytics › Events.
   ───────────────────────────────────────────────────────────── */

export type CardEvent =
  | "card_scan"
  | "card_save_contact"
  | "card_share"
  | "card_copy_link"
  | "card_whatsapp"
  | "card_email"
  | "card_download"
  | "card_print";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackCard(event: CardEvent, card: string, extra: Record<string, string> = {}) {
  try {
    window.gtag?.("event", event, { card, ...extra });
    track(event, { card, ...extra });
  } catch {
    // Analytics never gets in the way of the card.
  }
}

/**
 * On a card page: counts a QR scan (?src=qr), then drops the tag from the
 * address bar so a link copied from here isn't counted as a scan.
 */
export function CardScanTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(CARD_SCAN_PARAM) !== "qr") return;
    // Give the consent script a moment to load gtag on a returning visitor.
    const timer = setTimeout(() => trackCard("card_scan", slug), 1200);
    url.searchParams.delete(CARD_SCAN_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return () => clearTimeout(timer);
  }, [slug]);
  return null;
}
