"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { pinStart, scrollToTarget } from "@/components/layout/smooth-scroll";
import { SectionHeading } from "@/components/ui/section-heading";
import { QUERIES, useMediaQuery, useReducedMotionSafe } from "@/hooks/use-media-query";
import type { Audience, SectionIntro } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Scroll distance per stage, and the pause on the last one before release (× viewport height). */
const PER_STEP = 0.7;
const HOLD = 0.45;

/**
 * Audience tabs (WAI-ARIA tabs, automatic activation, roving tabindex),
 * pinned like the Growth Grid process: when the block reaches the top of the
 * viewport it pins, and scrolling steps through the stages one at a time
 * (GSAP ScrollTrigger). After the last stage (and a short hold) the pin
 * releases. Choosing a tab (click or arrow keys) scrolls to its point in the
 * pin, so the selection and the scroll never disagree.
 * Desktop: the tabs run down the left of the card (a vertical tablist), so
 * the pinned view fits one screen; phones and tablets keep a row of tabs
 * above the card.
 * Every panel is server-rendered and they share one grid cell, so the block
 * keeps the height of the tallest (nothing jumps while stepping); inactive
 * panels are `invisible` (hidden from assistive tech and the tab order).
 * With reduced motion the pin still works but every change is instant.
 */
export function AudienceTabs({
  audiences,
  label,
  eyebrow,
  intro,
  index,
  headingId,
}: {
  audiences: Audience[];
  label: string;
  eyebrow?: string;
  /** Section intro: rendered here (as the h2) so the title stays visible while pinned. */
  intro?: SectionIntro;
  index?: string;
  headingId?: string;
}) {
  const uid = useId();
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const scope = useRef<HTMLDivElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const current = useRef(0);
  const reduce = useReducedMotionSafe();
  /** The tablist is vertical on desktop (left of the card), a row below that. */
  const vertical = useMediaQuery(QUERIES.desktop);
  const n = audiences.length;
  const fraction = (i: number) => (n > 1 ? i / (n - 1) : 1);
  /** Share of the pin spent stepping (the rest is the final hold). */
  const stepShare = n > 1 ? ((n - 1) * PER_STEP) / ((n - 1) * PER_STEP + HOLD) : 0;

  useGSAP(
    () => {
      const indexAt = (progress: number) => {
        const move = stepShare > 0 ? Math.min(1, progress / stepShare) : 0;
        return Math.min(n - 1, Math.round(move * (n - 1)));
      };
      const st = ScrollTrigger.create({
        trigger: scope.current,
        start: pinStart(scope.current),
        end: () => `+=${Math.round(window.innerHeight * (Math.max(1, n - 1) * PER_STEP + HOLD))}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const i = indexAt(self.progress);
          if (i === current.current) return;
          current.current = i;
          setActive(i);
          setTouched(true);
        },
      });
      stRef.current = st;
      current.current = indexAt(st.progress);
      setActive(current.current);
      return () => {
        st.kill();
        stRef.current = null;
      };
    },
    { scope, dependencies: [n] },
  );

  /** Select stage `i`: scroll to its point in the pin (or switch directly without one). */
  const select = (i: number, focus = false) => {
    const st = stRef.current;
    if (st) {
      scrollToTarget(st.start + (st.end - st.start) * stepShare * fraction(i) + 1);
    } else {
      current.current = i;
      setActive(i);
      setTouched(true);
    }
    if (focus) tabs.current[i]?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: (i + 1) % n,
      ArrowDown: (i + 1) % n,
      ArrowLeft: (i - 1 + n) % n,
      ArrowUp: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key], true);
  };

  return (
    <div
      ref={scope}
      className="relative flex min-h-[100svh] flex-col justify-center gap-4 pb-4 pt-[calc(var(--header-h)+0.75rem)] lg:gap-8 lg:pb-8 lg:pt-[calc(var(--header-h)+1.5rem)] [@media(min-width:64rem)_and_(max-height:820px)]:gap-5"
    >
      {intro ? (
        <SectionHeading
          intro={intro}
          index={index}
          id={headingId}
          ledeClassName="[@media(max-height:960px)]:sr-only"
        />
      ) : (
        eyebrow && (
          <p className="label-mono flex items-center gap-3 text-faint max-sm:[@media(max-height:700px)]:hidden">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            {eyebrow}
          </p>
        )
      )}

      {/* Desktop: the stages run down the left of the card; phones and tablets: a row above it. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6">
        <div
          role="tablist"
          aria-label={label}
          aria-orientation={vertical ? "vertical" : "horizontal"}
          className="grid grid-cols-3 gap-1 rounded-[1.4rem] border border-line bg-white/[0.015] p-1 sm:gap-1.5 sm:rounded-[1.6rem] sm:p-1.5 lg:col-span-4 lg:flex lg:flex-col xl:col-span-3"
        >
          {audiences.map((a, i) => {
            const selected = i === active;
            return (
              <button
                key={a.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`${uid}-tab-${a.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${uid}-panel-${a.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="group relative rounded-[1.1rem] px-3 py-3 text-left sm:rounded-[1.2rem] sm:px-6 sm:py-5 max-sm:[@media(max-height:700px)]:py-2 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:py-4 lg:pl-8"
              >
                {selected && (
                  <motion.span
                    layoutId={`${uid}-tab-bg`}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[inherit] border border-line-strong bg-[linear-gradient(135deg,rgb(60_228_154/0.1),transparent_60%),var(--color-surface-2)]"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }}
                  />
                )}
                {/* The selected stage's marker: a segment under the tab (beside it on desktop). Only
                    the selected tab is lit, so exactly one stage ever reads as active. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-3 bottom-1 h-0.5 rounded-full transition-colors duration-500 sm:inset-x-6 sm:bottom-2 lg:bottom-5 lg:left-3.5 lg:right-auto lg:top-5 lg:h-auto lg:w-0.5",
                    selected ? "bg-em/70" : "bg-transparent",
                  )}
                />
                <span className="relative flex flex-col-reverse gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span
                    className={cn(
                      "text-sm font-medium leading-tight transition-colors duration-300 sm:text-h4",
                      selected ? "text-ink" : "text-dim group-hover:text-ink",
                    )}
                  >
                    {a.tab.title}
                  </span>
                  <span className={cn("font-mono text-[0.68rem]", selected ? "text-em" : "text-faint")}>{pad(i + 1)}</span>
                </span>
                <span className="relative mt-1 hidden text-sm text-muted sm:block">{a.tab.subtitle}</span>
              </button>
            );
          })}
        </div>

        <div className="grid lg:col-span-8 xl:col-span-9">
          {audiences.map((a, i) => {
            const on = i === active;
            return (
              <div
                key={a.key}
                id={`${uid}-panel-${a.key}`}
                role="tabpanel"
                aria-labelledby={`${uid}-tab-${a.key}`}
                tabIndex={on ? 0 : -1}
                className={cn("rounded-panel [grid-area:1/1] focus-visible:outline-offset-4", !on && "invisible")}
              >
                <motion.div
                  initial={false}
                  animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
                  transition={{ duration: on && touched && !reduce ? 0.55 : 0, ease: [0.16, 1, 0.3, 1] }}
                  className="card grid h-full overflow-hidden lg:grid-cols-12"
                >
                  <div className="p-5 sm:p-8 lg:col-span-6 lg:p-10 max-sm:[@media(max-height:700px)]:p-4 [@media(min-width:64rem)_and_(max-height:860px)]:p-8">
                    <p className="eyebrow max-sm:[@media(max-height:700px)]:hidden">
                      <span aria-hidden="true" className="h-px w-8 bg-em/50" />
                      {a.label}
                    </p>
                    {/* Desktop: the card title size used by the work deck, sized for the half-card column. */}
                    <h3 className="text-h3 mt-3 text-ink sm:mt-6 sm:text-h2 max-sm:[@media(max-height:700px)]:mt-0 lg:mt-5 lg:text-[clamp(1.8rem,1rem+1.5vw,2.8rem)] lg:leading-[1.06]">
                      {a.title}
                    </h3>
                    <p className="mt-3 max-w-xl text-dim sm:mt-6 sm:text-lede max-sm:[@media(max-height:700px)]:line-clamp-3 lg:mt-5">
                      {a.copy}
                    </p>
                  </div>

                  <div className="relative border-t border-line p-5 sm:p-8 lg:col-span-6 lg:border-l lg:border-t-0 lg:p-10 max-sm:[@media(max-height:700px)]:p-4 [@media(min-width:64rem)_and_(max-height:860px)]:p-8">
                    <div aria-hidden="true" className="dot-matrix fade-radial absolute inset-0 opacity-50" />
                    {/* Phones and tablets: the steps sit in a row; desktop: a connected list. */}
                    <ol className="relative grid grid-cols-3 gap-3 lg:block">
                      {a.steps.map((step, s) => (
                        <li
                          key={step.label}
                          className="relative flex flex-col gap-2 lg:grid lg:grid-cols-[2.5rem_1fr] lg:gap-4 lg:pb-6 lg:last:pb-0 [@media(min-width:64rem)_and_(max-height:860px)]:pb-4"
                        >
                          {s < a.steps.length - 1 && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0 left-[1.2rem] top-10 hidden w-px bg-[linear-gradient(to_bottom,var(--color-em),rgb(60_228_154/0.15))] lg:block"
                            />
                          )}
                          <span className="relative grid size-8 place-items-center rounded-full border border-em/40 bg-bg font-mono text-[0.68rem] text-em sm:size-10 sm:text-xs">
                            {pad(s + 1)}
                          </span>
                          <div className="lg:pt-1">
                            {/* Short screens: the numbered discs already give the order. */}
                            <p className="label-mono [@media(max-height:760px)]:sr-only">{step.label}</p>
                            <p className="mt-1 text-sm font-medium leading-snug text-ink sm:text-h4 sm:mt-1.5 [@media(max-height:760px)]:mt-0">{step.text}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="relative mt-5 rounded-card border border-em/30 bg-[linear-gradient(135deg,rgb(60_228_154/0.12),rgb(60_228_154/0.02))] p-4 sm:mt-6 sm:p-6 lg:mt-7 lg:p-5 [@media(min-width:64rem)_and_(max-height:860px)]:mt-5 [@media(min-width:64rem)_and_(max-height:860px)]:p-4">
                      <p className="flex items-center gap-2 font-medium text-ink">
                        <span aria-hidden="true" className="text-em">
                          →
                        </span>
                        {a.outcome.title}
                      </p>
                      <p className="mt-2 text-[0.95rem] text-dim max-sm:[@media(max-height:760px)]:hidden">{a.outcome.detail}</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
