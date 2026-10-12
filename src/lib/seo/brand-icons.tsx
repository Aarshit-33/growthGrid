import "server-only";
import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_ASSETS, iconTileStyle, type BrandAssetName, type IconTileStyle } from "@/lib/brand";
import { isDatabaseConfigured } from "@/lib/db/mongoose";
import { readMediaBytes } from "@/lib/media/gridfs";
import { isMediaInDatabase } from "@/lib/media/known";
import type { Brand } from "@/lib/schemas/settings";
import { sniffImage } from "@/lib/utils/image-type";

/* ─────────────────────────────────────────────────────────────
   App icons for /brand/[asset] (and /favicon.ico).
   • No custom icon: the built-in files, byte for byte.
   • A custom icon (Studio › Branding): every size is rendered
     from it with next/og. With an icon background set, it sits on
     a padded tile of that colour; otherwise it's used as it is.
     The maskable icon always keeps it inside the safe zone.
   ───────────────────────────────────────────────────────────── */

const DEFAULTS_DIR = join(process.cwd(), "src/assets/brand");
const PUBLIC_DIR = join(process.cwd(), "public");

/**
 * The built-in icon files, served as they are (null: none, it's drawn). Literal
 * paths, not a lookup table, so the build traces just these files.
 */
function readDefaultFile(name: BrandAssetName): Promise<Buffer> | null {
  switch (name) {
    case "favicon.ico":
      return readFile(join(DEFAULTS_DIR, "favicon.ico"));
    case "icon.svg":
      return readFile(join(DEFAULTS_DIR, "icon.svg"));
    case "apple-icon.png":
      return readFile(join(DEFAULTS_DIR, "apple-icon.png"));
    case "icon-192.png":
      return readFile(join(PUBLIC_DIR, "icons", "icon-192.png"));
    case "icon-512.png":
      return readFile(join(PUBLIC_DIR, "icons", "icon-512.png"));
    case "maskable-512.png":
      return readFile(join(PUBLIC_DIR, "icons", "maskable-512.png"));
    default:
      return null;
  }
}

/** Sizes inside the generated favicon.ico. */
const ICO_SIZES = [16, 32, 48];

/** Largest stored icon pulled from the media database to render from. */
const MAX_STORED_ICON_BYTES = 8 * 1024 * 1024;

/** A site path's bytes from the media database (CONTENT_SOURCE=mongo), or null. */
async function readStored(path: string): Promise<Buffer | null> {
  if (!isMediaInDatabase() || !isDatabaseConfigured()) return null;
  try {
    return await readMediaBytes(path, MAX_STORED_ICON_BYTES);
  } catch (error) {
    console.warn(`[brand] couldn't read ${path} from the media database:`, error);
    return null;
  }
}

/**
 * An image from /public (or, with CONTENT_SOURCE=mongo, the media database) as
 * a data URI the renderer can embed (PNG, JPG, GIF or SVG), or null: missing,
 * outside /public, or a format it can't draw.
 */
export async function embeddableImage(src: string): Promise<string | null> {
  // Brand URLs carry a ?v= fingerprint (src/lib/brand-files.ts): not part of the file name.
  const path = src.split(/[?#]/, 1)[0];
  const file = resolve(PUBLIC_DIR, `.${path.startsWith("/") ? path : `/${path}`}`);
  if (!file.startsWith(PUBLIC_DIR + sep)) return null;
  const bytes = (await readFile(file).catch(() => null)) ?? (await readStored(`/${relative(PUBLIC_DIR, file).split(sep).join("/")}`));
  if (!bytes) return null;
  const kind = sniffImage(bytes);
  if (!kind || kind.ext === "webp" || kind.ext === "avif") return null;
  return `data:${kind.mime};base64,${bytes.toString("base64")}`;
}

function tile(dataUri: string, size: number, { background, inset, radius }: IconTileStyle): ImageResponse {
  const inner = Math.max(1, Math.round(size * (1 - 2 * inset)));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background ?? "transparent",
          borderRadius: Math.round(size * radius),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- rendered to PNG by next/og */}
        <img src={dataUri} width={inner} height={inner} style={{ objectFit: "contain" }} />
      </div>
    ),
    { width: size, height: size },
  );
}

/** A .ico holding PNG images (supported by every current browser). */
function ico(images: { size: number; png: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const headerSize = 6 + 16 * images.length;
  const out = new Uint8Array(headerSize + images.reduce((sum, image) => sum + image.png.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    out[entry] = size >= 256 ? 0 : size;
    out[entry + 1] = size >= 256 ? 0 : size;
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

const respond = (body: BodyInit, type: string, extra: Record<string, string> = {}) =>
  new Response(body, { headers: { "Content-Type": type, ...extra } });

async function defaultAsset(name: BrandAssetName): Promise<Response> {
  const { type } = BRAND_ASSETS[name];
  const file = readDefaultFile(name);
  if (file) return respond(new Uint8Array(await file), type);
  // icon-32.png: the built-in SVG, drawn at 32px.
  const svg = await readFile(join(DEFAULTS_DIR, "icon.svg"));
  return tile(`data:image/svg+xml;base64,${svg.toString("base64")}`, BRAND_ASSETS[name].size, { background: null, inset: 0, radius: 0 });
}

/** One icon file for the brand in effect. */
export async function brandAssetResponse(name: BrandAssetName, brand: Brand): Promise<Response> {
  const icon = brand.app.icon;
  const image = icon ? await embeddableImage(icon.src) : null;
  if (icon && !image) {
    console.warn(`[brand] The app icon ${icon.src} is missing or isn't PNG, JPG, GIF or SVG: using the built-in icon.`);
  }
  if (!image) return defaultAsset(name);

  const style = iconTileStyle(name, brand);
  const { size, type } = BRAND_ASSETS[name];
  if (name === "favicon.ico") {
    const images = await Promise.all(
      ICO_SIZES.map(async (px) => ({ size: px, png: new Uint8Array(await tile(image, px, style).arrayBuffer()) })),
    );
    return respond(ico(images), type);
  }
  if (name === "icon.svg") {
    // An SVG wrapper around the icon, for anything still asking for /brand/icon.svg.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><image href="${image}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/></svg>`;
    return respond(svg, type, { "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'" });
  }
  return tile(image, size, style);
}
