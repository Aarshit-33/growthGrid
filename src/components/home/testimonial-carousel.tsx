"use client";

import { motion, type PanInfo } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { QUERIES, useReducedMotionSafe } from "@/hooks/use-media-query";
import type { HomePage, Testimonial } from "@/lib/schemas";
import { byline, cn, initials, pad } from "@/lib/utils";

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 60;

const fill = (template: string, index: number, total: number) =>
  template.replace("{index}", String(index)).replace("{total}", String(total));

const controlClass =
  "grid size-11 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-300 hover:border-em/60 hover:bg-em/[0.08] disabled:opacity-40";

/**
 * Testimonials carousel (WAI-ARIA carousel pattern). Autoplays every 7s
 * with a visible progress bar, pauses on hover/focus or with the pause
 * button, supports swipe, and never autoplays under reduced motion. All
 * slides share one grid cell, so the height never jumps.
 */
export function TestimonialCarousel({
  testimonials,
  labels,
}: {
  testimonials: Testimonial[];
  labels: HomePage["testimonials"];
}) {
  const uid = useId();
  // Hydration-safe: the controls and aria-live below depend on it.
  const reduce = useReducedMotionSafe();
  const total = testimonials.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);
  const autoplay = !reduce && total > 1;
  const running = autoplay && playing && !hold;

  const go = (next: number) => setIndex(((next % total) + total) % total);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX) go(index + 1);
    else if (info.offset.x > SWIPE_PX) go(index - 1);
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-labelledby="testimonials-heading"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      className="relative"
    >
      <motion.div
        id={`${uid}-slides`}
        drag={total > 1 ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
        aria-live={running ? "off" : "polite"}
        className="grid cursor-grab touch-pan-y active:cursor-grabbing"
      >
        {testimonials.map((t, i) => {
          const current = i === index;
          return (
            <figure
              key={t.id}
              role="group"
              aria-roledescription="slide"
              aria-label={fill(labels.slideLabel, i + 1, total)}
              inert={!current}
              className={cn(
                "[grid-area:1/1] transition-[opacity,translate,filter] duration-700 ease-out-expo",
                current ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0 blur-[3px]",
              )}
            >
              <blockquote className="max-w-5xl">
                <p className="font-display text-[clamp(1.45rem,1rem+2vw,2.9rem)] font-medium leading-[1.15] tracking-[-0.03em] text-ink">
                  <span aria-hidden="true" className="em-serif mr-1 text-[1.3em] leading-none">
                    “
                  </span>
                  {t.quote}
                  <span aria-hidden="true" className="em-serif text-[1.3em] leading-none">
                    ”
                  </span>
                </p>
              </blockquote>
              <figcaption className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                <span className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-12 place-items-center rounded-full border border-em/35 bg-em/[0.08] font-display text-sm font-medium text-em"
                  >
                    {initials(t.author)}
                  </span>
                  <span>
                    <span className="block font-medium text-ink">{t.author}</span>
                    <span className="block text-sm text-muted">{byline(t)}</span>
                  </span>
                </span>
                {t.project && (
                  <ButtonLink href={`/work/${t.project}`} variant="secondary">
                    {labels.projectLabel}
                  </ButtonLink>
                )}
              </figcaption>
            </figure>
          );
        })}
      </motion.div>

      {total > 1 && (
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-5 border-t border-line pt-6">
          <div className="flex items-center gap-2">
            <button type="button" className={controlClass} aria-label={labels.prevLabel} onClick={() => go(index - 1)}>
              <ArrowLeft aria-hidden="true" className="size-4" />
            </button>
            <button type="button" className={controlClass} aria-label={labels.nextLabel} onClick={() => go(index + 1)}>
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            {autoplay && (
              <button
                type="button"
                className={controlClass}
                aria-label={playing ? labels.pauseLabel : labels.playLabel}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
              </button>
            )}
          </div>

          <ol className="flex flex-1 items-center gap-2">
            {testimonials.map((t, i) => (
              <li key={t.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={fill(labels.slideLabel, i + 1, total)}
                  aria-current={i === index ? "true" : undefined}
                  aria-controls={`${uid}-slides`}
                  className="group block w-full py-3"
                >
                  {/* Only the current slide's bar fills (never the ones before it). */}
                  <span className="relative block h-0.5 overflow-hidden rounded-full bg-line-strong transition-colors duration-300 group-hover:bg-em/40">
                    {i === index &&
                      (autoplay ? (
                        <span
                          key={index}
                          onAnimationEnd={() => {
                            // Live check: never auto-advance under reduced motion, even
                            // if the bar rendered before the preference was known.
                            if (!window.matchMedia(QUERIES.reducedMotion).matches) go(index + 1);
                          }}
                          className="absolute inset-0 origin-left animate-grow-x bg-em"
                          style={
                            {
                              "--grow-duration": `${AUTOPLAY_MS}ms`,
                              animationPlayState: running ? "running" : "paused",
                            } as CSSProperties
                          }
                        />
                      ) : (
                        <span className="absolute inset-0 bg-em" />
                      ))}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <p aria-hidden="true" className="label-mono tabular-nums">
            {pad(index + 1)} / {pad(total)}
          </p>
        </div>
      )}
    </div>
  );
}
