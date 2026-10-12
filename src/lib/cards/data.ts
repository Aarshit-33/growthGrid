import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import { getPage, getSettings, getTeam } from "@/lib/data";
import { hasCard, resolveCardPerson, type CardPerson } from "./person";
import type { CardFont } from "./render";

/* ─────────────────────────────────────────────────────────────
   Business cards on the server: who has one (published team
   members whose card isn't switched off), and the font that
   travels inside downloaded artwork.
   ───────────────────────────────────────────────────────────── */

/** Everyone with a card, in team order. */
export const getCardPeople = cache(async (): Promise<CardPerson[]> => {
  const [team, settings] = await Promise.all([getTeam(), getSettings()]);
  return team.filter(hasCard).map((member) => resolveCardPerson(member, settings));
});

export const getCardPerson = cache(async (slug: string) => (await getCardPeople()).find((person) => person.slug === slug));

/** The cards page copy and design, plus the site settings most callers need. */
export const getCardsContent = cache(async () => {
  const [page, settings] = await Promise.all([getPage("cards"), getSettings()]);
  return { page, settings };
});

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");
const EMBEDDED_FAMILY = "GG Card";

/**
 * Space Grotesk (500 and 600) embedded as data URLs, so a downloaded SVG, and
 * the PNG the browser draws from it, keep the brand's type with nothing to
 * load. An SVG drawn as an image can't fetch fonts.
 */
export const getEmbeddedCardFont = cache(async (): Promise<CardFont> => {
  const faces = await Promise.all(
    ([500, 600] as const).map(async (weight) => {
      const data = await readFile(join(FONT_DIR, `SpaceGrotesk-${weight}.ttf`));
      return `@font-face{font-family:'${EMBEDDED_FAMILY}';src:url(data:font/ttf;base64,${data.toString("base64")}) format('truetype');font-weight:${weight};font-style:normal}`;
    }),
  );
  return { family: `'${EMBEDDED_FAMILY}', 'Space Grotesk', sans-serif`, css: faces.join("") };
});
