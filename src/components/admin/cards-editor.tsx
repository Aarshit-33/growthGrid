"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Eye, PenLine, TriangleAlert, type LucideIcon } from "lucide-react";
import { qrValue, type CardPerson } from "@/lib/cards/person";
import { cardRadius, INLINE_CARD_FONT, renderCard, rowText, type CardSide } from "@/lib/cards/render";
import type { CardDesign, CardRow } from "@/lib/schemas/pages";
import { cn } from "@/lib/utils";
import { DocEditor, type DocEditorProps } from "./doc-editor";
import { isRecord, type Raw } from "./form/schema-utils";

/** The row choices (CARD_ROWS in lib/schemas/pages.ts), without pulling the schemas into the browser. */
const CARD_ROWS: readonly CardRow[] = ["phone", "name", "role", "email", "website"];

/* ─────────────────────────────────────────────────────────────
   Business cards: the cards page editor focused on `design`,
   with both sides of a real team member's card drawn live from
   the form, before anything is saved, by the same renderer the
   site and the downloads use (lib/cards/render.ts).
   ───────────────────────────────────────────────────────────── */

export interface PreviewPerson {
  person: CardPerson;
  /** Why the site doesn't show this card, if it doesn't. */
  note?: string;
  /** Their Team entry in the Studio. */
  editHref: string;
}

type Props = Omit<DocEditorProps, "preview"> & {
  people: PreviewPerson[];
  /** The last saved design (already validated): stands in for anything half-typed. */
  fallback: CardDesign;
};

export function CardsEditor({ people, fallback, ...props }: Props) {
  return (
    <DocEditor
      {...props}
      draftScope="business-cards"
      preview={(value) => <CardsPreview value={value} people={people} fallback={fallback} />}
    />
  );
}

/* ── Reading the form's value ─────────────────────────────── */

const HEX = /^#[0-9a-f]{6}$/i;
const isRow = (value: unknown): value is CardRow => typeof value === "string" && (CARD_ROWS as readonly string[]).includes(value);

/**
 * The design as typed so far, with each field that isn't valid yet (a colour
 * half-typed, an emptied number) kept at its saved value, so the preview never
 * breaks mid-edit.
 */
function liveDesign(raw: unknown, saved: CardDesign): CardDesign {
  const d = isRecord(raw) ? raw : {};
  const part = <T extends Record<string, unknown>>(key: string, base: T): T => {
    const source = isRecord(d[key]) ? (d[key] as Raw) : {};
    const out = { ...base } as Record<string, unknown>;
    for (const [field, fallbackValue] of Object.entries(base)) {
      const value = source[field];
      if (typeof fallbackValue === "string" && fallbackValue.startsWith("#")) {
        if (typeof value === "string" && HEX.test(value)) out[field] = value;
      } else if (typeof fallbackValue === "number") {
        if (typeof value === "number" && Number.isFinite(value)) out[field] = value;
      } else if (typeof fallbackValue === "boolean") {
        out[field] = value === true;
      } else if (Array.isArray(fallbackValue)) {
        if (Array.isArray(value)) out[field] = [...new Set(value.filter(isRow))].slice(0, 5);
      } else if (typeof value === "string" && value) {
        out[field] = value;
      }
    }
    return out as T;
  };
  return { front: part("front", saved.front), back: part("back", saved.back), shape: part("shape", saved.shape) };
}

/* ── Notes ────────────────────────────────────────────────── */

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function designNotes(design: CardDesign, person: CardPerson | undefined): string[] {
  const notes: string[] = [];
  const { front, back } = design;
  if (luminance(front.qrInk) > luminance(front.qrPanel)) {
    notes.push("The QR code is lighter than its tile. Many phones can't read a reversed code: make the code the darker colour.");
  } else if (contrast(front.qrInk, front.qrPanel) < 4) {
    notes.push(`The QR code and its tile are close in colour (${contrast(front.qrInk, front.qrPanel).toFixed(1)}:1). Phones read 4:1 or more reliably.`);
  }
  if (contrast(back.pillInk, back.pill) < 3) notes.push("The text on the rows is hard to read against them. Pick a darker or lighter row text colour.");
  if (contrast(back.highlightInk, back.highlightPill) < 3) notes.push("The highlighted row's text is hard to read against it.");
  if (!back.rows.includes(back.highlight)) notes.push(`The highlighted row (${back.highlight}) isn't one of the rows, so nothing is highlighted.`);
  if (person) {
    const empty = back.rows.filter((row) => !rowText(row, person));
    if (empty.length) notes.push(`${person.name} has nothing for ${empty.join(" and ")}, so ${empty.length > 1 ? "those rows are" : "that row is"} left off their card.`);
  }
  if (front.qr === "contact") notes.push("Contact mode puts the whole contact inside the code, so it's denser: print the card at full size.");
  return notes;
}

/* ── Preview ──────────────────────────────────────────────── */

function CardsPreview({ value, people, fallback }: { value: Raw; people: PreviewPerson[]; fallback: CardDesign }) {
  const [selected, setSelected] = useState(people[0]?.person.slug ?? "");
  const design = useMemo(() => liveDesign(value.design, fallback), [value.design, fallback]);
  const current = people.find((p) => p.person.slug === selected) ?? people[0];
  const notes = designNotes(design, current?.person);

  const sides = useMemo(() => {
    if (!current) return null;
    const qr = qrValue(current.person, design.front.qr);
    const draw = (side: CardSide) => renderCard(side, current.person, design, qr, { font: INLINE_CARD_FONT });
    return { front: draw("front"), back: draw("back") };
  }, [current, design]);

  return (
    <section aria-labelledby="cards-preview-title" className="card animate-rise-in overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 sm:px-6">
        <h2 id="cards-preview-title" className="flex items-center gap-2 font-display text-[1.05rem] font-medium tracking-[-0.015em] text-ink">
          <Eye className="size-4 text-em" aria-hidden="true" /> Live preview
        </h2>
        {people.length > 1 ? (
          <label className="flex items-center gap-2 text-[0.78rem] text-faint">
            Card for
            <select
              value={current?.person.slug}
              onChange={(event) => setSelected(event.target.value)}
              className="h-8 rounded-lg border border-line bg-white/[0.03] px-2.5 text-[0.8rem] text-ink outline-none focus-visible:border-em/60"
            >
              {people.map(({ person, note }) => (
                <option key={person.slug} value={person.slug}>
                  {person.name}
                  {note ? ` (${note})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[0.76rem] text-faint">Follows the form as you edit. Nothing changes on the site until you save.</p>
        )}
      </header>

      {current && sides ? (
        <>
          <div className="grid gap-px bg-line md:grid-cols-2">
            {(["front", "back"] as const).map((side) => (
              <figure key={side} className="min-w-0 bg-bg-2/95 p-4 sm:p-5">
                <figcaption className="label-mono mb-3 text-[0.62rem] text-faint">{side === "front" ? "Front · dark side" : "Back · light side"}</figcaption>
                <div
                  className="overflow-hidden shadow-[0_24px_48px_-24px_rgb(0_0_0/0.9)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  style={{ borderRadius: cardRadius(design) }}
                  dangerouslySetInnerHTML={{ __html: sides[side] }}
                />
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 sm:px-6">
            <PreviewLink href={current.editHref} icon={PenLine}>
              {current.person.name}&apos;s phone, email &amp; website
            </PreviewLink>
            <PreviewLink href={`/cards/${current.person.slug}`} icon={ExternalLink} external>
              Open their card
            </PreviewLink>
            {current.note && <span className="ml-auto text-[0.76rem] text-warn">Not on the site: {current.note}</span>}
          </div>
        </>
      ) : (
        <p className="px-5 py-8 text-center text-[0.86rem] text-muted sm:px-6">Add someone to Team to preview a card.</p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1.5 border-t border-line bg-warn/[0.04] px-5 py-3.5 sm:px-6" aria-label="Notes">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2.5 text-[0.8rem] leading-relaxed text-dim">
              <TriangleAlert className="mt-[0.2rem] size-3.5 shrink-0 text-warn" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreviewLink({ href, icon: Icon, external, children }: { href: string; icon: LucideIcon; external?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[0.76rem] font-medium text-dim transition-[border-color,color] duration-200 hover:border-em/50 hover:text-ink",
      )}
    >
      <Icon className="size-3.5 text-em" aria-hidden="true" />
      {children}
    </a>
  );
}
