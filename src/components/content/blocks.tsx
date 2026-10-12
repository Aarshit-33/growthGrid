import Image from "next/image";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { CopyCodeButton } from "@/components/content/copy-code-button";
import { BrandCase } from "@/components/ui/brand-case";
import { InlineText, plainText } from "@/components/ui/rich-text";
import type { Block, HeadingBlock, Settings } from "@/lib/schemas";
import { cn, slugify } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Renders portable content blocks (articles, legal pages).
   Headings get stable ids so the table of contents and deep links
   work; inline text uses the safe markdown subset.
   ───────────────────────────────────────────────────────────── */

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

export const headingId = (block: HeadingBlock) => block.id ?? slugify(plainText(block.text));

export function extractToc(blocks: Block[]): TocEntry[] {
  return blocks.flatMap((b) =>
    b.type === "heading" ? [{ id: headingId(b), text: plainText(b.text), level: b.level }] : [],
  );
}

const CALLOUT: Record<"info" | "tip" | "warning", { icon: ReactNode; classes: string }> = {
  info: { icon: <Info className="size-4" />, classes: "border-info/30 bg-info/[0.06] text-info" },
  tip: { icon: <Lightbulb className="size-4" />, classes: "border-em/30 bg-em/[0.06] text-em" },
  warning: { icon: <AlertTriangle className="size-4" />, classes: "border-warn/30 bg-warn/[0.06] text-warn" },
};

/** Site settings › Interface text the blocks use: the copy-code button and untitled callouts. */
export type BlockLabels = Pick<Settings["ui"], "copyCode" | "copiedCode" | "copyCodeLabel" | "callouts">;

function BlockView({ block, labels }: { block: Block; labels: BlockLabels }) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 2 ? "h2" : "h3";
      return (
        <Tag id={headingId(block)} className="group scroll-mt-[calc(var(--header-h)+2rem)]">
          <InlineText text={block.text} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.style === "number" ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <figure className="relative my-10! border-l-2 border-em py-2 pl-6 md:pl-8">
          <blockquote className="font-display text-[clamp(1.35rem,1.1rem+1vw,1.9rem)] font-medium leading-snug tracking-[-0.025em] text-ink">
            <InlineText text={block.text} />
          </blockquote>
          {block.cite && (
            <figcaption className="label-mono mt-4">
              — <BrandCase text={block.cite} />
            </figcaption>
          )}
        </figure>
      );
    case "callout": {
      const tone = CALLOUT[block.tone];
      return (
        <aside className={cn("rounded-card border p-5 md:p-6", tone.classes)}>
          <p className="flex items-center gap-2 font-mono text-[0.72rem] font-medium uppercase tracking-[0.14em]">
            {tone.icon}
            {block.title ?? labels.callouts[block.tone]}
          </p>
          <p className="mt-3 text-dim">
            <InlineText text={block.text} />
          </p>
        </aside>
      );
    }
    case "code":
      return (
        <figure className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="label-mono">{block.language}</span>
            <CopyCodeButton
              code={block.code}
              label={labels.copyCode}
              copiedLabel={labels.copiedCode}
              ariaLabel={labels.copyCodeLabel}
            />
          </div>
          {/* Only sideways gestures bypass smooth scroll (to pan long lines);
              vertical wheel over the code keeps scrolling the page. */}
          <pre
            className="overflow-x-auto overscroll-x-contain p-5 font-mono text-[0.85rem] leading-relaxed text-dim"
            data-lenis-prevent-horizontal=""
          >
            <code>{block.code}</code>
          </pre>
          {block.caption && <figcaption className="border-t border-line px-4 py-3 text-sm text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "image":
      return (
        <figure className="my-10!">
          <Image
            src={block.image.src}
            alt={block.image.alt}
            width={block.image.width}
            height={block.image.height}
            sizes="(min-width: 1024px) 720px, 92vw"
            className="w-full rounded-card border border-line"
          />
          {block.caption && <figcaption className="mt-3 text-sm text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "divider":
      return <hr className="my-12! border-line" />;
  }
}

export function Blocks({ blocks, labels, className }: { blocks: Block[]; labels: BlockLabels; className?: string }) {
  return (
    <div className={cn("prose-gg", className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} labels={labels} />
      ))}
    </div>
  );
}
