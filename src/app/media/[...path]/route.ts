import { Readable } from "node:stream";
import { isDatabaseConfigured } from "@/lib/db/mongoose";
import { findMediaFile, openMediaStream, type MediaFile } from "@/lib/media/gridfs";
import { isMediaInDatabase } from "@/lib/media/known";

/* ─────────────────────────────────────────────────────────────
   Images stored in MongoDB (CONTENT_SOURCE=mongo), served at the
   same URLs /public files have. next.config.ts sends /images/*
   here as a *fallback* rewrite, so it only runs when no /public
   file (and no page) answers: shipped files always win, and the
   content keeps plain paths like "/images/uploads/cover.webp".

   Behaves like a static file: Content-Type, Content-Length,
   ETag (the SHA-256 of the bytes), Last-Modified, 304s, and
   single byte ranges (206/416). A range is capped at 4 MB, under
   Vercel's 4.5 MB function response limit; browsers ask for the
   rest themselves.
   ───────────────────────────────────────────────────────────── */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only this top folder is ever stored (uploads always go under public/images). */
const ROOT = "images";
const MAX_RANGE_BYTES = 4 * 1024 * 1024;
/* A path is never reused for different bytes by the Studio, so caching is
   safe; it isn't `immutable` because `npm run media -- upload --force` can
   replace a file, and ETags make every later check cheap. */
const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";
const MISSING_CACHE = "public, max-age=0, s-maxage=60";
/** An SVG opened directly can't run scripts or load anything. */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

type Params = { params: Promise<{ path: string[] }> };

const text = (status: number, body: string, cache = "no-store") =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache } });

/** "/images/…" from the URL segments, or null for anything that isn't a plain path under images/. */
function sitePath(segments: string[] | undefined): string | null {
  if (!segments?.length || segments[0] !== ROOT || segments.length < 2) return null;
  const bad = segments.some((part) => !part || part === "." || part === ".." || /[\\/\0]/.test(part));
  return bad ? null : `/${segments.join("/")}`;
}

type Range = { start: number; end: number };

/** A single "bytes=" range: the range, "unsatisfiable" (416), or null to send the whole file. */
function parseRange(header: string | null, size: number): Range | "unsatisfiable" | null {
  if (!header || size === 0) return null;
  // Several ranges or another unit: ignored (allowed by RFC 9110), the whole file is sent.
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    if (start >= size) return "unsatisfiable";
    end = match[2] === "" ? size - 1 : Number(match[2]);
    if (end < start) return null; // Invalid range: ignored.
    end = Math.min(end, size - 1);
  }
  return { start, end: Math.min(end, start + MAX_RANGE_BYTES - 1) };
}

const etagOf = (file: MediaFile) => `"${(file.metadata.sha256 || file.id.toHexString()).slice(0, 40)}"`;

/** If-None-Match: does any listed tag (weak or strong) match? */
const tagMatches = (header: string, etag: string) =>
  header.trim() === "*" || header.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag);

/** HTTP dates have whole seconds. */
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

function notModified(request: Request, etag: string, modified: Date): boolean {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) return tagMatches(ifNoneMatch, etag);
  const since = Date.parse(request.headers.get("if-modified-since") ?? "");
  return Number.isFinite(since) && seconds(modified) <= Math.floor(since / 1000);
}

/** If-Range: honour the Range only when the file is still the one the client has. */
function rangeStillValid(request: Request, etag: string, modified: Date): boolean {
  const ifRange = request.headers.get("if-range");
  if (!ifRange) return true;
  if (ifRange.startsWith('"')) return ifRange === etag;
  const date = Date.parse(ifRange);
  return Number.isFinite(date) && seconds(modified) === Math.floor(date / 1000);
}

async function serve(request: Request, { params }: Params, head: boolean): Promise<Response> {
  if (!isMediaInDatabase()) return text(404, "Not found", MISSING_CACHE);
  const path = sitePath((await params).path);
  if (!path) return text(404, "Not found", MISSING_CACHE);
  if (!isDatabaseConfigured()) return text(503, "The media database isn't configured.");

  let file: MediaFile | null;
  try {
    file = await findMediaFile(path);
  } catch (error) {
    console.error(`[media] couldn't look up ${path}:`, error);
    return text(503, "The media database is unavailable. Try again shortly.");
  }
  if (!file) return text(404, "Not found", MISSING_CACHE);

  const size = file.length;
  const etag = etagOf(file);
  const modified = new Date(file.metadata.uploadedAt ?? file.uploadDate);
  const headers = new Headers({
    "Cache-Control": CACHE,
    ETag: etag,
    "Last-Modified": modified.toUTCString(),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (notModified(request, etag, modified)) return new Response(null, { status: 304, headers });

  const contentType = file.metadata.contentType || "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `inline; filename="${file.metadata.name.replace(/["\\\r\n]/g, "")}"`);
  if (contentType === "image/svg+xml") headers.set("Content-Security-Policy", SVG_CSP);

  const range = rangeStillValid(request, etag, modified) ? parseRange(request.headers.get("range"), size) : null;
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    headers.delete("Content-Type");
    return new Response(null, { status: 416, headers });
  }
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range ? range.end - range.start + 1 : size));
  const status = range ? 206 : 200;
  if (head || size === 0) return new Response(null, { status, headers });

  try {
    const stream = await openMediaStream(file.id, range ?? undefined);
    // Stop reading from the database as soon as the visitor goes away.
    request.signal?.addEventListener("abort", () => stream.destroy(), { once: true });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
  } catch (error) {
    console.error(`[media] couldn't read ${path}:`, error);
    return text(503, "The media database is unavailable. Try again shortly.");
  }
}

export function GET(request: Request, context: Params) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: Params) {
  return serve(request, context, true);
}
