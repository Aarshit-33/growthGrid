import { getCardPerson, getCardsContent, getEmbeddedCardFont } from "@/lib/cards/data";
import { CARD_FILES, qrValue, vCard, type CardFile } from "@/lib/cards/person";
import { renderCard, PRINT_BLEED, CARD_SIZE } from "@/lib/cards/render";
import { interpolate } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   /cards/<slug>/front.svg · back.svg · contact.vcf

   The artwork as standalone, print-sized SVG (3.5 × 2 in, fonts
   embedded), which is also what the browser rasterises for the
   PNG downloads, and the contact as a vCard for "Save contact".
   Rendered per request from the current content, so a change in
   the Studio shows up in the next download.
   ───────────────────────────────────────────────────────────── */

type Context = { params: Promise<{ slug: string; file: string }> };

const isCardFile = (file: string): file is CardFile => (CARD_FILES as readonly string[]).includes(file);

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_request: Request, { params }: Context) {
  const { slug, file } = await params;
  if (!isCardFile(file)) return notFound();
  const [person, { page }] = await Promise.all([getCardPerson(slug), getCardsContent()]);
  if (!person) return notFound();

  const shared = { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };

  if (file === "contact.vcf") {
    return new Response(vCard(person), {
      headers: {
        ...shared,
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.vcf"`,
      },
    });
  }

  if (file === "print.html") {
    const font = await getEmbeddedCardFont();
    const qr = qrValue(person, page.design.front.qr);
    const draw = (side: "front" | "back") =>
      renderCard(side, person, page.design, qr, {
        font,
        bleed: PRINT_BLEED,
        label: interpolate(page.labels.cardAlt, { name: person.name, side: page.labels[side] }),
      });
    return new Response(printSheet(person.name, draw("front"), draw("back")), {
      headers: {
        ...shared,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'",
      },
    });
  }

  const side = file === "front.svg" ? "front" : "back";
  const svg = renderCard(side, person, page.design, qrValue(person, page.design.front.qr), {
    font: await getEmbeddedCardFont(),
    label: interpolate(page.labels.cardAlt, { name: person.name, side: page.labels[side] }),
    standalone: true,
  });
  return new Response(svg, {
    headers: {
      ...shared,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}-${side}.svg"`,
      // Plain artwork: no scripts, no outside requests.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src data:",
    },
  });
}

/**
 * Both sides at their printed size plus 3 mm bleed on every edge, one per
 * page with no margins, so the browser's "Save as PDF" makes the file a
 * printer asks for. Dashed trim lines show on screen only.
 */
function printSheet(name: string, front: string, back: string): string {
  const inch = (px: number) => `${(px / 300).toFixed(4)}in`;
  const pageW = inch(CARD_SIZE.width + 2 * PRINT_BLEED);
  const pageH = inch(CARD_SIZE.height + 2 * PRINT_BLEED);
  const trim = inch(PRINT_BLEED);
  const safe = (name.replace(/[&<>"]/g, "") || "Business card");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${safe} · business card (print)</title>
<style>
@page{size:${pageW} ${pageH};margin:0}
*{box-sizing:border-box}html,body{margin:0}
body{font:15px/1.5 system-ui,sans-serif;background:#0b1114;color:#dfe8ec}
.sheet{position:relative;width:${pageW};height:${pageH};margin:0 auto;break-after:page;overflow:hidden}
.sheet:last-of-type{break-after:auto}
.sheet svg{display:block;width:100%;height:100%}
.trim{position:absolute;inset:${trim};border:1px dashed rgba(255,60,120,.85);pointer-events:none}
.bar{max-width:42rem;margin:0 auto;padding:1.25rem 1rem;text-align:center}
.bar button{font:inherit;font-weight:600;padding:.7rem 1.4rem;border:0;border-radius:99px;background:#3ce49a;color:#04070a;cursor:pointer}
.bar p{margin:.6rem 0 0;color:#9fb0ba;font-size:13px}
.screen{display:grid;gap:1.25rem;padding:0 1rem 2rem}
.screen .sheet{box-shadow:0 20px 50px -20px #000;max-width:100%;height:auto;aspect-ratio:${CARD_SIZE.width + 2 * PRINT_BLEED}/${CARD_SIZE.height + 2 * PRINT_BLEED}}
@media print{body{background:none}.bar,.trim{display:none}.screen{display:block;padding:0}.screen .sheet{box-shadow:none;width:${pageW};height:${pageH};max-width:none}}
</style></head><body>
<div class="bar"><button type="button" onclick="print()">Save as PDF</button><p>In the print dialog choose “Save as PDF”, margins “None” and scale 100%. Page size: 3.5 × 2 in plus 3 mm bleed. The dashed line is where the printer trims.</p></div>
<main class="screen"><section class="sheet">${front}<span class="trim"></span></section><section class="sheet">${back}<span class="trim"></span></section></main>
<script>addEventListener("load",()=>setTimeout(()=>print(),400))</script>
</body></html>`;
}
