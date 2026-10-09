"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { workCity } from "@/components/three/store";
import { cn, interpolate, pad } from "@/lib/utils";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

export type WorkFilterChip = { slug: string; label: string; count: number };
export type WorkIndexItem = { slug: string; services: string[]; card: ReactNode };
type Labels = { label: string; all: string; empty: string; count: string };

const PARAM = "service";
const CHANGE = "work:filter";
const EASE = [0.16, 1, 0.3, 1] as const;

/* The `?service=` query param is the single source of truth: shareable,
   survives reloads, and needs no Suspense boundary (no useSearchParams). */
function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}
const readParam = () => new URLSearchParams(window.location.search).get(PARAM);
const serverParam = () => null;

/** Tell the hero's grid city which case study is in focus (-1: none). */
function setTower(index: number) {
  workCity.hover = index;
}

/**
 * Filterable case-study index. Every card is server-rendered (all links are
 * crawlable without JS); filtering only changes which ones stay mounted, with
 * FLIP re-flow and exit animations. On lg the right column is offset down for
 * an editorial rhythm.
 */
export function WorkIndex({
  chips,
  items,
  labels,
}: {
  chips: WorkFilterChip[];
  items: WorkIndexItem[];
  labels: Labels;
}) {
  const param = useSyncExternalStore(subscribe, readParam, serverParam);
  const active = chips.some((chip) => chip.slug === param) ? param : null;
  const reduce = useReducedMotionSafe();
  const railRef = useRef<HTMLDivElement>(null);
  const visible = active ? items.filter((item) => item.services.includes(active)) : items;
  const options = [{ slug: null, label: labels.all, count: items.length }, ...chips];

  // Phones: the chip rail scrolls sideways, so keep the pressed chip centred
  // (covers deep links whose chip would otherwise start off-screen).
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!rail || !chip || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active, reduce]);

  // The hero's grid city: one tower per case study, in list order.
  const serviceKey = items.map((item) => item.services.join(",")).join("|");
  useEffect(() => {
    workCity.match = items.map((item) => !active || item.services.includes(active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, serviceKey]);
  useEffect(
    () => () => {
      workCity.match = [];
      workCity.hover = -1;
    },
    [],
  );
  const focusTower = (slug: string | null) => setTower(slug ? items.findIndex((item) => item.slug === slug) : -1);

  function select(slug: string | null) {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set(PARAM, slug);
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(CHANGE));
  }

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div
          ref={railRef}
          role="group"
          aria-label={labels.label}
          className="no-scrollbar relative -mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        >
          {options.map((option) => {
            const pressed = option.slug === active;
            return (
              <button
                key={option.slug ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => select(option.slug)}
                className={cn(
                  "group relative min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors duration-300",
                  pressed ? "border-transparent" : "border-line hover:border-line-strong",
                )}
              >
                {pressed && (
                  <motion.span
                    layoutId="work-filter-pill"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-em shadow-glow"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
                  />
                )}
                <span
                  className={cn(
                    "relative flex items-center gap-2.5 whitespace-nowrap transition-colors duration-300",
                    pressed ? "font-medium text-bg" : "text-dim group-hover:text-ink",
                  )}
                >
                  {option.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "font-mono text-[0.65rem] tabular-nums",
                      pressed ? "text-bg/60" : "text-faint",
                    )}
                  >
                    {pad(option.count)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p aria-live="polite" className="label-mono shrink-0 tabular-nums">
          {interpolate(labels.count, { count: visible.length, total: items.length })}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="mt-12 rounded-card border border-dashed border-line-strong p-10 text-center text-dim md:mt-16">
          {labels.empty}
        </p>
      ) : (
        <div
          className={cn(
            "relative mt-12 grid gap-y-16 md:mt-16 md:grid-cols-2 md:gap-x-8 md:gap-y-20 lg:gap-x-16 lg:gap-y-28",
            visible.length % 2 === 0 && "lg:pb-32",
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((item, i) => (
              <motion.div
                key={item.slug}
                layout={reduce ? false : "position"}
                exit={reduce ? undefined : { opacity: 0, scale: 0.96, transition: { duration: 0.3, ease: EASE } }}
                transition={{ layout: { duration: 0.75, ease: EASE } }}
                className="min-w-0"
                onPointerEnter={(e) => e.pointerType === "mouse" && focusTower(item.slug)}
                onPointerLeave={() => focusTower(null)}
                onFocus={() => focusTower(item.slug)}
                onBlur={() => focusTower(null)}
              >
                <div
                  className={cn(
                    "transition-[translate] duration-700 ease-out-expo",
                    i % 2 === 1 && "lg:translate-y-32",
                  )}
                >
                  <div data-reveal="" style={{ "--reveal-delay": `${(i % 2) * 90}ms` } as CSSProperties}>
                    <p aria-hidden="true" className="label-mono mb-5 flex items-center gap-3">
                      <span className="text-em">{pad(i + 1)}</span>
                      <span className="h-px w-8 bg-line-strong" />
                    </p>
                    {item.card}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
