import { getSettings } from "@/lib/data";

/* ─────────────────────────────────────────────────────────────
   /indexnow-key.txt: the IndexNow key (Site settings › SEO).
   It proves to Bing, Yandex and the other IndexNow engines that
   URL submissions for this host come from its owner; the key is
   public by design. `npm run indexnow` points them here
   (keyLocation). Without a key, or while search engines are
   discouraged (staging, pre-launch): 404, so nothing is submitted.
   ───────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

export async function GET() {
  const { seo } = await getSettings();
  if (!seo.indexNowKey || seo.discourageSearchEngines) return new Response("Not found", { status: 404 });
  return new Response(seo.indexNowKey, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
