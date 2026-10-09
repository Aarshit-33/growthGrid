/* ─────────────────────────────────────────────────────────────
   An image's real type, from its first bytes (never its name):
   a renamed .exe is never an image. Shared by Studio uploads and
   the brand icon renderer. No Node-only imports.
   ───────────────────────────────────────────────────────────── */

export interface ImageKind {
  /** File extension without the dot. */
  ext: "png" | "jpg" | "gif" | "webp" | "avif" | "svg";
  mime: string;
}

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const ascii = (at: number, text: string) => [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, "PNG")) return { ext: "png", mime: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return { ext: "gif", mime: "image/gif" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { ext: "webp", mime: "image/webp" };
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return { ext: "avif", mime: "image/avif" };
  // SVG: text whose first element is <svg> (after an optional XML declaration, comments or doctype).
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    return { ext: "svg", mime: "image/svg+xml" };
  }
  return null;
}
