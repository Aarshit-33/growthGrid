import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { svgTwin } from "@/lib/brand";
import type { Settings } from "@/lib/schemas";
import { imageSize } from "@/lib/utils/image-size";

/* ─────────────────────────────────────────────────────────────
   Brand files as they ship (public/logo/…). The settings name a
   file; what the site uses is decided from /public at build time:
   • An SVG with the same name next to it wins (primary.svg beside
     primary.png), so a designer's vector file is a drop-in.
   • The size comes from the file itself, so a replacement with
     other proportions never shows stretched.
   • Every URL carries ?v= with a fingerprint of the bytes, so
     browsers (and the favicon cache) fetch a changed file again.
   A file that can't be read keeps the settings as they are: the
   site's usual fallbacks (and validate:content) take it from there.
   ───────────────────────────────────────────────────────────── */

const PUBLIC_DIR = join(process.cwd(), "public");

type Brand = NonNullable<Settings["brand"]>;
type BrandImage = NonNullable<Brand["logo"]["image"]>;

/** A site path's bytes from /public, or null: missing, unreadable or outside it. */
async function readPublic(path: string): Promise<Buffer | null> {
  const file = resolve(PUBLIC_DIR, `.${path}`);
  if (!file.startsWith(PUBLIC_DIR + sep)) return null;
  return readFile(file).catch(() => null);
}

async function shipped(image: BrandImage): Promise<BrandImage> {
  const path = image.src.split(/[?#]/, 1)[0];
  if (!path.startsWith("/")) return image;
  const twin = svgTwin(path);
  const twinBytes = twin ? await readPublic(twin) : null;
  const bytes = twinBytes ?? (await readPublic(path));
  if (!bytes) return image;
  const src = twinBytes && twin ? twin : path;
  const version = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return { ...image, ...imageSize(bytes), src: `${src}?v=${version}` };
}

const ship = (image: BrandImage | null | undefined) => (image ? shipped(image) : Promise.resolve(null));

/** Settings with the brand images (logo, stacked logo, symbol, app icon) as they ship. */
export async function withBrandFiles(settings: Settings): Promise<Settings> {
  const { brand } = settings;
  if (!brand) return settings;
  const [image, mark, stacked, icon] = await Promise.all([
    ship(brand.logo.image),
    ship(brand.logo.mark),
    ship(brand.logo.stacked),
    ship(brand.app.icon),
  ]);
  return { ...settings, brand: { logo: { ...brand.logo, image, mark, stacked }, app: { ...brand.app, icon } } };
}
