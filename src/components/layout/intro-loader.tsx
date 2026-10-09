"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { BrandMark, MARK_CELLS } from "@/components/layout/logo";
import { createStore, readyKey, slotRegistry, stageStore, useStore, type SceneId } from "@/components/three/store";
import type { BrandMarkImage } from "@/lib/brand";
import type { ImageAsset } from "@/lib/schemas/common";
import {
  INTRO_ATTR,
  INTRO_EXIT_MS,
  INTRO_MAX_MS,
  INTRO_MIN_MS,
  INTRO_PAGES,
  INTRO_SEEN_KEY,
  introGateScript,
  introState,
  type IntroState,
} from "./intro-gate";

const GATE_SCRIPT = introGateScript();

/* The loader's lifecycle for this page load. `null` until mounted, then the
   gate's verdict: "none" (no intro this time) or on → out → done. */
const introStore = createStore({ state: null as IntroState | "none" | null });

/** True while the loader covers the page or lifts off it: other overlays wait their turn. */
export function useIntroCovering(): boolean {
  return useStore(introStore, (s) => s.state === "on" || s.state === "out");
}

/** Input that means "let me in": the wait is skipped. */
const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchmove"] as const;

/** After the scenes report their first frame, a beat for their fade-in over
 *  the static fallbacks (slot.tsx) to get ahead of the reveal. */
const READY_BEAT_MS = 450;

/** Where the pre-boot CSS creep stops (globals.css › @keyframes intro-boot). */
const BOOT_CEILING = 0.24;

/** Laid out and at least partly on the first screen. */
function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/** The page's intro scenes whose slots will actually draw on the first screen. */
function firstScreenScenes(): SceneId[] {
  const wanted = INTRO_PAGES[window.location.pathname] ?? [];
  const slots = [...slotRegistry.get().slots];
  return wanted.filter((id) => slots.some(([key, el]) => (key === id || key.startsWith(`${id}:`)) && onScreen(el)));
}

const approach = (elapsed: number, tau: number) => 1 - Math.exp(-Math.max(0, elapsed) / tau);

/**
 * Where the meter heads. Download progress isn't observable for dynamic
 * chunks, so each loading phase eases toward its own ceiling: waiting for
 * the stage, the 3D engine arriving, the scenes building. The run to 100
 * comes from the scenes themselves reporting their first frame.
 */
function meterTarget(now: number, marks: { stage?: number; canvas?: number }, ready: boolean): number {
  if (ready) return 1;
  if (marks.stage === undefined && stageStore.get().enabled) marks.stage = now;
  if (marks.canvas === undefined && document.querySelector(".gg-stage")) marks.canvas = now;
  if (marks.canvas !== undefined) return 0.64 + 0.3 * approach(now - marks.canvas, 2600);
  if (marks.stage !== undefined) return 0.2 + 0.44 * approach(now - marks.stage, 3200);
  return 0.2 * approach(now, 700);
}

/** The built-in grid mark, cell by cell: it assembles, then its diagonal keeps growing. */
function GrowingMark() {
  return (
    <svg viewBox="0 0 24 24" className="intro-mark" aria-hidden="true">
      {MARK_CELLS.map(([x, y, o], i) => (
        <rect
          key={i}
          x={1 + x * 8}
          y={1 + y * 8}
          width="6"
          height="6"
          rx="1.4"
          data-lit={o === 1 ? "" : undefined}
          style={
            {
              "--o": o,
              // Assembles from the bottom-left corner up, along the diagonal.
              "--d": `${(x + (2 - y)) * 85}ms`,
              "--g": `${x * 260}ms`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

/**
 * Intro loader: covers the first screen while its 3D props load, so a slow
 * network never shows the copy over empty placeholders. Whether it runs at
 * all is decided before first paint by the gate script (intro-gate.ts): only
 * where the 3D will actually run. Everything under it renders and paints as
 * usual; it leaves once the scenes on screen have drawn, the 3D is ruled
 * out, the cap passes, or the visitor clicks, scrolls or presses a key.
 */
export function IntroLoader({
  mark,
  lockup = null,
  wordmark,
}: {
  mark: BrandMarkImage | null;
  /** The stacked logo (Branding): takes the place of the mark and the wordmark. */
  lockup?: Pick<ImageAsset, "src" | "width" | "height"> | null;
  wordmark: string;
}) {
  const state = useStore(introStore, (s) => s.state);
  const rootRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  /** Scenes being waited for (null: not measured yet). */
  const scenesRef = useRef<SceneId[] | null>(null);

  // Adopt the gate's verdict once per page load.
  useLayoutEffect(() => {
    if (introStore.get().state === null) introStore.set({ state: introState() ?? "none" });
  }, []);

  // <html data-intro> follows the state. (In development React's remount can
  // reset attributes the inline script put on <html>; this puts them back.)
  useLayoutEffect(() => {
    if (state === "on" || state === "out" || state === "done") document.documentElement.setAttribute(INTRO_ATTR, state);
  }, [state]);

  // Covering: wait for the scenes on the first screen.
  useEffect(() => {
    if (state !== "on") return;
    const timers: number[] = [];
    let settled = false;

    const finish = () => {
      if (introStore.get().state !== "on") return;
      try {
        window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      } catch {
        /* storage unavailable: the intro may play again next load */
      }
      introStore.set({ state: "out" });
    };
    // The 3D is ready, or won't come: leave once the minimum beat has passed.
    const settle = (beat: number) => {
      if (settled) return;
      settled = true;
      timers.push(window.setTimeout(finish, Math.max(beat, INTRO_MIN_MS - performance.now())));
    };
    const check = () => {
      const s = stageStore.get();
      const scenes = scenesRef.current;
      if (s.off) settle(0);
      else if (scenes && scenes.every((id) => s[readyKey(id)])) settle(scenes.length ? READY_BEAT_MS : 0);
    };

    // Measured a frame after mount, once every slot has registered and laid out.
    const raf = window.requestAnimationFrame(() => {
      scenesRef.current = firstScreenScenes();
      check();
    });
    const unsubscribe = stageStore.subscribe(check);
    timers.push(window.setTimeout(finish, Math.max(0, INTRO_MAX_MS - performance.now())));
    const skip = () => finish();
    for (const type of SKIP_EVENTS) window.addEventListener(type, skip, { capture: true, passive: true });

    return () => {
      window.cancelAnimationFrame(raf);
      unsubscribe();
      timers.forEach((t) => window.clearTimeout(t));
      for (const type of SKIP_EVENTS) window.removeEventListener(type, skip, { capture: true });
    };
  }, [state]);

  // Lifting: done once the curtain has cleared the screen.
  useEffect(() => {
    if (state !== "out") return;
    const timer = window.setTimeout(() => introStore.set({ state: "done" }), INTRO_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // The meter, written straight to the DOM every frame (no re-renders).
  const metering = state === "on" || state === "out";
  useEffect(() => {
    const root = rootRef.current;
    const pct = pctRef.current;
    if (!metering || !root || !pct) return;
    const marks: { stage?: number; canvas?: number } = {};
    let shown = 0;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      // A frame's timestamp can predate this effect (hydration held the frame up).
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      // Carry on from the CSS creep that ran until the app booted (globals.css),
      // read each frame until past its ceiling: right after hydration's long
      // task it can still be catching up, and the bar shows whichever is ahead.
      if (shown < BOOT_CEILING) {
        const boot = Number.parseInt(getComputedStyle(root).getPropertyValue("--intro-boot"), 10);
        if (Number.isFinite(boot)) shown = Math.max(shown, boot / 100);
      }
      const s = stageStore.get();
      const scenes = scenesRef.current;
      const ready = introStore.get().state !== "on" || s.off || (scenes !== null && scenes.every((id) => s[readyKey(id)]));
      const target = meterTarget(now, marks, ready);
      // Never backwards.
      shown = Math.max(shown, shown + (target - shown) * (1 - Math.exp(-dt * (ready ? 8 : 2.5))));
      if (target === 1 && shown > 0.996) shown = 1;
      root.style.setProperty("--intro-p", shown.toFixed(4));
      pct.textContent = String(Math.round(shown * 100)).padStart(3, "0");
      if (shown < 1 || introStore.get().state === "on") raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [metering]);

  if (state === "none" || state === "done") return null;

  return (
    <>
      {/* The gate runs while the HTML is parsed, before first paint. It is
          inert when React renders it in the browser (text/plain), the way the
          Next.js guide on preventing flash before hydration does it. */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: GATE_SCRIPT }}
      />
      <div ref={rootRef} className="intro" aria-hidden="true">
        <div className="intro-field blueprint fade-radial" />
        <div className="intro-scan" />
        <span className="crosshair intro-corner left-[var(--gutter)] top-[var(--gutter)]" />
        <span className="crosshair intro-corner right-[var(--gutter)] top-[var(--gutter)]" />
        <span className="crosshair intro-corner bottom-[var(--gutter)] left-[var(--gutter)]" />
        <span className="crosshair intro-corner bottom-[var(--gutter)] right-[var(--gutter)]" />

        <div className="intro-core">
          {lockup ? (
            // High priority: the panel starts hidden, which would otherwise queue it
            // behind everything else, and slow networks are why the intro exists.
            // eslint-disable-next-line @next/next/no-img-element -- brand image in any format, sized by CSS
            <img
              src={lockup.src}
              alt=""
              width={lockup.width}
              height={lockup.height}
              decoding="async"
              fetchPriority="high"
              className="intro-lockup"
            />
          ) : (
            <>
              {mark ? (
                <span className="intro-brand">
                  <BrandMark mark={mark} className="size-14" />
                </span>
              ) : (
                <GrowingMark />
              )}
              <p className="intro-word">{wordmark}</p>
            </>
          )}
          <div className="intro-meter">
            <span className="intro-track">
              <span className="intro-fill" />
            </span>
            {/* Empty until the meter writes it: CSS shows its own count meanwhile. */}
            <span ref={pctRef} className="intro-pct" />
          </div>
        </div>
      </div>
    </>
  );
}
