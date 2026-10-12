"use client";

import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { OutcomeValue } from "@/components/services/outcome-value";
import { journey } from "@/components/three/store";
import { ArrowSwap } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Service } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

const PREVIEW_W = 320;

/**
 * Where `line` falls among the rows' middles, in rows: 0 at the first row's
 * middle … n-1 at the last's, blended in between; -1…0 while the first row
 * is still coming up (within one row pitch of the line).
 */
function rowAtLine(mids: number[], pitch0: number, line: number) {
  const n = mids.length;
  if (line <= mids[0]) return Math.max(-1, (line - mids[0]) / Math.max(1, pitch0));
  for (let i = 0; i < n - 1; i++) {
    if (line < mids[i + 1]) return i + (line - mids[i]) / Math.max(1, mids[i + 1] - mids[i]);
  }
  return n - 1;
}

/**
 * Editorial services index. Each row is one crawlable link (stretched over
 * the row). On desktop, a preview card with the service's summary and lead
 * outcome glides after the cursor; on touch the summary is inline instead.
 */
export function ServicesIndex({ services, viewLabel }: { services: Service[]; viewLabel?: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  /** Left edge the preview may not cross: just past the hovered row's title. */
  const laneRef = useRef(0);
  const reduce = useReducedMotionSafe();
  const [active, setActive] = useState<number | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 320, damping: 32, mass: 0.6 };
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  // The hovered service lifts its layer in the journey's blueprint stack.
  useEffect(() => {
    journey.service = active ?? -1;
  }, [active]);
  useEffect(
    () => () => {
      journey.service = -1;
    },
    [],
  );

  // Scrolling walks the stack too: the row crossing mid-screen lifts its layer
  // (the scene lets a hovered row take over).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rows = list.children;
      if (rows.length === 0) return;
      const mids: number[] = [];
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        mids.push(r.top + r.height / 2);
      }
      const pitch0 = mids.length > 1 ? mids[1] - mids[0] : rows[0].getBoundingClientRect().height;
      journey.serviceScroll = rowAtLine(mids, pitch0, window.innerHeight / 2);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      journey.serviceScroll = -1;
    };
  }, []);

  function onRowEnter(e: PointerEvent<HTMLLIElement>, i: number) {
    if (e.pointerType !== "mouse") return;
    const list = listRef.current?.getBoundingClientRect();
    const title = e.currentTarget.querySelector("h3 a")?.getBoundingClientRect();
    // + room for the hover nudge on the title (translate-x-3) and breathing space.
    if (list && title) laneRef.current = title.right - list.left + 56;
    setActive(i);
  }

  function onPointerMove(e: PointerEvent<HTMLOListElement>) {
    if (e.pointerType !== "mouse" || !listRef.current) return;
    const r = listRef.current.getBoundingClientRect();
    // Follow the cursor, but stay between the title and the row's arrow button.
    const max = r.width - PREVIEW_W - 96;
    const px = Math.max(laneRef.current, Math.min(e.clientX - r.left + 40, max));
    const py = e.clientY - r.top;
    if (active === null || reduce) {
      // Appear in place rather than flying in from the last position.
      sx.jump(px);
      sy.jump(py);
    }
    x.set(px);
    y.set(py);
  }

  const current = active !== null ? services[active] : null;

  return (
    <div className="relative">
      <ol
        ref={listRef}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        className="border-t border-line"
      >
        {services.map((service, i) => (
          <li
            key={service.slug}
            onPointerEnter={(e) => onRowEnter(e, i)}
            data-reveal=""
            style={{ "--reveal-delay": `${i * 60}ms`, "--accent": service.accent } as CSSProperties}
            className="border-b border-line"
          >
            <article
              className={cn(
                "group/card relative grid grid-cols-[2.25rem_1fr_auto] items-start gap-x-4 py-7 transition-opacity duration-500 sm:grid-cols-[3.5rem_1fr_auto] sm:py-9 lg:items-center lg:py-10",
                active !== null && active !== i && "lg:opacity-40",
              )}
            >
              <span className="pt-2 font-mono text-xs text-faint transition-colors duration-500 group-hover/card:text-[var(--accent)] lg:pt-0">
                {pad(i + 1)}
              </span>
              <div className="min-w-0">
                {/* The nudge lives on an inner span: a transformed h3 would become the containing
                    block of the link's stretched ::after and shrink it to the title on hover. */}
                <h3 className="font-display text-[clamp(1.65rem,1.1rem+2.6vw,3.75rem)] font-medium leading-[1] tracking-[-0.045em] text-ink">
                  <Link
                    href={`/services/${service.slug}`}
                    data-cursor={viewLabel}
                    className="after:absolute after:inset-0 after:z-10 after:content-['']"
                  >
                    <span className="inline-block transition-transform duration-700 ease-out-expo lg:group-hover/card:translate-x-3">
                      {service.title}
                    </span>
                  </Link>
                </h3>
                <p className="mt-3 font-mono text-[0.72rem] tracking-[0.04em] text-muted transition-transform duration-700 ease-out-expo lg:group-hover/card:translate-x-3">
                  {service.tagline}
                </p>
                <p className="mt-4 max-w-xl text-[0.95rem] text-dim lg:hidden">{service.summary}</p>
              </div>
              <span
                aria-hidden="true"
                className="mt-1 grid size-11 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-[var(--accent)] group-hover/card:bg-[var(--accent)] group-hover/card:text-bg lg:mt-0 lg:size-14"
              >
                <ArrowSwap trigger="card" />
              </span>
            </article>
          </li>
        ))}
      </ol>

      {/* Cursor-follow preview (desktop, decorative: the same copy is on the service page). */}
      <motion.div
        aria-hidden="true"
        style={{ x: sx, y: sy, width: PREVIEW_W }}
        className="pointer-events-none absolute left-0 top-0 z-20 hidden lg:block"
      >
        <AnimatePresence>
          {current && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.85, rotate: -4 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.85, rotate: 3 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="-translate-y-1/2"
            >
              <div
                className="card overflow-hidden p-6 shadow-panel"
                style={{ "--accent": current.accent } as CSSProperties}
              >
                <div
                  className="absolute -right-16 -top-16 size-48 rounded-full opacity-70 blur-3xl"
                  style={{ background: `radial-gradient(circle, ${current.accent}55, transparent 70%)` }}
                />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={current.slug}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative"
                  >
                    <span className="grid size-11 place-items-center rounded-xl border border-line bg-white/[0.03] text-[var(--accent)]">
                      <Icon name={current.icon} className="size-5" aria-hidden="true" />
                    </span>
                    <p className="mt-5 text-[0.95rem] leading-relaxed text-dim">{current.summary}</p>
                    {current.outcomes[0] && (
                      <p className="mt-5 flex items-baseline gap-3 border-t border-line pt-4">
                        <span className="shrink-0 font-display text-3xl font-medium tracking-[-0.04em] text-ink">
                          <OutcomeValue value={current.outcomes[0].value} count={false} />
                        </span>
                        <span className="text-xs leading-snug text-muted">{current.outcomes[0].label}</span>
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
