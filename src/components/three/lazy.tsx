"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { introState } from "@/components/layout/intro-gate";
import { SceneBoundary } from "./boundary";
import { onIdle, probeGfx } from "./gfx";
import { NOT_READY, disableStage, stageStore, useStore } from "./store";

/* The canvas chunk (three.js + R3F + drei) only loads after the page is
   idle and only on hardware-accelerated WebGL (see gfx.ts: software
   rasterisers cost seconds of main-thread time, so the CSS fallbacks are
   the better experience there). Until then, and forever on unsupported,
   no-GPU and data-saver devices, every slot shows its CSS fallback.
   Under the intro loader (layout/intro-loader.tsx) it loads right away. */
const StageCanvas = dynamic(() => import("./stage"), { ssr: false, loading: () => null });

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/** Mounts the shared WebGL stage for the page (render once per page). */
export function Stage() {
  const enabled = useStore(stageStore, (s) => s.enabled);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => stageStore.set({ reduced: motion.matches });
    syncMotion();
    motion.addEventListener("change", syncMotion);

    const start = () => {
      if (probeGfx() === "full" && !saveData()) stageStore.set({ enabled: true });
      else stageStore.set({ off: true });
    };
    // Under the intro loader (layout/intro-loader.tsx) the page is covered
    // until the 3D draws, so there's no first paint to protect: start now.
    let cancel = () => {};
    if (introState() === "on") start();
    else cancel = onIdle(start);

    return () => {
      motion.removeEventListener("change", syncMotion);
      cancel();
      stageStore.set({ enabled: false, off: false, ...NOT_READY });
    };
  }, []);

  // A failure anywhere in the 3D tree only costs the 3D: the fallbacks return.
  return enabled ? (
    <SceneBoundary onError={disableStage}>
      <StageCanvas />
    </SceneBoundary>
  ) : null;
}
