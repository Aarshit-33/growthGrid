"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { setSceneReady, stageStore, type SceneId } from "../store";

/** Brand palette. Colour uniforms go through THREE.Color, so values are linear. */
export const PALETTE = {
  bg: "#04070a",
  base: "#08130f",
  deep: "#0f6b47",
  em: "#3ce49a",
  hot: "#7dffc4",
  ink: "#f0f4f7",
} as const;

export const color = (hex: string) => new THREE.Color(hex);

/** Frame-rate independent exponential smoothing. */
export const damp = THREE.MathUtils.damp;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Scene time in seconds. It accumulates clamped deltas, so it survives the
 * stage pausing (R3F resets its clock when the frameloop restarts). Under
 * reduced motion it freezes at `still`.
 */
export function useSceneTime(still = 12) {
  const time = useRef(still);
  useFrame((_, delta) => {
    if (stageStore.get().reduced) {
      time.current = still;
      return;
    }
    time.current += Math.min(delta, 1 / 20);
  });
  return time;
}

/** Signal the slot once the first frame has been drawn (fades its fallback). */
export function useSceneReady(id: SceneId) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    // Wait two frames: the first one may be spent compiling shaders.
    if (frames.current === 2) window.requestAnimationFrame(() => setSceneReady(id, true));
  });
  useEffect(() => () => setSceneReady(id, false), [id]);
}

/** Scroll progress of an element through the viewport: 0 = top aligned, 1 = scrolled past. */
export function scrollProgress(el: HTMLElement | null): number {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height));
}

/** Soft round sprite (for glows), drawn once on a 2D canvas. */
export function glowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
