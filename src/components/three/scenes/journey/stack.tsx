"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointers, stageStore } from "../../store";
import type { StackSceneData } from "../../types";
import { PALETTE, clamp01, color, damp, useSceneReady, useSceneTime } from "../shared";
import { GridGround, createGlassGeometry, createGlassMaterial, flush, setGlow, useCompact, useDispose, type OpacityCtl } from "./kit";

/* ─────────────────────────────────────────────────────────────
   Services: "the blueprint". The same six glass layers as the home
   journey's Blueprint chapter, one per service, bottom to top.
   The layer in focus opens the stack like a drawer and a small
   motif made of the same glass boxes rises on it, saying what that
   service builds:
     Digital products   dashboard panels and live bars
     Websites           stacked pages
     Mobile apps        a device slab and floating app tiles
     AI & automation    a lattice of nodes
     Business systems   linked modules
     Modernization      an old block, rebuilt piece by piece
   Index: the service row under the pointer (or keyboard focus) is
   in focus; otherwise the stack slowly cycles through all six.
   Detail: that page's service is lifted out and stays there.
   ───────────────────────────────────────────────────────────── */

const PITCH = 0.36;
const BASE_Y = 0.3;
const THICK = 0.1;
const HOVER_ATTR = "data-stack-layer";

/** Motif boxes in layer units: x, z, width, depth (× layer size); height, lift (world units); dim. */
type Box = readonly [number, number, number, number, number, number, number?];

const MOTIFS: Record<string, readonly Box[]> = {
  "digital-products": [
    [-0.16, -0.14, 0.46, 0.32, 0.05, 0],
    [0.24, -0.16, 0.24, 0.26, 0.05, 0],
    [-0.27, 0.2, 0.09, 0.09, 0.3, 0],
    [-0.13, 0.2, 0.09, 0.09, 0.55, 0],
    [0.01, 0.2, 0.09, 0.09, 0.4, 0],
    [0.15, 0.2, 0.09, 0.09, 0.72, 0],
    [0.29, 0.2, 0.09, 0.09, 0.5, 0],
  ],
  websites: [
    [-0.07, 0.06, 0.62, 0.44, 0.04, 0.04],
    [0, 0, 0.62, 0.44, 0.04, 0.26],
    [0.07, -0.06, 0.62, 0.44, 0.04, 0.48],
    [0.07, -0.22, 0.5, 0.06, 0.05, 0.53],
    [-0.06, 0.02, 0.24, 0.2, 0.05, 0.53],
    [0.2, 0.02, 0.16, 0.2, 0.05, 0.53],
  ],
  "mobile-apps": [
    [-0.1, 0, 0.26, 0.06, 0.82, 0],
    [-0.1, 0.035, 0.2, 0.02, 0.62, 0.1],
    [0.2, -0.12, 0.1, 0.1, 0.1, 0.55],
    [0.3, 0.06, 0.1, 0.1, 0.1, 0.35],
    [0.16, 0.18, 0.1, 0.1, 0.1, 0.18],
  ],
  "ai-automation": [
    [-0.26, -0.26, 0.1, 0.1, 0.1, 0.1],
    [0, -0.26, 0.1, 0.1, 0.1, 0.42],
    [0.26, -0.26, 0.1, 0.1, 0.1, 0.22],
    [-0.26, 0, 0.1, 0.1, 0.1, 0.5],
    [0, 0, 0.14, 0.14, 0.14, 0.28],
    [0.26, 0, 0.1, 0.1, 0.1, 0.62],
    [-0.26, 0.26, 0.1, 0.1, 0.1, 0.3],
    [0, 0.26, 0.1, 0.1, 0.1, 0.12],
    [0.26, 0.26, 0.1, 0.1, 0.1, 0.46],
  ],
  "business-systems": [
    [-0.33, 0.06, 0.16, 0.16, 0.32, 0],
    [-0.11, -0.06, 0.16, 0.16, 0.44, 0],
    [0.11, 0.06, 0.16, 0.16, 0.28, 0],
    [0.33, -0.06, 0.16, 0.16, 0.38, 0],
    [-0.22, 0, 0.08, 0.03, 0.03, 0.18],
    [0, 0, 0.08, 0.03, 0.03, 0.18],
    [0.22, 0, 0.08, 0.03, 0.03, 0.18],
  ],
  modernization: [
    [-0.14, 0, 0.4, 0.4, 0.52, 0, 1],
    [0.2, -0.12, 0.14, 0.14, 0.14, 0],
    [0.2, 0.06, 0.14, 0.14, 0.14, 0],
    [0.2, -0.12, 0.14, 0.14, 0.14, 0.17],
    [0.2, 0.06, 0.14, 0.14, 0.14, 0.17],
    [0.2, -0.12, 0.14, 0.14, 0.14, 0.34],
    [0.34, -0.03, 0.1, 0.1, 0.1, 0],
  ],
};
const FALLBACK = MOTIFS["ai-automation"];
const MAX_BOXES = Math.max(...Object.values(MOTIFS).map((m) => m.length));

export function StackScene({ data }: { data: StackSceneData }) {
  const compact = useCompact();
  const time = useSceneTime(10);
  useSceneReady("stack");

  const accentKey = data.accents.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accents = useMemo(() => data.accents.slice(0, 8), [accentKey]);
  const count = Math.max(1, accents.length);
  const detail = data.active >= 0 && data.active < count;
  const gap = detail ? 1.2 : 0.95;

  const layersRef = useRef<THREE.InstancedMesh>(null);
  const motifRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const layerGeometry = useMemo(() => createGlassGeometry(count), [count]);
  const layerMaterial = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.08, fog: [14, 30] }), []);
  // White bases: each motif box takes its colour from the service accent alone.
  const motifGeometry = useMemo(() => createGlassGeometry(MAX_BOXES), []);
  const motifMaterial = useMemo(() => createGlassMaterial({ face: "#cfe9dd", edge: "#ffffff", faceAlpha: 0.12, fog: [14, 30] }), []);
  useDispose(layerGeometry, layerMaterial, motifGeometry, motifMaterial);

  const palette = useMemo(() => accents.map((a) => color(a)), [accents]);
  const em = useMemo(() => color(PALETTE.em), []);
  const c = useMemo(() => new THREE.Color(), []);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const ground = useRef<OpacityCtl>({ opacity: 0.5 });
  const hover = useRef(-1);
  const live = useRef({
    open: new Float32Array(count),
    shown: detail ? data.active : 0,
    appear: 0,
    intro: 0,
    parX: 0,
    parY: 0,
  });

  // Index page: the service row under the pointer or keyboard focus.
  useEffect(() => {
    if (detail) return;
    const find = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest(`[${HOVER_ATTR}]`) : null;
      return el ? Number(el.getAttribute(HOVER_ATTR)) : -1;
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover.current = find(e.target);
    };
    const focus = (e: FocusEvent) => {
      hover.current = find(e.target);
    };
    const blur = (e: FocusEvent) => {
      hover.current = find(e.relatedTarget);
    };
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
    };
  }, [detail]);

  useFrame((_, rawDelta) => {
    const layers = layersRef.current;
    const motif = motifRef.current;
    const group = groupRef.current;
    const cam = cameraRef.current;
    if (!layers || !motif || !group || !cam) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const t = time.current;
    const s = live.current;

    // Which layer is open: the page's service, the hovered row, or a slow cycle.
    let focus: number;
    if (detail) focus = data.active;
    else if (hover.current >= 0 && hover.current < count) focus = hover.current;
    else focus = reduced ? 0 : Math.floor(t / 3.2) % count;

    s.intro = reduced ? 1 : Math.min(1, s.intro + dt / 1.8);
    for (let i = 0; i < count; i++) {
      const target = i === focus ? 1 : 0;
      s.open[i] = reduced ? target : damp(s.open[i], target, 5, dt);
    }
    // The motif swaps once the old one has sunk back into its layer.
    const want = focus === s.shown ? 1 : 0;
    s.appear = reduced ? want : damp(s.appear, want, want ? 5 : 9, dt);
    if (!want && s.appear < 0.04) s.shown = focus;

    const layerY: number[] = [];
    let raised = 0;
    for (let i = 0; i < count; i++) {
      const r = 1 - Math.pow(1 - clamp01(s.intro * 1.6 - i * 0.1), 3);
      const y = (BASE_Y + i * PITCH) * r + raised + s.open[i] * 0.08;
      layerY.push(y);
      // Layers above the open one move up to make room for its motif.
      raised += s.open[i] * gap;
      const size = ((compact ? 2.7 : 3) - i * 0.2) * (0.6 + 0.4 * r);
      obj.position.set(0, y, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(size, THICK, size);
      obj.updateMatrix();
      layers.setMatrixAt(i, obj.matrix);
      const o = s.open[i];
      c.copy(em).lerp(palette[i] ?? em, 0.3 + o * 0.7);
      c.multiplyScalar(o > 0.5 ? 1 : detail ? 0.38 : 0.55 + o * 0.45);
      layers.setColorAt(i, c);
      setGlow(layers, i, o * 0.85 + 0.05);
    }
    flush(layers);

    // The motif stands on the open layer.
    const k = s.shown;
    const boxes = MOTIFS[data.motifs[k] ?? ""] ?? FALLBACK;
    const size = ((compact ? 2.7 : 3) - k * 0.2) * 0.95;
    // Taller in the detail drawer, which opens wider.
    const tall = detail ? 1.25 : 1.05;
    const top = (layerY[k] ?? 0) + THICK / 2;
    const accent = palette[k] ?? em;
    for (let j = 0; j < MAX_BOXES; j++) {
      const b = boxes[j];
      if (!b) {
        obj.scale.set(0, 0, 0);
        obj.updateMatrix();
        motif.setMatrixAt(j, obj.matrix);
        continue;
      }
      const [x, z, w, d, h, lift, dim] = b;
      const a = clamp01(s.appear * 1.4 - j * 0.05);
      const e = 1 - Math.pow(1 - a, 3);
      obj.position.set(x * size, top + (lift + h / 2) * tall * e, z * size);
      obj.scale.set(w * size * (a > 0.01 ? 1 : 0), h * tall * e, d * size * (a > 0.01 ? 1 : 0));
      obj.updateMatrix();
      motif.setMatrixAt(j, obj.matrix);
      c.copy(accent).multiplyScalar(dim ? 0.35 : 0.95);
      motif.setColorAt(j, c);
      setGlow(motif, j, dim ? 0.02 : 0.35 + e * 0.35);
    }
    flush(motif);

    // Slow turn plus parallax; the camera frames the open drawer.
    const p = pointers.stack;
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y : 0, 2.5, dt);
    group.rotation.y = (reduced ? 0.55 : 0.55 + t * 0.09) + s.parX * 0.45;
    const stackTop = BASE_Y + (count - 1) * PITCH + gap;
    const r = detail ? 8.4 : compact ? 10.2 : 9.6;
    cam.position.set(0, 5.4 + s.parY * 0.6, r);
    look.set(0, stackTop * 0.42 + ((layerY[focus] ?? 0) - stackTop * 0.42) * 0.25, 0);
    cam.lookAt(look);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={36} near={0.1} far={50} />
      <GridGround ctl={ground} radius={7} />
      <group ref={groupRef}>
        <instancedMesh ref={layersRef} args={[layerGeometry, layerMaterial, count]} frustumCulled={false} />
        <instancedMesh ref={motifRef} args={[motifGeometry, motifMaterial, MAX_BOXES]} frustumCulled={false} />
      </group>
    </>
  );
}
