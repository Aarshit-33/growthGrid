import type { CSSProperties, ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { BrandCase } from "@/components/ui/brand-case";
import { SplitHeading } from "@/components/ui/split-heading";
import { SPEAKABLE } from "@/lib/seo/speakable";
import { cn } from "@/lib/utils";

/**
 * Hero for inner pages. Everything above the fold animates with pure CSS
 * on load (no JS, no LCP penalty). The h1 is the page's only h1. The h1 and
 * lede carry the speakable ids (lib/seo/speakable.ts) voice assistants read.
 */
export function PageHero({
  eyebrow,
  headline,
  lede,
  breadcrumbs,
  children,
  aside,
  className,
}: {
  eyebrow: string;
  /** Supports *emphasis* and line breaks. */
  headline: string;
  lede?: string;
  breadcrumbs: Crumb[];
  /** Extra content under the lede (meta rows, CTAs, filters…). */
  children?: ReactNode;
  /** Optional right-hand column on desktop. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden pb-16 pt-[calc(var(--header-h)+2.5rem)] md:pb-24 md:pt-[calc(var(--header-h)+4rem)]", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="blueprint fade-radial absolute inset-0 opacity-70 [--grid-size:4rem]" />
        <div className="absolute -top-56 left-1/2 h-[34rem] w-[60rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-em/[0.09] blur-3xl" />
        <span className="crosshair left-[var(--gutter)] top-[calc(var(--header-h)+1rem)] hidden md:block" />
        <span className="crosshair right-[var(--gutter)] top-[calc(var(--header-h)+1rem)] hidden md:block" />
      </div>

      <div className="container-x relative">
        <Breadcrumbs items={breadcrumbs} />
        <div className={cn("mt-10 md:mt-14", aside && "grid gap-12 lg:grid-cols-12 lg:items-end")}>
          <div className={cn(aside && "lg:col-span-8")}>
            <p className="eyebrow load-fade" style={{ "--delay": "60ms" } as CSSProperties}>
              <span aria-hidden="true" className="h-px w-8 bg-em/50" />
              <BrandCase text={eyebrow} />
            </p>
            <SplitHeading
              as="h1"
              id={SPEAKABLE.title}
              mode="load"
              text={headline}
              className="text-h1 mt-6 max-w-5xl"
              delay={140}
            />
            {lede && (
              <p id={SPEAKABLE.summary} className="text-lede load-fade mt-8 max-w-2xl" style={{ "--delay": "420ms" } as CSSProperties}>
                {lede}
              </p>
            )}
            {children && (
              <div className="load-fade mt-10" style={{ "--delay": "560ms" } as CSSProperties}>
                {children}
              </div>
            )}
          </div>
          {aside && (
            <div className="load-fade lg:col-span-4" style={{ "--delay": "520ms" } as CSSProperties}>
              {aside}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
