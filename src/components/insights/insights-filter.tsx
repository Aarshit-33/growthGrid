"use client";

import { LayoutGroup, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn, interpolate } from "@/lib/utils";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

/* ─────────────────────────────────────────────────────────────
   Topic filter for the insights index. Every article is rendered
   on the server and stays in the HTML (crawlable, works without
   JS); filtering only toggles `hidden`. Cards leave, the rest glide
   into place (FLIP via the Web Animations API) and newcomers rise
   in. Reduced motion swaps instantly. The choice is mirrored to
   `?topic=` so a filtered view can be shared.
   ───────────────────────────────────────────────────────────── */

const ALL = "all";
const PARAM = "topic";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";

const matches = (topic: string, filter: string) => filter === ALL || topic === filter;

function measure(list: HTMLElement) {
  const rects = new Map<string, DOMRect>();
  list.querySelectorAll<HTMLElement>(":scope > li").forEach((el) => {
    if (!el.hidden && el.dataset.key) rects.set(el.dataset.key, el.getBoundingClientRect());
  });
  return rects;
}

interface FilterState {
  /** Pressed chip — updates immediately. */
  active: string;
  /** Filter applied to the grid — trails `active` while cards exit. */
  shown: string;
  select: (topic: string) => void;
  listRef: RefObject<HTMLUListElement | null>;
  /** Card positions captured just before the grid re-flows. */
  beforeRef: RefObject<Map<string, DOMRect> | null>;
  exitsRef: RefObject<Animation[]>;
}

const FilterContext = createContext<FilterState | null>(null);

function useFilter() {
  const state = useContext(FilterContext);
  if (!state) throw new Error("TopicFilter and FilteredInsights must be rendered inside <InsightsFilter>.");
  return state;
}

/** Shares filter state between the chips (in the hero) and the grid below. */
export function InsightsFilter({ topics, children }: { topics: string[]; children: ReactNode }) {
  const [active, setActive] = useState(ALL);
  const [shown, setShown] = useState(ALL);
  const reduce = useReducedMotionSafe();
  const listRef = useRef<HTMLUListElement>(null);
  const beforeRef = useRef<Map<string, DOMRect> | null>(null);
  const exitsRef = useRef<Animation[]>([]);
  const runRef = useRef(0);
  const known = topics.join("|");

  // Restore a shared or bookmarked view (?topic=growth) after hydration.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(PARAM);
    if (!wanted || !known.split("|").includes(wanted)) return;
    const frame = requestAnimationFrame(() => {
      setActive(wanted);
      setShown(wanted);
    });
    return () => cancelAnimationFrame(frame);
  }, [known]);

  const select = useCallback(
    (topic: string) => {
      if (topic === active) return;
      setActive(topic);

      const url = new URL(window.location.href);
      if (topic === ALL) url.searchParams.delete(PARAM);
      else url.searchParams.set(PARAM, topic);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

      exitsRef.current.forEach((animation) => animation.cancel());
      exitsRef.current = [];
      const id = ++runRef.current;
      const list = listRef.current;
      if (!list || reduce) {
        setShown(topic);
        return;
      }

      const commit = () => {
        if (id !== runRef.current) return; // superseded by a newer click
        beforeRef.current = measure(list);
        setShown(topic);
      };
      const leaving = Array.from(list.querySelectorAll<HTMLElement>(":scope > li")).filter(
        (el) => !el.hidden && !matches(el.dataset.topic ?? "", topic),
      );
      if (leaving.length === 0) {
        commit();
        return;
      }
      exitsRef.current = leaving.map((el) =>
        el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], {
          duration: 240,
          easing: EASE_IN,
          fill: "forwards",
        }),
      );
      // Cancelled exits reject `finished`; the newer click owns the grid then.
      Promise.all(exitsRef.current.map((animation) => animation.finished)).then(commit, () => {});
    },
    [active, reduce],
  );

  const value = useMemo(
    () => ({ active, shown, select, listRef, beforeRef, exitsRef }),
    [active, shown, select],
  );
  return <FilterContext value={value}>{children}</FilterContext>;
}

/** Toggle chips with a sliding emerald pill, plus a live result count. */
export function TopicFilter({
  label,
  topics,
  counts,
  results,
  locale,
  className,
}: {
  label: string;
  /** Chips in display order, "all" first. */
  topics: { key: string; label: string }[];
  counts: Record<string, number>;
  /** Plural templates with a {count} placeholder. */
  results: { one: string; other: string };
  locale: string;
  className?: string;
}) {
  const { active, select } = useFilter();
  const reduce = useReducedMotionSafe();
  const plural = useMemo(() => new Intl.PluralRules(locale), [locale]);
  const count = counts[active] ?? 0;
  const summary = interpolate(plural.select(count) === "one" ? results.one : results.other, { count });

  return (
    <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between", className)}>
      <LayoutGroup id="insight-topics">
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const pressed = topic.key === active;
            return (
              <button
                key={topic.key}
                type="button"
                aria-pressed={pressed}
                onClick={() => select(topic.key)}
                className={cn(
                  "relative isolate inline-flex h-10 items-center gap-2.5 rounded-full border px-4 text-sm font-medium transition-colors duration-300",
                  pressed ? "border-transparent text-bg" : "border-line-strong text-dim hover:border-em/50 hover:text-ink",
                )}
              >
                {pressed && (
                  <motion.span
                    layoutId="insight-topic-pill"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-em shadow-[0_0_28px_-6px_rgb(60_228_154/0.75)]"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.55 }}
                  />
                )}
                {topic.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "font-mono text-[0.66rem] tabular-nums transition-colors duration-300",
                    pressed ? "text-bg/60" : "text-faint",
                  )}
                >
                  {counts[topic.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
      <p aria-live="polite" aria-atomic="true" className="label-mono tabular-nums">
        {/* Re-keyed so the count is announced even when the number repeats. */}
        <span key={active}>{summary}</span>
      </p>
    </div>
  );
}

/** Server-rendered cards; the filter only toggles visibility. */
export function FilteredInsights({
  items,
  className,
}: {
  items: { key: string; topic: string; node: ReactNode; wide?: boolean }[];
  className?: string;
}) {
  const { shown, listRef, beforeRef, exitsRef } = useFilter();

  useLayoutEffect(() => {
    const list = listRef.current;
    const first = beforeRef.current;
    beforeRef.current = null;
    exitsRef.current.forEach((animation) => animation.cancel()); // leavers are hidden now
    exitsRef.current = [];
    if (!list || !first) return;

    let entering = 0;
    list.querySelectorAll<HTMLElement>(":scope > li").forEach((el) => {
      if (el.hidden) return;
      const to = el.getBoundingClientRect();
      const from = first.get(el.dataset.key ?? "");
      if (!from) {
        el.animate(
          [{ opacity: 0, transform: "translate3d(0, 1.5rem, 0) scale(0.98)" }, { opacity: 1, transform: "none" }],
          { duration: 700, delay: 60 + entering++ * 70, easing: EASE_OUT, fill: "backwards" },
        );
        return;
      }
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "none" }], {
        duration: 650,
        easing: EASE_OUT,
      });
    });
  }, [shown, listRef, beforeRef, exitsRef]);

  return (
    <ul ref={listRef} className={cn("grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item) => (
        <li
          key={item.key}
          data-key={item.key}
          data-topic={item.topic}
          hidden={!matches(item.topic, shown)}
          className={cn(item.wide && "sm:col-span-2 lg:col-span-3")}
        >
          {item.node}
        </li>
      ))}
    </ul>
  );
}
