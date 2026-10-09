import { heroOgImage, heroOgMetadata } from "@/lib/seo/og-routes";

/** Social card for this page, built from its hero copy. */
export async function generateImageMetadata() {
  return heroOgMetadata("insights");
}

export default async function Image() {
  return heroOgImage("insights");
}
