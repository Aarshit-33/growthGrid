import type { CardQrTarget, Settings, TeamMember } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   Who a business card is for, with every fallback applied: a
   team member's own card details first, then the studio's
   contact details (Site settings). Pure functions with no
   server imports, so the Studio's live preview resolves cards
   exactly as the site does.
   ───────────────────────────────────────────────────────────── */

export interface CardPerson {
  slug: string;
  /** As printed on the card. */
  name: string;
  role: string;
  /** Display form ("+91 83204 81381") and dialable form ("+918320481381"). */
  phone: { display: string; tel: string } | null;
  email: string | null;
  /** Full URL and the short form printed on the card ("growthgrid.studio"). */
  website: { href: string; display: string };
  /** The studio's name (vCard ORG). */
  org: string;
  /** Absolute address of this person's card page. */
  cardUrl: string;
}

/** The public path of a person's card. */
export const cardPath = (slug: string) => `/cards/${slug}`;

/** Query parameter the QR code adds (?src=qr), so a scan can be counted apart from a shared link. */
export const CARD_SCAN_PARAM = "src";

/** Artwork and contact files served next to each card page (print.html: the print-ready sheet with bleed). */
export const CARD_FILES = ["front.svg", "back.svg", "contact.vcf", "print.html"] as const;
export type CardFile = (typeof CARD_FILES)[number];
export const cardFilePath = (slug: string, file: CardFile) => `${cardPath(slug)}/${file}`;

/** A team member gets a card unless it's switched off (hidden members never reach here). */
export const hasCard = (member: Pick<TeamMember, "card">) => member.card?.enabled !== false;

/**
 * "+918320481381" → "+91 83204 81381" for the common formats; a number that
 * already has spaces (typed the way it should read) is left alone.
 */
export function formatPhone(raw: string): string {
  const value = raw.trim();
  if (/\s/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+91") && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (value.startsWith("+1") && digits.length === 11) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (value.startsWith("+44") && digits.length === 12) return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return value;
}

/** Digits (and a leading +) for tel: links and vCards. */
export const dialable = (raw: string) => (raw.trim().startsWith("+") ? "+" : "") + raw.replace(/\D/g, "");

/** "https://www.growthgrid.studio/" → "growthgrid.studio"; a path is kept. */
export function shortUrl(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, "");
    return url.host.replace(/^www\./, "") + path;
  } catch {
    return href;
  }
}

const absolute = (path: string, base: string) => new URL(path, base.endsWith("/") ? base : `${base}/`).toString();

export function resolveCardPerson(
  member: Pick<TeamMember, "slug" | "name" | "role" | "card">,
  settings: Pick<Settings, "name" | "url" | "contact">,
): CardPerson {
  const card = member.card ?? {};
  const phone = card.phone ?? settings.contact.phone;
  const website = card.website ?? settings.url;
  return {
    slug: member.slug,
    name: card.name ?? member.name,
    role: member.role,
    phone: phone ? { display: formatPhone(phone), tel: dialable(phone) } : null,
    email: card.email ?? settings.contact.email ?? null,
    website: { href: website, display: shortUrl(website) },
    org: settings.name,
    cardUrl: absolute(cardPath(member.slug), settings.url),
  };
}

/* ── vCard ────────────────────────────────────────────────── */

/** vCard 3.0 text escaping (RFC 2426 §5): backslash, comma, semicolon, newline. */
const esc = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/**
 * A vCard 3.0 for "Save contact" and the QR code's contact mode. 3.0 is what
 * iOS, Android and Outlook all import without asking questions.
 */
export function vCard(person: CardPerson, { withCardUrl = true } = {}): string {
  const parts = person.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts.at(-1)! : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(person.name)}`,
    `ORG:${esc(person.org)}`,
    `TITLE:${esc(person.role)}`,
    person.phone ? `TEL;TYPE=WORK,VOICE:${person.phone.tel}` : null,
    person.email ? `EMAIL;TYPE=INTERNET,WORK:${person.email}` : null,
    `URL:${person.website.href}`,
    withCardUrl && person.cardUrl !== person.website.href ? `URL;TYPE=card:${person.cardUrl}` : null,
    "END:VCARD",
  ];
  return `${lines.filter(Boolean).join("\r\n")}\r\n`;
}

/** What the front's QR code encodes. The contact mode leaves the card URL out to keep the code small. */
export function qrValue(person: CardPerson, target: CardQrTarget): string {
  switch (target) {
    case "contact":
      return vCard(person, { withCardUrl: false });
    case "website":
      return person.website.href;
    default:
      // Tagged so analytics can tell a scan from a shared link (card-tracker.tsx).
      return `${person.cardUrl}?${CARD_SCAN_PARAM}=qr`;
  }
}
