"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { pinStart, scrollToTarget } from "@/components/layout/smooth-scroll";
import { SceneSlot } from "@/components/three/slot";
import { principlesStore, useStore } from "@/components/three/store";
import type { InstrumentShape, PrinciplesSceneData } from "@/components/three/types";
import { InstrumentGlyph } from "@/components/ui/instrument-glyph";
import { SectionHeading } from "@/components/ui/section-heading";
import { useReducedMotionSafe } from "@/hooks/use-media-query";
import type { Principle, SectionIntro } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Scroll distance per principle, and the pause on the last one before release (× viewport height). */
const PER_STEP = 0.7;
const HOLD = 0.45;

/* Line-art stand-in for the instrument (no-WebGL and while loading). */
function InstrumentFallback({ shape }: { shape: InstrumentShape }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <InstrumentGlyph shape={shape} className="w-[62%] drop-shadow-[0_0_14px_rgb(60_228_154/0.45)]" />
    </div>
  );
}

/**
 * Principles, pinned like the Growth Grid process: when the block reaches the
 * top of the viewport it pins, and scrolling steps through the principles one
 * at a time (GSAP ScrollTrigger) while the particle instrument morphs to
 * match. After the last principle (and a short hold) the pin releases and the
 * page scrolls on normally. Selecting a principle (list, stepper or a tap on
 * the instrument) scrolls to its position in the pin.
 * Desktop shows the full disclosure list; phones show a compact stepper and
 * the active principle only, so the pinned view always fits one screen. The
 * instrument is decorative; collapsed panels stay in the DOM (inert).
 * With reduced motion the pin still works but every change is instant.
 */
export function PrinciplesExplorer({
  principles,
  label,
  intro,
  index,
  headingId,
}: {
  principles: Principle[];
  label?: string;
  /** Section intro: rendered here (as the h2) so the title stays visible while pinned. */
  intro?: SectionIntro;
  index?: string;
  headingId?: string;
}) {
  const n = principles.length;
  const active = useStore(principlesStore, (s) => s.active);
  const uid = useId();
  const reduce = useReducedMotionSafe();
  const scope = useRef<HTMLDivElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const current = principles[active] ?? principles[0];
  const data: PrinciplesSceneData = { shapes: principles.map((p) => p.instrument.shape) };
  const fraction = (i: number) => (n > 1 ? i / (n - 1) : 1);
  /** Share of the pin spent stepping (the rest is the final hold). */
  const stepShare = n > 1 ? ((n - 1) * PER_STEP) / ((n - 1) * PER_STEP + HOLD) : 0;
  const indexAt = (progress: number) => {
    const move = stepShare > 0 ? Math.min(1, progress / stepShare) : 0;
    return Math.min(n - 1, Math.round(move * (n - 1)));
  };

  // Start from the first principle on every visit.
  useEffect(() => () => principlesStore.set({ active: 0 }), []);

  useGSAP(
    () => {
      const st = ScrollTrigger.create({
        trigger: scope.current,
        start: pinStart(scope.current),
        end: () => `+=${Math.round(window.innerHeight * (Math.max(1, n - 1) * PER_STEP + HOLD))}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => principlesStore.set({ active: indexAt(self.progress) }),
      });
      stRef.current = st;
      principlesStore.set({ active: indexAt(st.progress) });
      return () => {
        st.kill();
        stRef.current = null;
      };
    },
    { scope, dependencies: [n] },
  );

  /** Scroll to principle `i`'s point in the pin (or just select it without one). */
  const go = (i: number) => {
    const st = stRef.current;
    if (st) scrollToTarget(st.start + (st.end - st.start) * stepShare * fraction(i) + 1);
    else principlesStore.set({ active: i });
  };

  // A tap on the instrument cycles the principle directly; while pinned, move
  // the scroll to match so the pin and the selection never disagree.
  useEffect(() => {
    const st = stRef.current;
    if (st?.isActive && indexAt(st.progress) !== active) {
      scrollToTarget(st.start + (st.end - st.start) * stepShare * fraction(active) + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      ref={scope}
      className="relative flex min-h-[100svh] flex-col justify-center gap-4 pb-4 pt-[calc(var(--header-h)+0.75rem)] lg:gap-8 lg:pb-8 lg:pt-[calc(var(--header-h)+1.5rem)] [@media(min-width:64rem)_and_(max-height:820px)]:gap-5"
    >
      {/* The section title stays on screen while the block is pinned. On desktop the
          lede gives its room to the instrument until the screen is really tall. */}
      {intro ? (
        <SectionHeading
          intro={intro}
          index={index}
          id={headingId}
          ledeClassName="[@media(max-height:960px)]:sr-only [@media(min-width:64rem)_and_(max-height:1100px)]:sr-only"
        />
      ) : (
        label && (
          <p className="label-mono flex items-center gap-3 text-faint">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            {label}
          </p>
        )
      )}

      {/* Narrow desktops (below xl): an even split, so the list titles keep to one line. */}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-center lg:gap-8 xl:gap-14">
        <div className="lg:col-span-6 lg:col-start-7 lg:row-start-1 xl:col-span-7 xl:col-start-6">
          <div
            className={cn(
              "relative mx-auto w-full overflow-hidden rounded-panel border border-line bg-[radial-gradient(circle_at_50%_48%,rgb(60_228_154/0.07),transparent_62%)]",
              // Phones: a short band so the copy fits under it; desktop: a square sized to
              // the viewport (minus the header and the section heading above it). It stays
              // inside its own grid column, clear of the list.
              "h-[min(28svh,20rem)] lg:aspect-square lg:h-auto lg:max-w-[min(46rem,calc(100svh-var(--header-h)-19.5rem))] [@media(min-width:64rem)_and_(min-height:1101px)]:max-w-[min(46rem,calc(100svh-var(--header-h)-25.5rem))]",
            )}
          >
            <SceneSlot scene={{ id: "principles", data }} fallback={<InstrumentFallback shape={current.instrument.shape} />} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-4 label-mono sm:inset-x-6 sm:top-6">
                <span className="tabular-nums">
                  [{pad(active + 1)}/{pad(n)}]
                </span>
                <span className="truncate text-em">{current.instrument.name}</span>
              </div>
              <div className="absolute inset-x-5 bottom-5 hidden items-center justify-between label-mono sm:inset-x-6 sm:bottom-6 lg:flex">
                <span className="text-ink">{current.label}</span>
                <span className="flex gap-1.5">
                  {principles.map((p, i) => (
                    <span
                      key={p.key}
                      className={cn("h-1 w-5 rounded-full transition-colors duration-500", i === active ? "bg-em" : "bg-line-strong")}
                    />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Phones and tablets: stepper + the active principle. */}
        <div className="lg:hidden">
          <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {principles.map((p, i) => {
              const isCurrent = i === active;
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${pad(i + 1)} ${p.label}`}
                    className="group flex w-full flex-col gap-2 py-1.5 text-left"
                  >
                    {/* Only the current principle is lit (never the ones before it). */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1 w-full rounded-full transition-colors duration-500",
                        isCurrent ? "bg-em" : "bg-line-strong group-hover:bg-em/50",
                      )}
                    />
                    <span className={cn("label-mono tabular-nums", isCurrent ? "text-em" : "text-faint")}>
                      {pad(i + 1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="relative isolate mt-4 min-h-[11rem] border-t border-line pt-5" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.key}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, y: -10 }}
                transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="label-mono text-em">{current.label}</p>
                <p className="text-h3 mt-2 text-ink">{current.title}</p>
                <p className="mt-3 text-dim">{current.summary}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop: the full disclosure list. */}
        <ol className="hidden border-t border-line lg:col-span-6 lg:row-start-1 lg:block xl:col-span-5">
          {principles.map((p, i) => {
            const open = i === active;
            const triggerId = `${uid}-${p.key}-trigger`;
            const panelId = `${uid}-${p.key}-panel`;
            return (
              <li key={p.key} className="relative border-b border-line">
                {open && (
                  <motion.span
                    layoutId={`${uid}-indicator`}
                    aria-hidden="true"
                    className="absolute -top-px left-0 h-px w-full bg-[linear-gradient(90deg,var(--color-em),var(--color-hot)_60%,transparent)]"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 36 }}
                  />
                )}
                <h3>
                  <button
                    id={triggerId}
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => go(i)}
                    className="group flex w-full items-start gap-5 py-2.5 text-left [@media(min-height:701px)]:py-3 [@media(min-height:821px)]:py-4 [@media(min-height:901px)]:py-6"
                  >
                    <span
                      className={cn(
                        "label-mono pt-1 tabular-nums transition-colors duration-500",
                        open ? "text-em" : "text-faint",
                      )}
                    >
                      {pad(i + 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* Very short screens: the box already shows the active label. */}
                      <span className="label-mono block [@media(max-height:760px)]:sr-only">{p.label}</span>
                      <span
                        className={cn(
                          "text-h3 mt-2 block transition-colors duration-500 [@media(max-height:760px)]:mt-0",
                          open ? "text-ink" : "text-dim group-hover:text-ink",
                        )}
                      >
                        {p.title}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-500",
                        open ? "border-em" : "border-line-strong group-hover:border-em/60",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full bg-em transition-transform duration-500 ease-out-expo",
                          open ? "scale-100" : "scale-0",
                        )}
                      />
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  inert={!open}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-700 ease-out-expo",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pb-4 pl-10 pr-4 sm:pl-11 [@media(min-height:821px)]:pb-5 [@media(min-height:901px)]:pb-7">
                      <p className="text-dim">{p.summary}</p>
                      {/* Short screens: the instrument's name is already on the box. */}
                      <p className="mt-4 flex items-center gap-2 label-mono [@media(max-height:820px)]:sr-only">
                        <span aria-hidden="true" className="size-1.5 rotate-45 bg-em" />
                        <span className="text-em">{p.instrument.name}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
