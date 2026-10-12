import "server-only";
import type { CardsPage, Settings } from "@/lib/schemas";
import { interpolate } from "@/lib/utils";
import { cardFilePath, qrValue, type CardPerson } from "./person";
import { cardRadius, INLINE_CARD_FONT, renderCard, type CardSide } from "./render";

/** Everything a page needs to show one card: artwork, alt text, links and share copy. */
export interface CardView {
  person: CardPerson;
  front: string;
  back: string;
  radius: string;
  alt: Record<CardSide, string>;
  files: { front: string; back: string; contact: string; print: string };
  share: { title: string; text: string };
}

export function cardView(person: CardPerson, page: CardsPage, settings: Pick<Settings, "name">): CardView {
  const values = { name: person.name, role: person.role, site: settings.name };
  const qr = qrValue(person, page.design.front.qr);
  const draw = (side: CardSide) => renderCard(side, person, page.design, qr, { font: INLINE_CARD_FONT });
  return {
    person,
    front: draw("front"),
    back: draw("back"),
    radius: cardRadius(page.design),
    alt: {
      front: interpolate(page.labels.cardAlt, { name: person.name, side: page.labels.front }),
      back: interpolate(page.labels.cardAlt, { name: person.name, side: page.labels.back }),
    },
    files: {
      front: cardFilePath(person.slug, "front.svg"),
      back: cardFilePath(person.slug, "back.svg"),
      contact: cardFilePath(person.slug, "contact.vcf"),
      print: cardFilePath(person.slug, "print.html"),
    },
    share: { title: interpolate(page.member.seoTitle, values), text: interpolate(page.member.shareText, values) },
  };
}
