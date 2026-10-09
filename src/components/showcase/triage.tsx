"use client";

import {
  ChevronRight,
  Database,
  RotateCcw,
  Route,
  ScanSearch,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { WindowFrame } from "@/components/ui/window-frame";
import type { TriageShowcase as TriageData } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { ShowcaseFooter, controlClass, useEntrance } from "./shared";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

/** Per-character typing speed, then the gap between pipeline steps. */
const TYPE_MS = 34;
const STEP_MS = 420;
/** Steps after typing: 1 classify · 2 context · 3 route · 4 confidence · 5 answered. */
const DONE = 5;
const CONFIDENCE_STEP = 4;

type Query = TriageData["queries"][number];
/** One play-through: `animated` = typed + staged, `user` = started by a click (announced). */
type Run = { id: number; animated: boolean; user: boolean };

/** Confidence readout that counts up when revealed mid-run; static otherwise. */
function Percent({ value, animateIn }: { value: number; animateIn: boolean }) {
  const count = useMotionValue(animateIn ? 0 : value);
  const text = useTransform(count, (v) => `${Math.round(v)}%`);

  useEffect(() => {
    if (!animateIn) return;
    const controls = animate(count, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [animateIn, count, value]);

  return <motion.span>{text}</motion.span>;
}

/**
 * "AI support triage" snapshot: pick a customer query, watch it get typed,
 * classified, enriched and routed, with a confidence meter and time to answer.
 * Server markup is the finished state of the first query; the entrance replay
 * only happens when the widget starts below the fold.
 */
export function TriageShowcase({
  data,
  confidenceLabel,
  replayLabel,
}: {
  data: TriageData;
  confidenceLabel: string;
  replayLabel: string;
}) {
  const { queries } = data;
  const [selected, setSelected] = useState(0);
  /** Characters typed so far; `null` shows the whole query. */
  const [typed, setTyped] = useState<number | null>(null);
  const [step, setStep] = useState(DONE);
  const [run, setRun] = useState<Run>({ id: 0, animated: false, user: false });
  const reduce = useReducedMotionSafe();
  const rootRef = useRef<HTMLDivElement>(null);
  const meterLabelId = useId();

  function play(index: number, user = true) {
    const animated = !reduce;
    setSelected(index);
    setTyped(animated ? 0 : null);
    setStep(animated ? 0 : DONE);
    setRun((r) => ({ id: r.id + 1, animated, user }));
  }

  const entrance = useEntrance(rootRef, () => play(0, false));
  const blank = entrance === "armed";

  // Drive a run: type the query, then reveal each pipeline step.
  useEffect(() => {
    if (!run.animated) return;
    const length = queries[selected].query.length;
    const timers: number[] = [];
    let chars = 0;
    const typing = window.setInterval(() => {
      chars += 1;
      setTyped(chars);
      if (chars < length) return;
      window.clearInterval(typing);
      for (let s = 1; s <= DONE; s++) timers.push(window.setTimeout(() => setStep(s), s * STEP_MS));
    }, TYPE_MS);
    return () => {
      window.clearInterval(typing);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [run, selected, queries]);

  const q: Query = queries[selected];
  const shownChars = blank ? 0 : (typed ?? q.query.length);
  const shownStep = blank ? 0 : step;
  const typing = shownChars < q.query.length;
  const busy = run.id > 0 && shownStep < DONE;
  const meter = shownStep >= CONFIDENCE_STEP ? q.confidence : 0;
  const summary =
    run.user && shownStep === DONE
      ? `${q.category} · ${q.route} · ${confidenceLabel} ${q.confidence}% · ${q.time}`
      : "";

  const rows: { icon: LucideIcon; value: string; strong?: boolean }[] = [
    { icon: ScanSearch, value: q.category, strong: true },
    { icon: Database, value: q.context },
    { icon: Route, value: q.route },
  ];

  return (
    <WindowFrame
      label={data.label}
      status={
        <span aria-hidden="true" className="flex items-center gap-2 font-mono text-[0.68rem] text-muted">
          <span
            className={cn("size-1.5 rounded-full bg-em", busy && "animate-pulse-dot")}
          />
          {q.time}
        </span>
      }
    >
      <div ref={rootRef} className="p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {queries.map((item, i) => (
            <button
              key={item.chip}
              type="button"
              aria-pressed={i === selected}
              onClick={() => play(i)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-[0.82rem] transition-colors duration-300",
                i === selected
                  ? "border-em/50 bg-em/10 text-ink"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {item.chip}
            </button>
          ))}
        </div>

        <div className="relative mt-5 overflow-hidden rounded-xl border border-line bg-bg/70 p-4 font-mono text-[0.78rem] leading-relaxed sm:p-5">
          {busy && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-full animate-scan bg-linear-to-b from-em/0 via-em/[0.06] to-em/0"
            />
          )}

          {/* Query line: the full text reserves its wrapped height while typing. */}
          <p className="flex items-start gap-2 text-ink">
            <ChevronRight aria-hidden="true" className="mt-[0.2rem] size-3.5 shrink-0 text-em" />
            <span className="relative min-w-0 flex-1 break-words">
              <span className="sr-only">{q.query}</span>
              <span aria-hidden="true" className="invisible">
                {q.query}
              </span>
              <span aria-hidden="true" className="absolute inset-0">
                {q.query.slice(0, shownChars)}
                <span
                  className={cn(
                    "ml-px inline-block h-[1.05em] w-[0.5em] translate-y-[0.18em] bg-em/80",
                    !typing && "animate-blink",
                  )}
                />
              </span>
            </span>
          </p>

          <ol className="mt-5 space-y-2.5 border-t border-line pt-4">
            {rows.map((row, r) => {
              const shown = shownStep > r;
              const RowIcon = row.icon;
              return (
                <li
                  key={r}
                  className={cn(
                    "flex items-center gap-3 transition-[opacity,translate,visibility] duration-500 ease-out-expo",
                    shown ? "visible translate-x-0 opacity-100" : "invisible -translate-x-2 opacity-0",
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.02] text-em">
                    <RowIcon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      row.strong
                        ? "rounded-md bg-em/10 px-2 py-0.5 font-medium tracking-[0.06em] text-em"
                        : "text-dim",
                    )}
                  >
                    {row.value}
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            className={cn(
              "mt-5 transition-opacity duration-500",
              shownStep >= CONFIDENCE_STEP ? "opacity-100" : "opacity-40",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span id={meterLabelId} className="label-mono text-[0.62rem]">
                {confidenceLabel}
              </span>
              <span className="tabular-nums text-ink">
                {shownStep >= CONFIDENCE_STEP ? (
                  <Percent
                    key={`${run.id}-${selected}`}
                    value={q.confidence}
                    animateIn={run.animated}
                  />
                ) : (
                  "0%"
                )}
              </span>
            </div>
            <div
              role="meter"
              aria-labelledby={meterLabelId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={meter}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
            >
              <div
                className="h-full origin-left rounded-full bg-linear-to-r from-deep to-em transition-transform duration-[900ms] ease-out-expo"
                style={{ transform: `scaleX(${meter / 100})` }}
              />
            </div>
          </div>

          <p
            className={cn(
              "mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 transition-[opacity,visibility] duration-500",
              shownStep >= DONE ? "visible opacity-100" : "invisible opacity-0",
            )}
          >
            <Timer aria-hidden="true" className="size-3.5 text-em" />
            <span className="text-em">{q.time}</span>
            <span className="text-faint line-through decoration-faint/60">{data.baseline}</span>
          </p>
        </div>
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>
      </div>

      <ShowcaseFooter hint={data.hint}>
        <button type="button" onClick={() => play(selected)} className={controlClass}>
          <RotateCcw aria-hidden="true" className="size-3.5" />
          {replayLabel}
        </button>
      </ShowcaseFooter>
    </WindowFrame>
  );
}
