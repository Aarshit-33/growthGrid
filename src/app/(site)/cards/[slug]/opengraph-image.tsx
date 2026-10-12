import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCardPerson, getCardsContent } from "@/lib/cards/data";
import { qrValue } from "@/lib/cards/person";
import { renderCard } from "@/lib/cards/render";
import { OG_SIZE, ogImageMetadata, renderOgImage } from "@/lib/seo/og";
import { interpolate } from "@/lib/utils";

type Params = { slug: string };

/**
 * The link preview when a card is shared (WhatsApp, LinkedIn, iMessage…):
 * the card's own front, tilted slightly on the brand background, with the
 * person's name and role beside it.
 */
export async function generateImageMetadata({ params }: { params: Params }) {
  const [person, { page }] = await Promise.all([getCardPerson(params.slug), getCardsContent()]);
  return ogImageMetadata(person ? interpolate(page.labels.cardAlt, { name: person.name, side: page.labels.front }) : page.seo.title);
}

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [person, { page, settings }] = await Promise.all([getCardPerson(slug), getCardsContent()]);
  if (!person) return renderOgImage({ eyebrow: page.hero.eyebrow, title: page.hero.headline, settings });

  // The front has no live text (logo paths and the QR code), so it draws faithfully as an image.
  const front = renderCard("front", person, page.design, qrValue(person, page.design.front.qr), { font: { family: "sans-serif" } });
  const src = `data:image/svg+xml;base64,${Buffer.from(front).toString("base64")}`;
  const [display, mono] = await Promise.all([
    readFile(join(FONT_DIR, "SpaceGrotesk-500.ttf")),
    readFile(join(FONT_DIR, "JetBrainsMono-500.ttf")),
  ]);
  const radius = Math.round((page.design.shape.corners / 1050) * 560);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 64px",
          gap: 48,
          backgroundColor: "#04070a",
          backgroundImage:
            "radial-gradient(ellipse 60% 70% at 30% 60%, rgba(60,228,154,0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(60,228,154,0.10), transparent 70%)",
          color: "#f0f4f7",
        }}
      >
        <div style={{ display: "flex", transform: "rotate(-4deg)", borderRadius: radius, boxShadow: "0 40px 80px -30px rgba(0,0,0,0.9)" }}>
          <img src={src} width={560} height={320} alt="" style={{ borderRadius: radius }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 18, letterSpacing: 3, textTransform: "uppercase", color: "#3ce49a" }}>
            {page.member.eyebrow}
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontSize: 60, lineHeight: 1.02, letterSpacing: -2, marginTop: 18 }}>{person.name}</div>
          <div style={{ fontFamily: "Space Grotesk", fontSize: 26, color: "#c8d4dc", marginTop: 16, lineHeight: 1.3 }}>{person.role}</div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 18, color: "#8a9aaa", marginTop: 34 }}>{person.website.display}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Space Grotesk", data: display, weight: 500, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}

