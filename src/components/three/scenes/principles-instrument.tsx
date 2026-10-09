"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { pointers, principlesStore, stageStore } from "../store";
import type { PrinciplesSceneData } from "../types";
import { SHAPES, createDial, createInstrumentGeometry, createInstrumentMaterial, oneHot } from "./instrument-forms";
import { damp, useSceneReady, useSceneTime } from "./shared";

/* ─────────────────────────────────────────────────────────────
   Principles instrument: a single cloud of particles that
   re-forms into each principle's "instrument". Every particle
   stores its place in all four forms, so a morph is one uniform
   change; each particle leaves on its own delay, loosens into a
   swirl mid-flight and locks into the new form. Signal pulses
   travel along every form in the direction the idea "flows".
   ───────────────────────────────────────────────────────────── */

export function PrinciplesInstrument({
  data,
}: {
  track: RefObject<HTMLDivElement | null>;
  data: PrinciplesSceneData;
}) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const compact = size.width < 640;
  const count = compact ? 1900 : 3400;
  const fov = 30;

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const groupRef = useRef<THREE.Group>(null);
  const dialRef = useRef<THREE.Group>(null);
  const time = useSceneTime(6);
  useSceneReady("principles");

  const geometry = useMemo(() => createInstrumentGeometry(count), [count]);
  const material = useMemo(() => createInstrumentMaterial(), []);

  /* Dial: tick ring plus one arc per principle; the active arc lights up. */
  const dial = useMemo(() => createDial(data.shapes.length), [data.shapes.length]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => dial.dispose(), [dial]);

  const live = useRef({
    from: 0,
    to: 0,
    progress: 1,
    taps: pointers.principles.taps,
    yaw: 0,
    pitch: 0,
    initialised: false,
  });
  const vec = useMemo(() => new THREE.Vector4(), []);

  useFrame((_, rawDelta) => {
    const cam = cameraRef.current;
    const group = groupRef.current;
    if (!cam || !group) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const t = time.current;
    const p = pointers.principles;

    // Tapping the instrument itself cycles to the next principle.
    if (p.taps !== s.taps) {
      s.taps = p.taps;
      const total = data.shapes.length;
      if (total > 0) principlesStore.set((st) => ({ active: (st.active + 1) % total }));
    }

    const active = principlesStore.get().active;
    const target = Math.max(0, SHAPES.indexOf(data.shapes[active] ?? "prism"));
    if (!s.initialised) {
      s.from = s.to = target;
      s.initialised = true;
    }
    if (reduced) {
      s.from = s.to = target;
      s.progress = 1;
    } else {
      if (s.progress >= 1 && target !== s.to) {
        s.from = s.to;
        s.to = target;
        s.progress = 0;
      }
      // Finish quickly if another change is already queued.
      const speed = target !== s.to ? 1 / 0.7 : 1 / 1.7;
      s.progress = Math.min(1, s.progress + dt * speed);
    }

    const u = material.uniforms;
    u.uTime.value = t;
    u.uProgress.value = s.progress;
    oneHot(s.from, vec);
    u.uFrom.value.copy(vec);
    oneHot(s.to, vec);
    u.uTo.value.copy(vec);

    // Camera distance keeps the dial in frame at any aspect ratio.
    const aspect = size.width / Math.max(1, size.height);
    const dist = 13 * Math.max(1, 1.05 / aspect);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    u.uDist.value = dist;
    u.uScale.value = (size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));

    // Gentle sway, leaning toward the pointer.
    const mouse = p.inside && p.type === "mouse" && !reduced;
    s.yaw = damp(s.yaw, (reduced ? 0 : Math.sin(t * 0.23) * 0.35) + (mouse ? p.x * 0.45 : 0), 2.4, dt);
    s.pitch = damp(s.pitch, (reduced ? 0 : Math.sin(t * 0.17) * 0.08) - (mouse ? p.y * 0.25 : 0), 2.4, dt);
    group.rotation.set(s.pitch, s.yaw, 0);

    const dialGroup = dialRef.current;
    if (dialGroup) dialGroup.rotation.z = reduced ? 0 : t * 0.015;
    dial.arcs.forEach((a, q) => {
      a.material.opacity = damp(a.material.opacity, q === active ? 0.95 : 0.12, 5, dt);
    });
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={fov} near={0.1} far={80} position={[0, 0, 13]} />
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
