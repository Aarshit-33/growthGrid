import { llmsFullTxt, markdownResponse } from "@/lib/seo/llms";

/* ─────────────────────────────────────────────────────────────
   /llms-full.txt: the site's published content in one Markdown
   file for AI assistants (services, case studies, articles,
   FAQs, process, contact). Built at build time.
   ───────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

export async function GET() {
  return markdownResponse(await llmsFullTxt());
}
