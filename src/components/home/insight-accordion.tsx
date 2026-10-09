"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { getLenis, scrollToTarget } from "@/components/layout/smooth-scroll";
import { ArrowSwap } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { QUERIES, useReducedMotionSafe } from "@/hooks/use-media-query";
import type { IconName, InsightWithMeta } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

/** What the accordion needs from an insight (the article body stays on the server). */
export interface InsightAccordionItem {
  slug: string;
  title: string;
  excerpt: string;
  /** Category label, e.g. "Applied AI". */
  category: string;
  icon: IconName;
  cover: InsightWithMeta["cover"];
  publishedAt: string;
  /** Formatted on the server, so server and client render the same text. */
  date: string;
  readingTime: number;
}

/** Open/close animation lengths: keep in sync with the duration classes below. */
const SWAP_MS = { strip: 700, row: 500 } as const;

/**
 * Hover intent (mouse, tablet up): how long the pointer rests on a card
 * before it opens (so sweeping across the row doesn't open every strip it
 * passes), and how long after the pointer leaves the row the resting card
 * opens again (so brushing past the edge doesn't swap cards).
 */
const HOVER_MS = { open: 90, leave: 280 } as const;

const stretched = "after:absolute after:inset-0 after:z-10 after:content-['']";

const arrowButton =
  "grid size-11 place-items-center rounded-full border border-line-strong bg-white/[0.03] text-ink transition-[color,background-color,border-color,opacity] duration-300 hover:border-em/60 hover:bg-em/[0.12] hover:text-hot disabled:cursor-default disabled:opacity-30 disabled:hover:border-line-strong disabled:hover:bg-white/[0.03] disabled:hover:text-ink";

/** Scroll the page by `dy` at once (through Lenis when it drives the page). */
function nudgePage(dy: number) {
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(lenis.scroll + dy, { immediate: true, force: true });
  else window.scrollTo({ top: window.scrollY + dy, behavior: "instant" });
}

/** Bring a freshly opened (phone) card fully into view below the fixed header, when it fits. */
function revealRow(row: HTMLElement) {
  const r = row.getBoundingClientRect();
  const top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const bottom = window.innerHeight - 16;
  const dy = r.top < top ? r.top - top : r.bottom > bottom ? Math.min(r.bottom - bottom, r.top - top) : 0;
  if (Math.abs(dy) > 2) scrollToTarget(window.scrollY + dy);
}

/**
 * Insights as expanding cards: exactly one is open (cover, date, title,
 * excerpt and a link to the article); every other one is collapsed to its
 * number, title and topic icon. The first card is open by default.
 *
 * - Mouse, tablet up: hovering a card opens it (after a brief rest, see
 *   HOVER_MS); when the pointer leaves the row, the resting card (the first,
 *   unless one was chosen) opens again.
 * - Choosing a collapsed card (click, tap, Enter/Space, arrow keys, or the
 *   prev/next buttons) opens it and makes it the resting card.
 *
 * Mobile first, and built for any number of insights:
 * - phones: stacked rows (an accordion); the list simply grows;
 * - tablets and desktops: one row of cards, the collapsed ones narrow strips
 *   with vertical titles. Strips keep a fixed minimum width and the open card
 *   a minimum width, so once there are more cards than fit, the row scrolls
 *   sideways (edge fades show there's more) instead of squeezing them.
 *
 * Accessibility follows the WAI-ARIA accordion pattern: each title is an h3
 * with a button (`aria-expanded`; the open one `aria-disabled`, it can't
 * collapse); collapsed panels stay in the HTML (crawlable) but are `inert`.
 */
export function InsightAccordion({
  items,
  minReadLabel,
  readLabel,
  prevLabel,
  nextLabel,
  className,
}: {
  items: InsightAccordionItem[];
  /** e.g. "min read" */
  minReadLabel: string;
  /** Call to action on the open card, e.g. "Read article". */
  readLabel: string;
  /** Accessible labels for the prev/next buttons. */
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const uid = useId();
  const n = items.length;
  /** The card the row rests on: the first until a click, tap, key or prev/next chooses another. */
  const [selected, setSelected] = useState(0);
  /** The card opened by hovering it (mouse, tablet up); null: the resting card is open. */
  const [peek, setPeek] = useState<number | null>(null);
  const active = peek ?? selected;
  /** Cards whose cover is rendered: the open one, plus any hovered or focused (so it's ready when opened). */
  const [primed, setPrimed] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [announcement, setAnnouncement] = useState("");
  const activeRef = useRef(0);
  const selectedRef = useRef(0);
  /** The card under the mouse (-1: between cards; null: off the row) and its pending open/return. */
  const hovered = useRef<number | null>(null);
  const hoverTimer = useRef(0);
  const track = useRef<HTMLUListElement>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const frame = useRef(0);
  const reduce = useReducedMotionSafe();
  const reduceRef = useRef(reduce);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);

  const prime = useCallback(
    (i: number) => setPrimed((prev) => (i < 0 || i >= n || prev.has(i) ? prev : new Set(prev).add(i))),
    [n],
  );

  /** Mark the ends of the (tablet/desktop) row that have cards scrolled out of view. */
  const updateFades = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.toggleAttribute("data-fade-start", max > 1 && el.scrollLeft > 1);
    el.toggleAttribute("data-fade-end", max > 1 && el.scrollLeft < max - 1);
  }, []);

  /** The row's scrollLeft that shows card `i` whole plus a sliver of its neighbours (null: nothing to scroll). */
  const trackTarget = useCallback((i: number) => {
    const el = track.current;
    const row = rows.current[i];
    if (!el || !row) return null;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return null;
    const neighbour = (rows.current[i + 1] ?? rows.current[i - 1])?.offsetWidth ?? 0;
    const margin = (parseFloat(getComputedStyle(el).paddingLeft) || 0) + Math.min(neighbour, 96) * 0.6;
    const start = row.offsetLeft - margin;
    const end = row.offsetLeft + row.offsetWidth + margin - el.clientWidth;
    const next = start < el.scrollLeft ? start : end > el.scrollLeft ? end : el.scrollLeft;
    return Math.min(max, Math.max(0, next));
  }, []);

  /**
   * Keep the opening card in place while the cards resize (one rAF loop for
   * the length of the CSS transition):
   * - phones (`anchor` = the row's viewport top when chosen): the row stays
   *   under the finger while an open card above it closes, then the opened
   *   card is brought fully into view;
   * - tablets and desktops: the row scrolls along with the growing card, so
   *   it never ends up half outside the visible strip.
   */
  const follow = useCallback(
    (i: number, anchor: number | null) => {
      cancelAnimationFrame(frame.current);
      const el = track.current;
      const html = document.documentElement;
      const until = performance.now() + (reduceRef.current ? 0 : anchor !== null ? SWAP_MS.row : SWAP_MS.strip) + 250;
      // The visitor scrolling takes over from the loop.
      const source: EventTarget | null = anchor !== null ? window : el;
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
      };
      source?.addEventListener("wheel", cancel, { passive: true });
      source?.addEventListener("touchstart", cancel, { passive: true });
      // Meanwhile this loop replaces the browser's scroll anchoring (both would move the page).
      if (anchor !== null) html.style.overflowAnchor = "none";

      const done = () => {
        source?.removeEventListener("wheel", cancel);
        source?.removeEventListener("touchstart", cancel);
        if (anchor !== null) {
          html.style.overflowAnchor = "";
          const row = rows.current[i];
          if (!cancelled && row) revealRow(row);
        }
        updateFades();
      };

      const tick = (now: number) => {
        const row = rows.current[i];
        if (cancelled || !row) return done();
        if (anchor !== null) {
          const dy = row.getBoundingClientRect().top - anchor;
          if (Math.abs(dy) > 0.5) nudgePage(dy);
        } else if (el) {
          const to = trackTarget(i);
          if (to !== null) {
            const diff = to - el.scrollLeft;
            el.scrollLeft = Math.abs(diff) < 1 || reduceRef.current ? to : el.scrollLeft + diff * 0.28;
          }
        }
        if (now < until) frame.current = requestAnimationFrame(tick);
        else done();
      };
      frame.current = requestAnimationFrame(tick);
    },
    [trackTarget, updateFades],
  );

  /** Open card `i` (the open one closes) and keep it in view while the cards resize. */
  const show = useCallback(
    (i: number) => {
      prime(i);
      if (i === activeRef.current) return;
      const row = rows.current[i];
      const stacked = !window.matchMedia(QUERIES.tablet).matches;
      activeRef.current = i;
      follow(i, stacked && row ? row.getBoundingClientRect().top : null);
    },
    [prime, follow],
  );

  /** Choose card `i`: it opens and becomes the card the row rests on. */
  const select = useCallback(
    (i: number, { focus = false, announce = false } = {}) => {
      if (i < 0 || i >= n) return;
      if (focus) triggers.current[i]?.focus({ preventScroll: true });
      window.clearTimeout(hoverTimer.current);
      if (announce && i !== activeRef.current) setAnnouncement(`${pad(i + 1)} / ${pad(n)} · ${items[i].title}`);
      selectedRef.current = i;
      setSelected(i);
      setPeek(null);
      show(i);
    },
    [n, items, show],
  );

  /** Hover: open card `i` without choosing it; null opens the resting card again. */
  const peekAt = useCallback(
    (i: number | null) => {
      setPeek(i);
      show(i ?? selectedRef.current);
    },
    [show],
  );

  /**
   * Mouse, tablet up: the card under the pointer opens once the pointer rests
   * on it. Only real pointer movement counts, so when the row or the page
   * scrolls under a still pointer, nothing opens by itself (phones and the
   * stacked layout keep tap/click: there, opening a row moves the others).
   */
  const onPointerMove = (e: PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse" || (e.movementX === 0 && e.movementY === 0)) return;
    if (!window.matchMedia(QUERIES.tablet).matches) return;
    const item = e.target instanceof Element ? e.target.closest("[data-insight-item]") : null;
    const i = item ? rows.current.indexOf(item as HTMLLIElement) : -1;
    if (i === hovered.current) return;
    hovered.current = i;
    window.clearTimeout(hoverTimer.current);
    if (i < 0) return;
    prime(i);
    if (i !== activeRef.current) hoverTimer.current = window.setTimeout(() => peekAt(i), HOVER_MS.open);
  };

  /** The pointer left the row: shortly after, the resting card (the first, by default) opens again. */
  const onPointerLeave = (e: PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse" || hovered.current === null) return;
    hovered.current = null;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => peekAt(null), HOVER_MS.leave);
  };

  /** Arrow keys move between the cards' buttons (and open them), Home/End jump to the ends. */
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const from = triggers.current.indexOf(e.target as HTMLButtonElement);
    if (from < 0 || n < 2) return;
    const keys: Record<string, number> = {
      ArrowRight: from + 1,
      ArrowDown: from + 1,
      ArrowLeft: from - 1,
      ArrowUp: from - 1,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select((keys[e.key] + n) % n, { focus: true });
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // After a resize the open card may sit elsewhere in the row: keep it in view.
    const onResize = () => {
      const to = trackTarget(activeRef.current);
      if (to !== null) el.scrollLeft = to;
      updateFades();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    el.addEventListener("scroll", updateFades, { passive: true });
    const loop = frame;
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateFades);
      cancelAnimationFrame(loop.current);
      document.documentElement.style.overflowAnchor = "";
    };
  }, [trackTarget, updateFades]);

  // A hover-opened card is transient: when the row unmounts or is hidden
  // (React Activity keeps hidden pages' state), drop the pending hover and
  // come back on the resting card.
  useLayoutEffect(() => {
    const timer = hoverTimer;
    return () => {
      window.clearTimeout(timer.current);
      hovered.current = null;
      activeRef.current = selectedRef.current;
      setPeek(null);
    };
  }, []);

  if (n === 0) return null;

  return (
    <div data-reveal="" className={className}>
      <ul
        ref={track}
        data-insight-track=""
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          "container-x no-scrollbar relative flex flex-col gap-2.5",
          // Tablets and desktops: one row; it scrolls sideways once the cards outgrow it.
          // The vertical padding leaves room for the cards' glow and focus ring.
          "md:-my-6 md:flex-row md:gap-(--gap) md:overflow-x-auto md:overflow-y-hidden md:overscroll-x-contain md:py-6",
          // Edge fades while cards are scrolled out of view on that side (no fade while the widths are 0).
          "[--fade-l:0px] [--fade-r:0px] data-fade-start:[--fade-l:var(--gutter)] data-fade-end:[--fade-r:var(--gutter)]",
          "md:[mask-image:linear-gradient(to_right,transparent,#000_var(--fade-l),#000_calc(100%_-_var(--fade-r)),transparent)]",
          // Strip (collapsed) and open card minimum widths, the gap and the row height per breakpoint.
          "md:[--gap:0.625rem] md:[--open:21rem] md:[--strip:4.5rem] md:[--track-h:clamp(24rem,calc(100svh_-_10rem),30rem)]",
          "lg:[--gap:0.75rem] lg:[--open:26rem] lg:[--strip:5.25rem] lg:[--track-h:clamp(26rem,calc(100svh_-_11rem),32rem)]",
          "xl:[--gap:0.875rem] xl:[--open:30rem] xl:[--strip:5.75rem] xl:[--track-h:clamp(26rem,calc(100svh_-_11rem),34rem)]",
        )}
      >
        {items.map((item, i) => {
          const open = i === active;
          const triggerId = `${uid}-trigger-${i}`;
          const panelId = `${uid}-panel-${i}`;
          return (
            <li
              key={item.slug}
              ref={(el) => {
                rows.current[i] = el;
              }}
              data-insight-item=""
              data-open={open ? "" : undefined}
              className={cn(
                "group/card relative shrink-0 overflow-hidden rounded-card border transition-[border-color,background-color,box-shadow] duration-500 ease-out-expo",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-em",
                // Widths animate: the open card takes most of the free space (grow 8), strips share the rest.
                "md:h-(--track-h) md:rounded-panel md:transition-[flex-grow,flex-basis,border-color,background-color,box-shadow] md:duration-700",
                open
                  ? "border-em/40 bg-surface shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8),0_24px_60px_-28px_rgb(60_228_154/0.5)] hover:border-em/70 md:flex-[8_0_var(--open)]"
                  : "border-line bg-surface hover:border-em/50 hover:bg-surface-2 hover:shadow-[0_0_0_1px_rgb(60_228_154/0.2),0_0_22px_-2px_rgb(60_228_154/0.4)] active:bg-surface-2 md:flex-[1_0_var(--strip)]",
              )}
            >
              {/* Phones: the collapsed row folds away as its card opens. Tablet up: the strip face. */}
              <h3
                className={cn(
                  "grid transition-[grid-template-rows] duration-500 ease-out-expo md:block",
                  open ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                )}
              >
                <button
                  ref={(el) => {
                    triggers.current[i] = el;
                  }}
                  id={triggerId}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-disabled={open || undefined}
                  tabIndex={open ? -1 : undefined}
                  onClick={() => select(i)}
                  onPointerEnter={() => prime(i)}
                  onFocus={() => prime(i)}
                  className="min-h-0 overflow-hidden text-left focus-visible:outline-none md:absolute md:inset-0"
                >
                  <span
                    className={cn(
                      "flex min-h-[4.5rem] items-center gap-4 px-4 py-3.5 transition-opacity xs:px-5 md:h-full md:min-h-0 md:flex-col md:gap-4 md:px-1.5 md:py-6",
                      open ? "opacity-0 duration-150" : "opacity-100 duration-500 delay-200",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-6 shrink-0 font-display text-[0.95rem] font-medium tabular-nums text-faint transition-colors duration-300 group-hover/card:text-em md:w-auto md:text-[1.05rem] lg:text-[1.15rem]"
                    >
                      {pad(i + 1)}
                    </span>
                    {/* Tablet up: the title runs bottom-to-top, centred in the strip (wrapping to at most 3 lines). */}
                    <span className="contents md:flex md:min-h-0 md:flex-1 md:items-center md:justify-center">
                      <span className="line-clamp-2 flex-1 font-display text-[1.02rem] font-medium leading-snug tracking-[-0.01em] text-dim transition-colors duration-300 group-hover/card:text-ink md:line-clamp-3 md:max-h-full md:flex-none md:rotate-180 md:text-balance md:text-center md:text-[1rem] md:leading-[1.2] md:[writing-mode:vertical-rl] lg:text-[1.15rem] xl:text-[1.25rem]">
                        {item.title}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors duration-300 group-hover/card:border-em/40 group-hover/card:text-em md:size-auto md:border-0 md:text-faint"
                    >
                      <Icon name={item.icon} className="size-[1.1rem] md:size-5" />
                    </span>
                  </span>
                </button>
              </h3>

              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                inert={!open}
                className={cn(
                  "grid transition-[grid-template-rows] duration-500 ease-out-expo md:absolute md:inset-0 md:block",
                  open ? "grid-rows-[1fr]" : "pointer-events-none grid-rows-[0fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden md:h-full">
                  {/* Tablet up: never narrower than the open width, so the copy doesn't reflow while the card grows. */}
                  <div
                    className={cn(
                      "relative isolate transition-opacity md:absolute md:inset-y-0 md:left-0 md:flex md:w-[max(100%,var(--open))] md:flex-col",
                      open ? "opacity-100 duration-500 delay-150" : "opacity-0 duration-200",
                    )}
                  >
                    {/* Cover: a 16:9 band on phones, the card's backdrop from tablets up. */}
                    <div className="relative -z-10 aspect-[16/9] overflow-hidden md:absolute md:inset-0 md:aspect-auto">
                      {primed.has(i) && (
                        <Image
                          src={item.cover.src}
                          alt={item.cover.alt}
                          fill
                          sizes="(min-width: 1280px) 900px, (min-width: 768px) 65vw, 92vw"
                          className={cn(
                            "object-cover transition-transform duration-[1.6s] ease-out-expo group-hover/card:scale-[1.04]",
                            open ? "scale-100" : "scale-[1.08]",
                          )}
                        />
                      )}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(4_7_10/0.7),transparent_42%)] md:bg-[linear-gradient(to_bottom,rgb(4_7_10/0.65),transparent_30%)]"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-surface),transparent_50%)] md:bg-[linear-gradient(to_top,rgb(10_17_23/0.98)_6%,rgb(10_17_23/0.9)_34%,rgb(10_17_23/0.45)_62%,transparent_88%)]"
                      />
                    </div>
                    {/* The open card is the lit one: a deep emerald glow behind its copy. */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-[radial-gradient(90%_75%_at_0%_100%,rgb(15_107_71/0.42),transparent_70%)]"
                    />

                    <div className="absolute left-4 top-4 flex items-center gap-3 xs:left-5 xs:top-5 md:static md:px-7 md:pt-7 lg:px-9 lg:pt-9">
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-bg/45 text-hot backdrop-blur-md md:size-12 md:rounded-2xl"
                      >
                        <Icon name={item.icon} className="size-[1.1rem] md:size-5" />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span aria-hidden="true" className="font-mono text-[0.66rem] tabular-nums tracking-[0.14em] text-em">
                          {pad(i + 1)} / {pad(n)}
                        </span>
                        <span className="text-sm font-medium text-ink md:text-base">{item.category}</span>
                      </span>
                    </div>

                    {/* Not positioned: the title link's ::after stretches over the whole card. */}
                    <div className="p-5 pt-4 xs:px-6 md:mt-auto md:max-w-[42rem] md:p-7 lg:p-9">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted md:text-dim">
                        <time dateTime={item.publishedAt}>{item.date}</time>
                        <span aria-hidden="true" className="size-1 rounded-full bg-faint" />
                        <span>
                          {item.readingTime} {minReadLabel}
                        </span>
                      </p>
                      <p className="text-h3 mt-3 line-clamp-3 text-balance text-ink transition-colors duration-300 group-hover/card:text-hot md:max-w-[24ch] md:text-[clamp(1.55rem,0.9rem+1.35vw,2.35rem)] md:leading-[1.1] md:tracking-[-0.03em]">
                        <Link href={`/insights/${item.slug}`} className={cn(stretched, "focus-visible:outline-none")}>
                          {item.title}
                        </Link>
                      </p>
                      <p className="mt-3 line-clamp-3 text-[0.95rem] text-dim md:mt-4 md:max-w-[34rem] lg:text-base">
                        {item.excerpt}
                      </p>
                      <span aria-hidden="true" className="mt-5 inline-flex items-center gap-3 text-sm font-medium text-ink lg:mt-6">
                        <span className="grid size-10 place-items-center rounded-full bg-em text-bg transition-colors duration-300 group-hover/card:bg-hot">
                          <ArrowSwap trigger="card" />
                        </span>
                        {readLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablet up: position, and prev/next (phones scroll the stacked list instead). */}
      {n > 1 && (
        <div className="container-x mt-8 hidden items-center gap-5 md:flex lg:mt-10">
          <span aria-hidden="true" className="font-mono text-[0.72rem] tabular-nums tracking-[0.14em] text-dim">
            {pad(active + 1)} / {pad(n)}
          </span>
          {/* One segment per insight; only the open one is lit. */}
          <span aria-hidden="true" className="relative h-px flex-1 overflow-hidden bg-line">
            <span
              className="absolute inset-y-0 left-0 bg-em transition-transform duration-700 ease-out-expo"
              style={{ width: `${100 / n}%`, transform: `translateX(${active * 100}%)` }}
            />
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              data-insight-prev=""
              onClick={() => select(active - 1, { announce: true })}
              onPointerEnter={() => prime(active - 1)}
              disabled={active === 0}
              aria-label={prevLabel}
              className={arrowButton}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              data-insight-next=""
              onClick={() => select(active + 1, { announce: true })}
              onPointerEnter={() => prime(active + 1)}
              disabled={active === n - 1}
              aria-label={nextLabel}
              className={arrowButton}
            >
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
