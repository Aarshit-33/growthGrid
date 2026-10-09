import type { NextRequest } from "next/server";
import { cameThroughGate, getFilesConfig } from "@/lib/files/config";
import { listPublicFiles, publicDir } from "@/lib/files/list";
import { ZIP_LIMITS, zipFiles } from "@/lib/files/zip";

/* ─────────────────────────────────────────────────────────────
   File library downloads as one .zip, streamed:

     <FILES_PATH>/zip              everything in /public
     <FILES_PATH>/zip?folder=a/b   the files directly in public/a/b
                                   (?folder= alone: /public's own)

   Like the page, only reachable through the private address
   (src/proxy.ts), and only ever zips what listPublicFiles() lists.
   ───────────────────────────────────────────────────────────── */

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function GET(request: NextRequest) {
  if (!cameThroughGate(getFilesConfig(), request.headers)) return plain(404, "Not found");

  const params = request.nextUrl.searchParams;
  const folder = params.has("folder") ? (params.get("folder") ?? "").replace(/^\/+|\/+$/g, "") : null;
  const files = (await listPublicFiles()).filter((file) => folder === null || file.folder === folder);
  if (files.length === 0) return plain(404, "No files to download.");

  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (files.length > ZIP_LIMITS.files || bytes > ZIP_LIMITS.bytes) {
    return plain(413, "Too much for one .zip: download these files one by one.");
  }

  const label = folder === null ? "public" : folder ? `public-${folder}` : "public-root";
  const filename = `${label.replace(/[^a-z0-9._-]+/gi, "-")}.zip`;
  const chunks = zipFiles(files, publicDir());

  // Pulled chunk by chunk, so a slow download never buffers the whole archive.
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
