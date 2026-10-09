/* ─────────────────────────────────────────────────────────────
   File library: what the server sends the page, and the helpers
   both sides share. Client-safe: no Node imports.
   ───────────────────────────────────────────────────────────── */

export type FileKind = "image" | "video" | "audio" | "pdf" | "font" | "text" | "archive" | "other";

export interface PublicFile {
  /** URL, encoded: public/images/a b.jpg is "/images/a%20b.jpg". */
  src: string;
  /** Path inside /public, as written: "images/a b.jpg". */
  path: string;
  /** Its folder inside /public; "" for /public itself. */
  folder: string;
  name: string;
  /** Lowercase, without the dot ("jpg"); "" when there's none. */
  ext: string;
  kind: FileKind;
  bytes: number;
  /** Last modified, epoch milliseconds. */
  modified: number;
  /** The start of a small text file, shown on its card. */
  snippet?: string;
}

const EXTENSIONS: Record<Exclude<FileKind, "other">, string[]> = {
  image: ["apng", "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"],
  video: ["m4v", "mov", "mp4", "ogv", "webm"],
  audio: ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"],
  pdf: ["pdf"],
  font: ["otf", "ttf", "woff", "woff2"],
  text: ["css", "csv", "htm", "html", "js", "json", "map", "md", "mjs", "txt", "webmanifest", "xml", "yaml", "yml"],
  archive: ["7z", "gz", "rar", "tar", "tgz", "zip"],
};

const KIND_BY_EXTENSION = new Map<string, FileKind>(
  Object.entries(EXTENSIONS).flatMap(([kind, list]) => list.map((ext) => [ext, kind as FileKind] as const)),
);

export function kindOf(ext: string): FileKind {
  return KIND_BY_EXTENSION.get(ext) ?? "other";
}

/** Filter labels, in display order. */
export const KIND_LABELS: Record<FileKind, string> = {
  image: "Images",
  video: "Video",
  audio: "Audio",
  pdf: "PDFs",
  font: "Fonts",
  text: "Text & data",
  archive: "Archives",
  other: "Other",
};

/** One file's kind, for its details. */
export const KIND_NAMES: Record<FileKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF document",
  font: "Font",
  text: "Text",
  archive: "Archive",
  other: "File",
};

/** 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")} ${units[unit]}`;
}

/** "4 Oct 2026": fixed locale and UTC, so the server and the browser agree. */
export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
