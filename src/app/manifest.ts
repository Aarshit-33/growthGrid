import type { MetadataRoute } from "next";
import { brandAssetUrl, resolveBrand } from "@/lib/brand";
import { getSettings } from "@/lib/data";

/** Web app manifest (install / home-screen metadata), from settings and Branding. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();
  const brand = resolveBrand(settings);
  return {
    id: "/",
    name: settings.name,
    short_name: settings.name,
    description: settings.description,
    lang: settings.locale.replace("_", "-"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: brand.app.themeColor,
    theme_color: brand.app.themeColor,
    categories: ["business", "productivity", "design"],
    icons: [
      { src: brandAssetUrl(brand, "icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: brandAssetUrl(brand, "icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: brandAssetUrl(brand, "maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
