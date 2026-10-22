import type { CSSProperties, ReactNode } from "react";

type RevealVariant = "up" | "fade" | "scale";

/** HTML tags only: R3F augments JSX.IntrinsicElements with three.js
 *  elements, so an open `ElementType` would collapse props to `never`. */
type RevealTag = "div" | "section" | "article" | "li" | "ul" | "ol" | "p" | "span" | "header" | "footer" | "figure" | "aside";

/**
 * Scroll reveal, rendered on the server. In browsers the motion gate opted
 * in (<html data-motion>, see layout/intro-gate.ts) elements start hidden via
 * CSS and <RevealObserver/> adds `data-inview` when they enter the viewport.
 * Crawlers, reduced motion and no-JS all show content immediately.
 */
export function Reveal({
  as: Tag = "div",
  variant = "up",
  delay = 0,
  className,
  style,
  children,
  id,
}: {
  as?: RevealTag;
  variant?: RevealVariant;
  /** Delay in ms (use for staggering lists). */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Tag
      id={id}
      data-reveal={variant === "up" ? "" : variant}
      className={className}
      style={delay ? ({ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties) : style}
    >
      {children}
    </Tag>
  );
}
