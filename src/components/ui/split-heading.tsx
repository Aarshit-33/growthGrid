import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { headingText, parseHeading } from "./rich-text";

type Mode = "load" | "view";

interface SplitHeadingProps {
  text: string;
  /** HTML tags only (R3F's JSX augmentation breaks open `ElementType`). */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  id?: string;
  /**
   * "load" animates immediately with pure CSS (above the fold — no JS, no
   * LCP penalty). "view" animates when scrolled into view (RevealObserver).
   */
  mode?: Mode;
  /** Extra delay before the first word (ms). */
  delay?: number;
}

/**
 * Server-rendered word-split heading. Every word is wrapped in a mask so it
 * can slide up into place. The real text stays in the DOM (SEO), and the
 * heading carries an aria-label so screen readers read it naturally.
 */
export function SplitHeading({ text, as: Tag = "h2", className, id, mode = "view", delay }: SplitHeadingProps) {
  const lines = parseHeading(text);
  let index = 0;

  return (
    <Tag
      id={id}
      aria-label={headingText(text)}
      data-split={mode}
      data-reveal-root={mode === "view" ? "" : undefined}
      className={className}
      style={delay ? ({ "--split-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {lines.map((tokens, li) => (
        <span key={li} aria-hidden="true" className="block">
          {tokens.map((token, ti) => {
            const words = token.text.split(/(\s+)/).filter((w) => w.length > 0);
            return (
              <span key={ti}>
                {words.map((word, wi) =>
                  /^\s+$/.test(word) ? (
                    " "
                  ) : (
                    <span key={wi} className="split-word">
                      {/* Gradient text must live on the transformed element itself:
                          background-clip:text doesn't reach into inline-block children. */}
                      <span
                        className={cn(token.em && "em-serif")}
                        style={{ "--i": index++ } as CSSProperties}
                      >
                        {word}
                      </span>
                    </span>
                  ),
                )}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
