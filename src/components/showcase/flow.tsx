"use client";

import { Check, Clock, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { WindowFrame } from "@/components/ui/window-frame";
import type { FlowShowcase as FlowData } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";
import { ShowcaseFooter, controlClass } from "./shared";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

/** Dwell time per stage while the flow runs. */
const STAGE_MS = 2400;

type Mode = "idle" | "playing" | "paused";

/**
 * "Care pipeline" snapshot: a stage stepper over a detail panel. Picking a
 * stage rolls in its before/after KPIs; Run auto-advances through the flow
 * (pausable, and it pauses itself when scrolled away or the tab is hidden).
 * Every panel is server-rendered and stacked in one grid cell, so switching
 * never shifts layout.
 */
export function FlowShowcase({ data, pauseLabel }: { data: FlowData; pauseLabel: string }) {
  const { stages, kpiLabels } = data;
  const count = stages.length;
  const last = count - 1;
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  const reduce = useReducedMotionSafe();
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const elapsed = useRef(0);
  const playing = mode === "playing";

  // Auto-advance. Pausing banks the time already spent on the current stage,
  // so resuming finishes that stage instead of restarting it.
  useEffect(() => {
    if (mode !== "playing") return;
    let fired = false;
    const started = performance.now();
    const timer = window.setTimeout(
      () => {
        fired = true;
        elapsed.current = 0;
        const next = Math.min(active + 1, last);
        setActive(next);
        if (next === last) setMode("idle");
      },
      Math.max(0, STAGE_MS - elapsed.current),
    );
    return () => {
      window.clearTimeout(timer);
      if (!fired) elapsed.current += performance.now() - started;
    };
  }, [mode, active, last]);

  // Never run unseen.
  useEffect(() => {
    const el = rootRef.current;
    if (mode !== "playing" || !el) return;
    const pause = () => setMode("paused");
    const io = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) pause();
    });
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    io.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode]);

  // Keep the active stage in view when the rail scrolls (long flows on phones).
  useEffect(() => {
    const rail = railRef.current;
    const stage = stageRefs.current[active];
    if (!rail || !stage || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({
      left: stage.offsetLeft - (rail.clientWidth - stage.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active, reduce]);

  function select(index: number) {
    elapsed.current = 0;
    setMode("idle");
    setActive(index);
  }

  function toggleRun() {
    if (playing) {
      setMode("paused");
      return;
    }
    // Reduced motion: no timed walk-through, go straight to the outcome.
    if (reduce) {
      select(last);
      return;
    }
    if (mode === "idle") {
      elapsed.current = 0;
      if (active === last) setActive(0);
    }
    setMode("playing");
  }

  function onStageKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: last,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = (target + count) % count;
    select(next);
    stageRefs.current[next]?.focus();
  }

  // Track geometry: node centres sit at (i + 0.5) / count of the rail width.
  const band = 100 / count;
  const trackStyle: CSSProperties = { left: `${band / 2}%`, right: `${band / 2}%` };
  const fillStyle: CSSProperties = { left: `${band / 2}%`, width: `${active * band}%` };
  const segmentStyle = {
    left: `${(active + 0.5) * band}%`,
    width: `${band}%`,
    "--grow-duration": `${STAGE_MS}ms`,
    animationPlayState: playing ? "running" : "paused",
  } as CSSProperties;

  return (
    <WindowFrame
      label={data.label}
      status={
        <span
          aria-hidden="true"
          className="flex items-center gap-2 font-mono text-[0.68rem] tabular-nums text-muted"
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              playing ? "animate-pulse-dot bg-em" : "bg-faint",
            )}
          />
          {pad(active + 1)} / {pad(count)}
        </span>
      }
    >
      <div ref={rootRef} className="px-3 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
        {/* Stage rail: scrolls sideways only when the stages outgrow the window. */}
        <div ref={railRef} className="no-scrollbar overflow-x-auto overscroll-x-contain">
          <div className="relative min-w-full w-max px-1 pb-1 pt-1">
            <div
              aria-hidden="true"
              className="absolute top-[1.375rem] h-px bg-line-strong"
              style={trackStyle}
            />
            <div
              aria-hidden="true"
              className="absolute top-[1.375rem] h-px bg-em transition-[width] duration-700 ease-out-expo"
              style={fillStyle}
            />
            {mode !== "idle" && active < last && (
              <div
                key={active}
                aria-hidden="true"
                className="absolute top-[1.375rem] h-px origin-left animate-grow-x bg-linear-to-r from-em to-em/30"
                style={segmentStyle}
              />
            )}
            <ol
              className="relative grid"
              style={{ gridTemplateColumns: `repeat(${count}, minmax(4.75rem, 1fr))` }}
            >
              {stages.map((stage, i) => {
                const isActive = i === active;
                const done = i < active;
                return (
                  <li key={stage.label} className="flex justify-center">
                    <button
                      ref={(el) => {
                        stageRefs.current[i] = el;
                      }}
                      type="button"
                      aria-current={isActive ? "step" : undefined}
                      onClick={() => select(i)}
                      onKeyDown={(event) => onStageKey(event, i)}
                      className="group flex flex-col items-center rounded-xl px-1.5 pb-1.5 text-center"
                    >
                      {/* Only the active stage is lit; finished ones just swap their number for a
                          neutral check, so exactly one stage ever reads as active. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-9 place-items-center rounded-full border font-mono text-[0.68rem] tabular-nums transition-[background-color,border-color,color,box-shadow] duration-500",
                          isActive
                            ? "border-em bg-em text-bg shadow-glow"
                            : cn(
                                "border-line-strong bg-surface group-hover:border-em/50 group-hover:text-dim",
                                done ? "text-muted" : "text-faint",
                              ),
                        )}
                      >
                        {done ? <Check className="size-3.5" strokeWidth={2.5} /> : pad(i + 1)}
                      </span>
                      <span
                        className={cn(
                          "mt-3 whitespace-nowrap text-[0.8rem] font-medium leading-tight transition-colors duration-300",
                          isActive ? "text-ink" : "text-muted group-hover:text-dim",
                        )}
                      >
                        {stage.label}
                      </span>
                      <span className="mt-1 font-mono text-[0.66rem] tabular-nums text-faint">
                        {stage.time}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Detail panels: all rendered, one visible. */}
        <div className="mt-6 grid border-t border-line pt-6 sm:mt-7 sm:pt-7">
          {stages.map((stage, i) => {
            const isActive = i === active;
            return (
              <div
                key={stage.label}
                aria-hidden={!isActive}
                className={cn(
                  "col-start-1 row-start-1 px-1 transition-[opacity,translate,visibility] duration-500 ease-out-expo",
                  isActive ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0",
                )}
              >
                <p className="flex items-center gap-3 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">
                  <span className="text-em">{pad(i + 1)}</span>
                  <span aria-hidden="true" className="h-px w-6 bg-line-strong" />
                  {stage.label}
                  <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal text-faint">
                    <Clock aria-hidden="true" className="size-3" />
                    {stage.time}
                  </span>
                </p>
                <p className="mt-4 font-display text-xl font-medium leading-snug tracking-[-0.02em] text-ink text-balance sm:text-2xl">
                  {stage.title}
                </p>
                <p className="mt-2.5 max-w-xl text-[0.95rem] leading-relaxed text-dim text-pretty">
                  {stage.copy}
                </p>
                <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-white/[0.015]">
                  {kpiLabels.map((label, k) => (
                    <div key={label} className="flex min-w-0 flex-col-reverse gap-2 px-3 py-3.5 sm:px-5 sm:py-4">
                      <dt className="label-mono truncate text-[0.6rem] sm:text-[0.66rem]">{label}</dt>
                      <dd className="overflow-hidden py-0.5 font-display text-base font-medium leading-tight tracking-[-0.02em] tabular-nums sm:text-2xl">
                        <span
                          className={cn(
                            "block transition-transform duration-700 ease-out-expo",
                            isActive ? "translate-y-0" : "translate-y-full",
                            k === 0 && "text-muted line-through decoration-danger/60 decoration-[1.5px]",
                            k === 1 && "text-em",
                            k === 2 && "text-ink",
                          )}
                          style={{ transitionDelay: isActive ? `${140 + k * 80}ms` : "0ms" }}
                        >
                          {stage.kpis[k]}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </div>

      <ShowcaseFooter hint={data.hint}>
        <button type="button" onClick={toggleRun} className={controlClass}>
          {playing ? (
            <Pause aria-hidden="true" className="size-3.5" />
          ) : (
            <Play aria-hidden="true" className="size-3.5" />
          )}
          {playing ? pauseLabel : data.runLabel}
        </button>
      </ShowcaseFooter>
    </WindowFrame>
  );
}
