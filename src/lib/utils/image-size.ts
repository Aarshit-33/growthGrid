import { sniffImage } from "./image-type";

/* ─────────────────────────────────────────────────────────────
   An image's pixel size, read from its bytes: PNG, GIF, JPEG,
   WebP and SVG (its width and height, else its viewBox). Lets
   the site size a brand file correctly whatever replaced it.
   No Node-only imports.
   ───────────────────────────────────────────────────────────── */

export interface PixelSize {
  width: number;
  height: number;
}

const size = (width: number, height: number): PixelSize | null =>
  width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? { width: Math.round(width), height: Math.round(height) }
    : null;

/** The frame size from the first SOF segment. */
function jpegSize(bytes: Uint8Array, view: DataView): PixelSize | null {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    // SOF0–SOF15 carry the size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return size(view.getUint16(at + 7), view.getUint16(at + 5));
    }
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}

function webpSize(bytes: Uint8Array, view: DataView): PixelSize | null {
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === "VP8X") return size(1 + (view.getUint32(24, true) & 0xffffff), 1 + (view.getUint32(27, true) & 0xffffff));
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return size(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }
  if (chunk === "VP8 ") return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  return null;
}

/** Absolute width/height (unitless or px) win; otherwise the viewBox, keeping its ratio. */
function svgSize(bytes: Uint8Array): PixelSize | null {
  const tag = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(bytes.subarray(0, 64 * 1024)))?.[0];
  if (!tag) return null;
  // `\s` first, so stroke-width and friends never match.
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  const length = (value: string | undefined) => (value && /^\s*[\d.]+\s*(?:px)?\s*$/i.test(value) ? Number.parseFloat(value) : 0);
  const width = length(attr("width"));
  const height = length(attr("height"));
  if (width > 0 && height > 0) return size(width, height);
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || !(box[2] > 0) || !(box[3] > 0)) return null;
  if (width > 0) return size(width, (width * box[3]) / box[2]);
  if (height > 0) return size((height * box[2]) / box[3], height);
  return size(box[2], box[3]);
}

/** Pixel size, or null: not an image, a format without a readable size (AVIF), or truncated. */
export function imageSize(bytes: Uint8Array): PixelSize | null {
  const kind = sniffImage(bytes);
  if (!kind) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    switch (kind.ext) {
      case "png":
        return size(view.getUint32(16), view.getUint32(20));
      case "gif":
        return size(view.getUint16(6, true), view.getUint16(8, true));
      case "jpg":
        return jpegSize(bytes, view);
      case "webp":
        return webpSize(bytes, view);
      case "svg":
        return svgSize(bytes);
      default:
        return null;
    }
  } catch {
    return null; // cut short: reading past the end
  }
}
