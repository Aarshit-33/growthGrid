"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { stageStore } from "../store";
import type { InstrumentSceneData } from "../types";
import { SHAPES, createDial, createInstrumentGeometry, createInstrumentMaterial, oneHot } from "./instrument-forms";
import { damp, useSceneReady, useSceneTime } from "./shared";

/* ─────────────────────────────────────────────────────────────
   About-page principle card: one principle's instrument, drawn
   exactly like the home explorer (same particle cloud, same
   framing, same dial ring with this principle's arc lit). It plays
   the home page's morph (each particle leaves on its own delay,
   loosens into a swirl and locks back into the form) when the card
   first scrolls into view and again whenever the card is hovered
   or clicked. While hovered, the signal pulses run faster and
   brighter, the dial lights up and the instrument leans toward
   the pointer.
   ───────────────────────────────────────────────────────────── */

/** The card this slot lives in (hover and pointer are read from the whole card). */
const CARD = "[data-principle-card]";
const FOV = 30;
const REPLAY = 1.7;

export function InstrumentCard({
  track,
  data,
}: {
  track: RefObject<HTMLDivElement | null>;
  data: InstrumentSceneData;
}) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const count = size.width < 220 ? 1700 : 2400;
  const shape = Math.max(0, SHAPES.indexOf(data.shape));

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const groupRef = useRef<THREE.Group>(null);
  const dialRef = useRef<THREE.Group>(null);
  const time = useSceneTime(6);
  useSceneReady("instrument");

  const geometry = useMemo(() => createInstrumentGeometry(count), [count]);
  const material = useMemo(() => {
    const m = createInstrumentMaterial();
    oneHot(shape, m.uniforms.uFrom.value);
    oneHot(shape, m.uniforms.uTo.value);
    return m;
  }, [shape]);
  const dial = useMemo(() => createDial(data.total), [data.total]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => dial.dispose(), [dial]);

  const live = useRef({
    /** Morph progress: 1 = at rest in the form; 0 starts a replay. */
    progress: 1,
    seen: false,
    hover: false,
    px: 0,
    py: 0,
    boost: 0,
    clock: 0,
    yaw: 0,
    pitch: 0,
  });

  // Hover, pointer and clicks come from the whole card, not just the 3D window.
  useEffect(() => {
    const card = track.current?.closest<HTMLElement>(CARD);
    if (!card) return;
    const s = live.current;
    const replay = () => {
      // Don't restart a replay that has barely begun.
      if (!stageStore.get().reduced && s.progress > 0.6) s.progress = 0;
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      s.hover = true;
      replay();
    };
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      s.px = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.py = -(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onLeave = () => {
      s.hover = false;
    };
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointermove", onMove, { passive: true });
    card.addEventListener("pointerleave", onLeave);
    card.addEventListener("click", replay);
    return () => {
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
      card.removeEventListener("click", replay);
    };
  }, [track]);

  useFrame((_, rawDelta) => {
    const cam = cameraRef.current;
    const group = groupRef.current;
    if (!cam || !group) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const t = time.current;

    // First time the card is properly on screen: assemble once.
    if (!s.seen) {
      const r = track.current?.getBoundingClientRect();
      if (r && r.top < window.innerHeight * 0.88 && r.bottom > window.innerHeight * 0.08) {
        s.seen = true;
        if (!reduced) s.progress = 0;
      }
    }

    if (reduced) s.progress = 1;
    else s.progress = Math.min(1, s.progress + dt / REPLAY);
    s.boost = reduced ? (s.hover ? 1 : 0) : damp(s.boost, s.hover ? 1 : 0, 4, dt);
    // Hover quickens the signal: the flow clock runs up to ~2× while hovered.
    s.clock += reduced ? 0 : dt * (1 + s.boost);

    const u = material.uniforms;
    u.uTime.value = reduced ? t : 6 + s.clock;
    u.uProgress.value = s.progress;
    u.uBoost.value = s.boost;

    // Same framing as the home explorer: the dial stays in frame at any aspect ratio.
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = size.width / Math.max(1, size.height);
    const dist = 13 * Math.max(1, 1.05 / aspect);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    u.uDist.value = dist;
    u.uScale.value = (size.height * dpr) / (2 * tan);

    // Gentle sway (as on the home page), leaning toward the pointer while hovered.
    const lean = s.hover && !reduced;
    s.yaw = damp(s.yaw, (reduced ? 0 : Math.sin(t * 0.23 + shape) * 0.35) + (lean ? s.px * 0.45 : 0), 2.4, dt);
    s.pitch = damp(s.pitch, (reduced ? 0 : Math.sin(t * 0.17 + shape) * 0.08) - (lean ? s.py * 0.25 : 0), 2.4, dt);
    group.rotation.set(s.pitch, s.yaw, 0);
    group.scale.setScalar(1 + s.boost * 0.05);

    // Dial: turns slowly; this principle's arc is lit, and hover brightens the ring.
    const dialGroup = dialRef.current;
    if (dialGroup) dialGroup.rotation.z = reduced ? 0 : t * 0.015 + s.clock * 0.01;
    dial.tickMaterial.opacity = 0.22 + s.boost * 0.28;
    dial.arcs.forEach((a, q) => {
      a.material.opacity = q === data.index ? 0.95 : 0.12 + s.boost * 0.1;
    });
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={FOV} near={0.1} far={80} position={[0, 0, 13]} />
      <group ref={groupRef}>
        <points key={count} geometry={geometry} material={material} frustumCulled={false} />
      </group>
      <group ref={dialRef}>
        <lineSegments geometry={dial.tickGeometry} material={dial.tickMaterial} />
      </group>
      {dial.arcs.map((a, q) => (
        <primitive key={q} object={a.line} />
      ))}
    </>
  );
}
