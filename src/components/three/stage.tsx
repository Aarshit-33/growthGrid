
"use client";

import { PerformanceMonitor, View } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { setConsoleFunction } from "three";
import { disableStage, slotRegistry } from "./store";

/* R3F 9.x (latest stable) still creates its store clock with THREE.Clock,
   which three r183+ reports as deprecated on every canvas mount. Our scenes
   never read that clock (they accumulate frame deltas instead), so drop just
   that one message and pass every other three.js log through untouched.
   Remove once R3F switches to THREE.Timer. */
setConsoleFunction((type, message, ...params) => {
  if (type === "warn" && typeof message === "string" && message.includes("Clock: This module has been deprecated")) return;
  const out = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  out(message, ...params);
});

/* ─────────────────────────────────────────────────────────────
   The one WebGL canvas for the page. It is fixed and transparent,
   sits under the content (z-0 vs the content wrapper's z-1), and
   draws each <SceneSlot>'s scene into that slot's rectangle
   (drei View + scissor). One context serves every scene, which
   is kind to mobile GPUs.
   Loaded lazily (next/dynamic, ssr:false) so three.js never
   touches the critical path.
   ───────────────────────────────────────────────────────────── */

/** Clears the whole buffer every frame so a view that moved or left
 *  can't leave a stale image behind on the fixed canvas. */
function ClearPass() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear(true, true, false);
  }, 0);
  return null;
}

/**
 * Stop the render loop when no slot is near the viewport or the tab is
 * hidden, and restart it when one comes back. After the last slot
 * leaves, the canvas is cleared once and then left idle, costing 0 ms
 * per frame.
 */
function FrameloopController() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    let visible = new Set<Element>();
    let io: IntersectionObserver | undefined;
    let sleepTimer: number | undefined;

    const apply = () => {
      window.clearTimeout(sleepTimer);
      if (visible.size > 0 && document.visibilityState === "visible") {
        setFrameloop("always");
        return;
      }
      // Give the views a few frames to notice they're off-screen, then clear
      // everything and sleep.
      sleepTimer = window.setTimeout(() => {
        gl.setScissorTest(false);
        gl.clear(true, true, false);
        setFrameloop("never");
      }, 350);
    };

    const observe = () => {
      io?.disconnect();
      visible = new Set();
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
          }
          apply();
        },
        { rootMargin: "15% 0px" },
      );
      slotRegistry.get().slots.forEach((el) => io?.observe(el));
    };

    observe();
    const unsubscribe = slotRegistry.subscribe(observe);
    document.addEventListener("visibilitychange", apply);
    return () => {
      unsubscribe();
      io?.disconnect();
      window.clearTimeout(sleepTimer);
      document.removeEventListener("visibilitychange", apply);
    };
  }, [gl, setFrameloop]);

  return null;
}

/**
 * A driver reset or GPU process crash drops the context and blanks the
 * canvas: hand every slot back to its static fallback instead. (Removed
 * on unmount, before R3F's own forceContextLoss() on dispose.)
 */
function ContextLossGuard() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = () => disableStage("WebGL context lost");
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  return null;
}

export default function StageCanvas() {
  // Start crisp, then step down if the device can't hold its frame rate.
  // Phones start a notch lower: their fill rate is the bottleneck.
  const [dpr, setDpr] = useState(() =>
    Math.min(window.devicePixelRatio || 1, window.matchMedia("(max-width: 767px)").matches ? 1.5 : 1.75),
  );

  return (
    <Canvas
      aria-hidden="true"
      className="gg-stage"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        // lvh: the canvas doesn't reallocate when mobile browser chrome shows or hides.
        height: "100lvh",
        pointerEvents: "none",
        zIndex: 0,
      }}
      dpr={dpr}
      flat
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        powerPreference: "high-performance",
      }}
      camera={{ position: [0, 0, 6], fov: 35 }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 120 } }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <PerformanceMonitor
        bounds={() => [45, 60]}
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(1, +(d - 0.25).toFixed(2)))}
        onFallback={() => setDpr(1)}
      />
      <ClearPass />
      <FrameloopController />
      <ContextLossGuard />
      <View.Port />
    </Canvas>
  );
}
