"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale } from "@/components/layout/locale-context";
import { journey } from "@/components/three/store";
import { Icon } from "@/components/ui/icon";
import { WindowFrame } from "@/components/ui/window-frame";
import { QUERIES } from "@/hooks/use-media-query";
import type { HomePage, Problem } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

type Monitor = HomePage["problem"]["monitor"];
type Range = Monitor["stats"]["errors"];
type Level = Monitor["brokenLogs"][number]["level"];

/* Network topology drawn in the monitor (viewBox 320 × 212). */
const NODES: readonly [number, number][] = [
  [40, 48], [124, 28], [206, 52], [286, 34], [72, 118],
  [164, 102], [254, 124], [36, 184], [142, 176], [272, 186],
];
const EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [2, 6], [3, 6],
  [4, 5], [5, 6], [4, 7], [4, 8], [5, 8], [6, 9], [8, 9], [7, 8],
];
const HUB = 5;

const LEVEL_TONE: Record<Level, string> = {
  err: "text-danger",
  warn: "text-warn",
  ok: "text-em",
  info: "text-info",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function formatRange(locale: string, r: Range, t: number) {
  const value = r.from + (r.to - r.from) * t;
  const digits = r.decimals ?? 0;
  return (
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (r.suffix ?? "")
  );
}

/* Hover brackets that lock onto a problem card's corners, sitting on the grid lines. */
const CORNERS = [
  "-left-px -top-px rounded-tl-md border-l border-t -translate-x-1.5 -translate-y-1.5",
  "-right-px -top-px rounded-tr-md border-r border-t translate-x-1.5 -translate-y-1.5",
  "-bottom-px -left-px rounded-bl-md border-b border-l -translate-x-1.5 translate-y-1.5",
  "-bottom-px -right-px rounded-br-md border-b border-r translate-x-1.5 translate-y-1.5",
] as const;

/**
 * The problem, told as a system under repair. A live monitor starts
 * degraded (faulty nodes, error logs, bad numbers) and heals as the
 * visitor scrolls: each problem's node recovers in turn, logs rewrite
 * themselves, and the metrics settle. The problems list mirrors it.
 */
export function ProblemExplorer({
  problems,
  monitor,
  children,
}: {
  problems: Problem[];
  monitor: Monitor;
  /** Section heading, rendered at the top of the left column. */
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const [heal, setHeal] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const desktop = window.matchMedia(QUERIES.desktop).matches;
      // Desktop: heal across the whole (sticky) column. Mobile: while the monitor passes.
      const start = vh * (desktop ? 0.62 : 0.85);
      const end = vh * (desktop ? 0.9 : 0.35);
      const p = clamp01((start - r.top) / Math.max(1, r.height + start - end));
      setHeal(Math.round(p * 200) / 200);
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
    };
  }, []);

  // The journey backdrop mirrors the repair: its fractured tiles heal in step.
  useEffect(() => {
    journey.heal = heal;
  }, [heal]);
  useEffect(() => {
    journey.problem = hovered ?? -1;
  }, [hovered]);
  useEffect(
    () => () => {
      journey.heal = 0;
      journey.problem = -1;
    },
    [],
  );

  // Each problem's node recovers in turn; logs rewrite top to bottom.
  const healedAt = (i: number) => (i + 1) / (problems.length + 1.4);
  const faulty = new Set(problems.filter((_, i) => heal < healedAt(i)).map((p) => p.node));
  const isHealthy = (node: number) => !faulty.has(node);
  const healed = heal >= 0.97;
  const t = easeOut(clamp01((heal - 0.04) / 0.9));
  const logs = monitor.brokenLogs.map((line, k) =>
    heal >= (k + 0.8) / (monitor.brokenLogs.length + 0.8) ? (monitor.healedLogs[k] ?? line) : line,
  );
  const highlightNode = hovered === null ? null : (problems[hovered]?.node ?? null);

  const stats: { key: string; range: Range; good: boolean }[] = [
    { key: "errors", range: monitor.stats.errors, good: t > 0.98 },
    { key: "warnings", range: monitor.stats.warnings, good: t > 0.9 },
    { key: "uptime", range: monitor.stats.uptime, good: t > 0.95 },
  ];

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-14 lg:gap-y-16">
      <div className="min-w-0 lg:col-span-6">{children}</div>

      <div ref={trackRef} className="min-w-0 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1">
        {/* Desktop: sticks under the header and never runs past the fold; on
            short screens the topology gives up height first. */}
        <div
          className="lg:sticky lg:top-[var(--monitor-top)] lg:[--monitor-top:calc(var(--header-h)+clamp(1rem,4svh_-_0.5rem,2rem))]"
          data-reveal=""
        >
          <WindowFrame
            label={monitor.label}
            className={cn(
              "transition-shadow duration-1000 lg:flex lg:max-h-[max(100svh_-_var(--monitor-top)_-_1.5rem,26rem)] lg:flex-col",
              healed
                ? "shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8),0_0_0_1px_rgb(60_228_154/0.25),0_0_60px_-20px_rgb(60_228_154/0.35)]"
                : "shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_107_107/0.18)]",
            )}
            bodyClassName="lg:flex lg:min-h-0 lg:flex-col"
            status={
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] transition-colors duration-700",
                  healed ? "border-em/35 bg-em/10 text-em" : "border-danger/35 bg-danger/10 text-danger",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", healed ? "bg-em animate-pulse-dot" : "bg-danger animate-flicker")}
                />
                {healed ? monitor.healedState : monitor.brokenState}
              </span>
            }
          >
            {/* Topology */}
            <div className="relative border-b border-line bg-[radial-gradient(circle_at_50%_40%,rgb(255_255_255/0.025),transparent_70%)] px-3 py-4 sm:px-5 lg:flex lg:min-h-0 lg:flex-col lg:py-[clamp(0.5rem,2svh,1rem)]">
              <svg viewBox="0 0 320 212" className="w-full lg:min-h-0" aria-hidden="true">
                {EDGES.map(([a, b]) => {
                  const ok = isHealthy(a) && isHealthy(b);
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={NODES[a][0]}
                      y1={NODES[a][1]}
                      x2={NODES[b][0]}
                      y2={NODES[b][1]}
                      strokeWidth={1}
                      strokeDasharray={ok ? "4 6" : "2 5"}
                      className={cn(
                        "transition-[stroke] duration-700",
                        ok ? "animate-dash stroke-em/50" : "animate-flicker stroke-danger/55",
                      )}
                    />
                  );
                })}
                {NODES.map(([x, y], i) => {
                  const ok = isHealthy(i);
                  const lit = highlightNode === i;
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r={lit ? 15 : 11}
                        className={cn(
                          "transition-all duration-500",
                          ok ? "fill-em/10" : "fill-danger/15",
                          lit && (ok ? "fill-em/25" : "fill-danger/30"),
                        )}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={i === HUB ? 6 : 4}
                        className={cn("transition-[fill] duration-700", ok ? "fill-em" : "fill-danger animate-flicker")}
                      />
                      {lit && (
                        <circle cx={x} cy={y} r={19} fill="none" strokeWidth={1} className="stroke-ink/60" strokeDasharray="2 3" />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Metrics */}
            <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
              {stats.map(({ key, range, good }) => (
                <div key={key} className="flex flex-col-reverse gap-1.5 px-3 py-4 sm:px-5 lg:py-[clamp(0.625rem,2svh,1rem)]">
                  <dt className="label-mono">{range.label}</dt>
                  <dd
                    className={cn(
                      "font-display text-[clamp(1.25rem,1rem+1.1vw,1.9rem)] font-medium leading-none tracking-[-0.04em] tabular-nums transition-colors duration-700",
                      good ? "text-em" : key === "warnings" ? "text-warn" : "text-danger",
                    )}
                  >
                    {formatRange(locale, range, t)}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Logs */}
            <ol className="space-y-2 px-4 py-4 font-mono text-[0.7rem] leading-relaxed sm:px-5 sm:text-[0.74rem] lg:space-y-[clamp(0.25rem,1svh,0.5rem)] lg:py-[clamp(0.625rem,2svh,1rem)]">
              {logs.map((line, k) => (
                <li key={k} className="flex gap-3">
                  <span className="shrink-0 text-faint tabular-nums">{pad(k + 1)}</span>
                  <span key={line.text} className={cn("load-fade min-w-0", LEVEL_TONE[line.level])}>
                    {line.text}
                  </span>
                </li>
              ))}
            </ol>

            {/* Heal progress */}
            <div className="flex items-center gap-4 border-t border-line px-4 py-3 sm:px-5 lg:py-[clamp(0.5rem,1.5svh,0.75rem)]">
              <span className="label-mono shrink-0 tabular-nums">{Math.round(heal * 100)}%</span>
              <span aria-hidden="true" className="relative h-px min-w-12 flex-1 overflow-hidden bg-line">
                <span
                  className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,var(--color-danger),var(--color-warn)_45%,var(--color-em))]"
                  style={{ width: `${heal * 100}%` }}
                />
              </span>
              <span className={cn("label-mono min-w-0 text-right transition-opacity duration-500", healed && "opacity-0")}>
                {monitor.hint}
              </span>
            </div>
          </WindowFrame>
        </div>
      </div>

      <ul className="grid border-l border-t border-line sm:grid-cols-2 lg:col-span-6 lg:row-start-2">
        {problems.map((problem, i) => {
          const solved = heal >= healedAt(i);
          return (
            <li
              key={problem.key}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
              onPointerMove={(e) => {
                // Spotlight follows the pointer (CSS vars only, no re-render).
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
              }}
              data-reveal=""
              style={
                {
                  "--reveal-delay": `${(i % 2) * 90}ms`,
                  "--tone": solved ? "var(--color-em)" : "var(--color-danger)",
                } as CSSProperties
              }
              className="group relative isolate border-b border-r border-line bg-bg/40 p-6 sm:p-7"
            >
              {/* Hover: tinted spotlight, one scan pass and corner brackets (decorative). */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(320px_circle_at_var(--mx,50%)_var(--my,40%),color-mix(in_srgb,var(--tone)_13%,transparent),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <span className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--tone),transparent)] opacity-0 shadow-[0_0_12px_var(--tone)] group-hover:animate-card-scan" />
              </span>
              {CORNERS.map((corner) => (
                <span
                  key={corner}
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute size-5 border-[var(--tone)] opacity-0 drop-shadow-[0_0_5px_var(--tone)] transition-[opacity,translate] duration-500 ease-out-expo group-hover:translate-0 group-hover:opacity-100",
                    corner,
                  )}
                />
              ))}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-xl border transition-[border-color,background-color,color,box-shadow] duration-700 group-hover:border-[color-mix(in_srgb,var(--tone)_65%,transparent)] group-hover:shadow-[0_0_26px_-4px_var(--tone)]",
                    solved ? "border-em/30 bg-em/[0.06] text-em" : "border-danger/25 bg-danger/[0.06] text-danger",
                  )}
                >
                  <Icon name={problem.icon} className="size-5" aria-hidden="true" />
                </span>
                <span aria-hidden="true" className="flex items-center gap-2 label-mono transition-colors duration-500 group-hover:text-dim">
                  {pad(i + 1)}
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-[background-color,box-shadow] duration-700 group-hover:shadow-[0_0_10px_var(--tone)]",
                      solved ? "bg-em" : "bg-danger animate-flicker",
                    )}
                  />
                </span>
              </div>
              <h3 className="text-h4 mt-6 text-ink">{problem.title}</h3>
              <p className="mt-2 text-[0.95rem] text-dim">{problem.description}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
