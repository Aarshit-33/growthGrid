import type { ReactNode } from "react";
import type { SectionIntro } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { BrandCase } from "./brand-case";
import { SplitHeading } from "./split-heading";

/**
 * Standard section intro: eyebrow (with optional index), split heading
 * and lede. Optional `children` render as an aside (e.g. a CTA) that sits
 * to the right on desktop.
 */
export function SectionHeading({
  intro,
  index,
  as = "h2",
  mode = "view",
  align = "left",
  id,
  className,
  headingClassName,
  ledeClassName,
  children,
}: {
  intro: SectionIntro;
  /** Coordinate-style label, e.g. "02" → [02]. */
  index?: string;
  as?: "h1" | "h2";
  mode?: "load" | "view";
  align?: "left" | "center";
  /** id for the heading (use with aria-labelledby on the section). */
  id?: string;
  className?: string;
  headingClassName?: string;
  ledeClassName?: string;
  children?: ReactNode;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-8",
        centered ? "items-center text-center" : "lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      {/* Phones: copy spans the full width over the 3D backdrop, so a soft
          scrim keeps every intro equally legible. */}
      <div
        className={cn(
          "relative isolate max-w-4xl",
          "max-lg:before:pointer-events-none max-lg:before:absolute max-lg:before:-inset-x-4 max-lg:before:-inset-y-6 max-lg:before:-z-10 max-lg:before:bg-[radial-gradient(ellipse_at_40%_50%,rgb(4_7_10/0.82),rgb(4_7_10/0.6)_55%,transparent_80%)]",
          centered && "flex flex-col items-center",
        )}
      >
        <p className="eyebrow" data-reveal="fade">
          {index && <span className="text-faint">[{index}]</span>}
          <span aria-hidden="true" className="h-px w-8 bg-em/50" />
          <BrandCase text={intro.eyebrow} />
        </p>
        <SplitHeading
          as={as}
          id={id}
          text={intro.heading}
          mode={mode}
          className={cn(as === "h1" ? "text-h1" : "text-h2", "mt-6", headingClassName)}
        />
        {intro.lede && (
          <p
            className={cn("text-lede mt-6 max-w-2xl", centered && "mx-auto", ledeClassName)}
            data-reveal=""
            style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
          >
            {intro.lede}
          </p>
        )}
      </div>
      {children && (
        <div data-reveal="" className="shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
