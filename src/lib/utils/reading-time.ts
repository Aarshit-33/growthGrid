import type { Block } from "@/lib/schemas";

const WORDS_PER_MINUTE = 225;

function words(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Plain text carried by a block (used for reading time and excerpts). */
export function blockText(block: Block): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return block.text;
    case "callout":
      return [block.title ?? "", block.text].join(" ");
    case "list":
      return block.items.join(" ");
    case "code":
      return block.code;
    case "image":
      return block.caption ?? "";
    case "divider":
      return "";
  }
}

/** Estimated reading time in whole minutes (minimum 1). */
export function readingTime(body: Block[]): number {
  const total = body.reduce((sum, block) => sum + words(blockText(block)), 0);
  return Math.max(1, Math.round(total / WORDS_PER_MINUTE));
}
