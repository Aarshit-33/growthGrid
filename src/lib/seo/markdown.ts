import type { Block } from "@/lib/schemas";
import { absoluteUrl } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Content as Markdown, for the files AI assistants read
   (/llms.txt, /llms-full.txt). Content text already uses a
   Markdown subset (**bold**, *em*, `code`, [links](…)), so it
   passes through; site-relative links become absolute, since
   the text is read away from the site.
   ───────────────────────────────────────────────────────────── */

/** Content text with its site-relative links made absolute. */
export function inlineMarkdown(text: string, base: string): string {
  return text.replace(/\]\((\/[^)\s]*)\)/g, (_, path: string) => `](${absoluteUrl(path, base)})`);
}

/** Text that's safe inside a link's [square brackets]. */
export const linkText = (text: string) => text.replace(/[[\]]/g, "\\$&");

/** `- [label](url): note` */
export const linkItem = (label: string, url: string, note?: string) =>
  `- [${linkText(label)}](${url})${note ? `: ${note}` : ""}`;

const CALLOUT_TITLE = { info: "Note", tip: "Tip", warning: "Warning" } as const;

const quoted = (text: string) =>
  text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");

/**
 * Article blocks as Markdown. `depth` shifts headings down so the article
 * nests under the file's own headings (an h2 with depth 2 becomes ####).
 */
export function blocksToMarkdown(blocks: Block[], base: string, depth = 0): string {
  const md = (text: string) => inlineMarkdown(text, base);
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `${"#".repeat(Math.min(block.level + depth, 6))} ${md(block.text)}`;
        case "paragraph":
          return md(block.text);
        case "list":
          return block.items
            .map((item, i) => `${block.style === "number" ? `${i + 1}.` : "-"} ${md(item)}`)
            .join("\n");
        case "quote":
          return quoted(block.cite ? `${md(block.text)}\n\n— ${md(block.cite)}` : md(block.text));
        case "callout":
          return quoted(`**${block.title ?? CALLOUT_TITLE[block.tone]}:** ${md(block.text)}`);
        case "code": {
          const fence = block.code.includes("```") ? "~~~~" : "```";
          const code = [`${fence}${block.language}`, block.code, fence].join("\n");
          return block.caption ? `${code}\n\n${md(block.caption)}` : code;
        }
        case "image": {
          const image = `![${linkText(block.image.alt)}](${absoluteUrl(block.image.src, base)})`;
          return block.caption ? `${image}\n\n${md(block.caption)}` : image;
        }
        case "divider":
          return "* * *";
      }
    })
    .join("\n\n");
}
