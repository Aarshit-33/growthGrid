"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { WindowFrame } from "@/components/ui/window-frame";
import type { DashboardShowcase as DashboardData } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { ShowcaseFooter, useEntrance } from "./shared";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

type Metric = DashboardData["views"][number]["metrics"][number];

/** SVG user space; the chart stretches to its box (preserveAspectRatio="none"). */
const W = 600;
const H = 240;
const EASE = [0.16, 1, 0.3, 1] as const;
const MORPH = { duration: 0.8, ease: EASE };
const INSTANT = { duration: 0 };

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

/** Round the axis top up to a "nice" step so gridlines land on readable values. */
function scaleFor(max: number, ticks = 4) {
  const raw = (max * 1.12) / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil((max * 1.12) / step) * step;
  const values = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  return { top, values };
}

const num = (v: number) => v.toFixed(1);

/** Monotone cubic path (d3 monotoneX): smooth, and never overshoots the data. */
function smoothPath(xs: number[], ys: number[]) {
  const n = xs.length;
  const slope = (i: number) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const tangents = xs.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const s0 = slope(i - 1);
    const s1 = slope(i);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.25 * Math.abs(s0 + s1)) || 0;
  });
  if (n > 2) {
    tangents[0] = (3 * slope(0) - tangents[1]) / 2;
    tangents[n - 1] = (3 * slope(n - 2) - tangents[n - 2]) / 2;
  } else {
    tangents[0] = tangents[1] = slope(0);
  }
  let d = `M${num(xs[0])},${num(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3;
    const c1 = `${num(xs[i] + h)},${num(ys[i] + tangents[i] * h)}`;
    const c2 = `${num(xs[i + 1] - h)},${num(ys[i + 1] - tangents[i + 1] * h)}`;
    d += `C${c1},${c2},${num(xs[i + 1])},${num(ys[i + 1])}`;
  }
  return d;
}

function formatMetric(value: number, metric: Metric) {
  const digits = { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals };
  return `${metric.prefix}${value.toLocaleString("en-US", digits)}${metric.suffix}`;
}

/** Counts from the previous view's figure to this one; static on first paint. */
function MetricValue({ metric, from }: { metric: Metric; from: number | null }) {
  const value = useMotionValue(from ?? metric.value);
  const text = useTransform(value, (v) => formatMetric(v, metric));

  useEffect(() => {
    if (from === null) return;
    const controls = animate(value, metric.value, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [from, metric.value, value]);

  return <motion.span>{text}</motion.span>;
}

/**
 * "Live dashboard" snapshot: view tabs morph an area chart and count the KPI
 * cards to their new figures; the chart is scrubbable by pointer, touch or
 * arrow keys (exposed as a slider), with the latest point marked live.
 */
export function DashboardShowcase({ data }: { data: DashboardData }) {
  const { days, views } = data;
  const n = days.length;
  const uid = useId();
  const gradientId = `dash-fill-${uid.replace(/[^\w-]/g, "")}`;
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const reduce = useReducedMotionSafe();
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const entrance = useEntrance(rootRef);
  const armed = entrance === "armed";

  const view = views[active];
  const { top, values: ticks } = scaleFor(Math.max(1, ...view.series));
  const xPct = (i: number) => ((i + 0.5) / n) * 100;
  const yPct = (v: number) => (1 - v / top) * 100;
  const xs = view.series.map((_, i) => (xPct(i) / 100) * W);
  const ys = view.series.map((v) => (yPct(v) / 100) * H);
  const line = smoothPath(xs, ys);
  const area = `${line}L${num(xs[n - 1])},${H}L${num(xs[0])},${H}Z`;
  const focus = scrub ?? n - 1;
  const transition = reduce ? INSTANT : MORPH;

  function choose(index: number) {
    if (index === active) return;
    setPrevious(active);
    setActive(index);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: views.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = (target + views.length) % views.length;
    choose(next);
    tabRefs.current[next]?.focus();
  }

  function scrubTo(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setScrub(Math.min(n - 1, Math.max(0, Math.floor(ratio * n))));
  }

  function onScrubKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: focus + 1,
      ArrowUp: focus + 1,
      ArrowLeft: focus - 1,
      ArrowDown: focus - 1,
      Home: 0,
      End: n - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setScrub(Math.min(n - 1, Math.max(0, target)));
  }

  const focusValue = view.series[focus];
  const focusText = `${days[focus]}: ${whole.format(focusValue)} ${view.unit}`;

  return (
    <WindowFrame
      label={data.label}
      status={
        <span aria-hidden="true" className="flex items-center gap-2 font-mono text-[0.68rem] text-muted">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-em" />
          {days[n - 1]}
        </span>
      }
    >
      <div ref={rootRef} className="p-4 sm:p-6">
        <div
          role="tablist"
          aria-label={data.label}
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white/[0.02] p-1 no-scrollbar"
        >
          {views.map((v, i) => {
            const selected = i === active;
            return (
              <button
                key={v.label}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`${uid}-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(event) => onTabKey(event, i)}
                className="relative min-h-9 shrink-0 rounded-full px-4 font-mono text-[0.7rem] uppercase tracking-[0.1em]"
              >
                {selected && (
                  <motion.span
                    layoutId={`${uid}-pill`}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-em"
                    transition={reduce ? INSTANT : { type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span
                  className={cn(
                    "relative transition-colors duration-300",
                    selected ? "text-bg" : "text-muted hover:text-ink",
                  )}
                >
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>

        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`}>
          <div className="mt-6 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 sm:mt-7">
            {/* Y axis */}
            <div aria-hidden="true" className="relative h-44 sm:h-56">
              {ticks.map((t) => (
                <span
                  key={`${active}-${t}`}
                  className="absolute right-0 -translate-y-1/2 font-mono text-[0.6rem] tabular-nums text-faint"
                  style={{ top: `${yPct(t)}%` }}
                >
                  {compact.format(t)}
                </span>
              ))}
            </div>

            {/* Plot */}
            <div className="relative h-44 sm:h-56">
              <div aria-hidden="true" className="absolute inset-0">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className={cn(
                      "absolute inset-x-0 border-t",
                      t === 0 ? "border-line-strong" : "border-dashed border-line",
                    )}
                    style={{ top: `${yPct(t)}%` }}
                  />
                ))}
              </div>

              <svg
                aria-hidden="true"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-em)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-em)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <motion.path
                  initial={false}
                  animate={{ d: area, opacity: armed ? 0 : 1 }}
                  transition={{ d: transition, opacity: { duration: reduce ? 0 : 1, delay: 0.3 } }}
                  fill={`url(#${gradientId})`}
                />
              </svg>
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible drop-shadow-[0_0_8px_rgb(60_228_154/0.45)]"
                style={{
                  clipPath: armed ? "inset(0 100% 0 0)" : "inset(0 0% 0 0)",
                  transition: "clip-path 1.4s var(--ease-out-expo)",
                }}
              >
                <motion.path
                  initial={false}
                  animate={{ d: line }}
                  transition={{ d: transition }}
                  fill="none"
                  stroke="var(--color-em)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* Crosshair */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 w-px bg-linear-to-b from-em/0 via-em/50 to-em/0 transition-[left,opacity] duration-200 ease-out",
                  armed ? "opacity-0" : "opacity-100",
                )}
                style={{ left: `${xPct(focus)}%` }}
              />

              {/* Points + tooltips: each follows the morph with the same easing. */}
              <div
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 transition-opacity duration-500",
                  armed ? "opacity-0" : "opacity-100 delay-700",
                )}
              >
                {view.series.map((v, i) => {
                  const on = i === focus;
                  const x = xPct(i);
                  const y = yPct(v);
                  return (
                    <span
                      key={days[i]}
                      className="absolute"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        transition: "top 0.8s var(--ease-out-expo)",
                      }}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-0 block -translate-1/2 rounded-full transition-[width,height,background-color,box-shadow] duration-300",
                          on
                            ? "size-3 bg-em shadow-[0_0_0_5px_rgb(60_228_154/0.18)]"
                            : "size-1.5 bg-em/70",
                          i === n - 1 && "animate-pulse-dot",
                        )}
                      />
                      <span
                        className={cn(
                          "absolute left-0 top-0 whitespace-nowrap rounded-lg border border-line-strong bg-surface-2/95 px-2.5 py-1.5 shadow-panel backdrop-blur-sm transition-opacity duration-150",
                          on ? "opacity-100" : "opacity-0",
                          x < 16 ? "-translate-x-3" : x > 84 ? "-translate-x-[calc(100%-0.75rem)]" : "-translate-x-1/2",
                          y < 32 ? "translate-y-3.5" : "-translate-y-[calc(100%+0.875rem)]",
                        )}
                      >
                        <span className="block font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted">
                          {days[i]}
                        </span>
                        <span className="mt-0.5 block text-[0.8rem] font-medium tabular-nums text-ink">
                          {whole.format(v)} <span className="font-normal text-muted">{view.unit}</span>
                        </span>
                      </span>
                    </span>
                  );
                })}
              </div>

              {/* Scrub surface: pointer, touch (horizontal drag) and keyboard. */}
              <div
                role="slider"
                tabIndex={0}
                aria-label={view.label}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={n - 1}
                aria-valuenow={focus}
                aria-valuetext={focusText}
                onPointerDown={scrubTo}
                onPointerMove={scrubTo}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setScrub(null);
                }}
                onKeyDown={onScrubKey}
                onBlur={() => setScrub(null)}
                className="absolute inset-0 z-10 cursor-crosshair touch-pan-y rounded-md focus-visible:outline-offset-4"
              />
            </div>

            {/* X axis */}
            <div aria-hidden="true" className="relative col-start-2 mt-3 h-4">
              {days.map((day, i) => (
                <span
                  key={day}
                  className={cn(
                    "absolute -translate-x-1/2 font-mono text-[0.6rem] uppercase tracking-[0.06em] transition-colors duration-200",
                    i === focus ? "text-em" : "text-faint",
                  )}
                  style={{ left: `${xPct(i)}%` }}
                >
                  {day}
                </span>
              ))}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-2 sm:mt-7 sm:gap-3">
            {view.metrics.map((metric, k) => (
              <div
                key={k}
                className="flex min-w-0 flex-col rounded-xl border border-line bg-white/[0.015] p-3 sm:p-4"
              >
                <dt className="label-mono truncate text-[0.58rem] sm:text-[0.64rem]">{metric.label}</dt>
                <dd className="mt-2.5 font-display text-lg font-medium leading-none tracking-[-0.03em] tabular-nums text-ink sm:text-[1.75rem]">
                  <MetricValue
                    key={`${active}-${k}`}
                    metric={metric}
                    from={previous === null || reduce ? null : (views[previous]?.metrics[k]?.value ?? null)}
                  />
                </dd>
                <dd className="mt-2 text-[0.7rem] leading-snug text-muted">{metric.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <ShowcaseFooter hint={data.hint} />
    </WindowFrame>
  );
}
