import { BRAND_ASSETS, isBrandAsset, resolveBrand } from "@/lib/brand";
import { getSettings } from "@/lib/data";
import { brandAssetResponse } from "@/lib/seo/brand-icons";

/* ─────────────────────────────────────────────────────────────
   The site's icons: /brand/icon-192.png and friends (and
   /favicon.ico, rewritten here in next.config.ts), from
   Studio › Branding or the built-in grid icon. Built once at
   build time, like the other metadata files; `next dev` renders
   them on each request, so a Branding change shows on reload.
   ───────────────────────────────────────────────────────────── */

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(BRAND_ASSETS).map((asset) => ({ asset }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!isBrandAsset(asset)) return new Response("Not found", { status: 404 });
  return brandAssetResponse(asset, resolveBrand(await getSettings()));
}
