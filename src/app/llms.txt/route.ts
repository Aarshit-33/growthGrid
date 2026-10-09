import { llmsTxt, markdownResponse } from "@/lib/seo/llms";

/* ─────────────────────────────────────────────────────────────
   /llms.txt: the site in brief for AI assistants and answer
   engines (llmstxt.org), from published content. Built at build
   time like the sitemap; `next dev` renders it on each request.
   ───────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

export async function GET() {
  return markdownResponse(await llmsTxt());
}
