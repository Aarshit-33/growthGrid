import { legalOgImage, legalOgMetadata } from "@/lib/seo/og-routes";

/** Social card for this legal page, built from its title. */
export async function generateImageMetadata() {
  return legalOgMetadata("terms");
}

export default async function Image() {
  return legalOgImage("terms");
}
