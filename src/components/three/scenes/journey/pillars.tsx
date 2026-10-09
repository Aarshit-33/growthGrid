"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PILLAR_ATTR, pointers, slotRegistry, stageStore } from "../../store";
import type { PillarsSceneData } from "../../types";
import { PALETTE, clamp01, color, damp, glowTexture, useSceneReady, useSceneTime } from "../shared";
import { GRID, GridGround, createGlassGeometry, createGlassMaterial, flush, setGlow, useCompact, useDispose, type OpacityCtl } from "./kit";

/* ─────────────────────────────────────────────────────────────
   About · Stats: "the proof, step by step". One glass pillar per
   number, each a couple of floors taller than the last, so the
   row reads as a staircase. The floors rise in as the numbers
   count up; the stat under the pointer (or keyboard focus) lights
   its pillar and crowns it with a halo. Heights are the story's
   rhythm, not a chart: the numbers themselves live in the DOM.
   ───────────────────────────────────────────────────────────── */

const FLOOR = 0.34;
const WIDTH = GRID * 1.05;
const PITCH = GRID * 2;
/** Seconds the floors take to rise (matches the counters). */
const RISE = 1.8;

const floorsFor = (i: number) => 2 + i * 2;

export function PillarsScene({ data }: { data: PillarsSceneData }) {
  const compact = useCompact();
  const time = useSceneTime(6);
  useSceneReady("pillars");

  const count = Math.max(1, Math.min(8, data.count));
  const floors = useMemo(() => Array.from({ length: count }, (_, i) => floorsFor(i)), [count]);
  const total = floors.reduce((a, b) => a + b, 0);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const spritesRef = useRef<(THREE.Sprite | null)[]>([]);
  const geometry = useMemo(() => createGlassGeometry(total), [total]);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.1 }), []);
  const glow = useMemo(() => glowTexture(), []);
  const spriteMaterials = useMemo(
    () =>
      floors.map(
        () =>
          new THREE.SpriteMaterial({
            map: glow,
            color: color(PALETTE.hot),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0,
          }),
      ),
    [floors, glow],
  );
  useDispose(geometry, material, glow);
  useEffect(() => () => spriteMaterials.forEach((m) => m.dispose()), [spriteMaterials]);

  const obj = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const deep = useMemo(() => color(PALETTE.deep), []);
  const em = useMemo(() => color(PALETTE.em), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const ground = useRef<OpacityCtl>({ opacity: 0.55 });
  const hover = useRef(-1);
  const live = useRef({
    /** Seconds since the pillars came into view (-1: not yet). */
    since: -1,
    lit: new Float32Array(count),
    parX: 0,
    parY: 0,
  });

  // The stat cell under the pointer or keyboard focus.
  useEffect(() => {
    const find = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest(`[${PILLAR_ATTR}]`) : null;
      return el ? Number(el.getAttribute(PILLAR_ATTR)) : -1;
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover.current = find(e.target);
    };
    const focus = (e: FocusEvent) => {
      hover.current = find(e.target);
    };
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
    };
  }, []);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    const cam = cameraRef.current;
    if (!mesh || !cam) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const t = time.current;
    const s = live.current;

    // Start rising once the slot is well into the viewport.
    if (s.since < 0) {
      const el = slotRegistry.get().slots.get("pillars");
      const r = el?.getBoundingClientRect();
      if (r && r.top < window.innerHeight * 0.85 && r.bottom > 0) s.since = 0;
    } else s.since += dt;
    const elapsed = reduced ? RISE * 4 : Math.max(0, s.since);

    // Idle: a slow sweep up the row; hover takes over.
    const idle = elapsed > RISE + 0.6 && !reduced ? Math.floor((t - RISE) / 2.4) % count : -1;
    const focus = hover.current >= 0 && hover.current < count ? hover.current : -1;

    let k = 0;
    const x0 = -((count - 1) * PITCH) / 2;
    floors.forEach((n, i) => {
      // Staggered like the stat cells' reveal.
      const grow = clamp01((elapsed - i * 0.09) / RISE);
      const eased = 1 - Math.pow(1 - grow, 3);
      const want = i === focus ? 1 : i === idle && focus < 0 ? 0.45 : 0;
      s.lit[i] = reduced ? want : damp(s.lit[i], want, 6, dt);
      const lit = s.lit[i];
      const x = x0 + i * PITCH;
      const shown = eased * n;
      for (let f = 0; f < n; f++, k++) {
        const a = clamp01(shown - f);
        obj.position.set(x, f * FLOOR + (FLOOR * a) / 2 + 0.01, 0);
        obj.rotation.set(0, 0, 0);
        const w = WIDTH * (a > 0.001 ? 1 : 0) * (1 + lit * 0.04);
        obj.scale.set(w, FLOOR * a * 0.94, w);
        obj.updateMatrix();
        mesh.setMatrixAt(k, obj.matrix);
        const top = f === n - 1;
        c.copy(deep).lerp(em, 0.45 + (f / n) * 0.4 + lit * 0.3);
        mesh.setColorAt(k, c.multiplyScalar(0.75 + lit * 0.4));
        setGlow(mesh, k, Math.min(1, (top ? 0.55 : 0.08) * a + lit * 0.5));
      }
      const sprite = spritesRef.current[i];
      if (sprite) {
        sprite.position.set(x, shown * FLOOR + 0.08, 0);
        const pulse = reduced ? 0.5 : Math.sin(t * 1.8 + i) * 0.5 + 0.5;
        spriteMaterials[i].opacity = eased * (0.18 + pulse * 0.08 + lit * 0.6);
        const size = 1 + lit * 1.1;
        sprite.scale.set(size, size, 1);
      }
    });
    flush(mesh);

    // A three-quarter view along the row; a touch of parallax.
    const p = pointers.pillars;
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y : 0, 2.5, dt);
    const tallest = floors[count - 1] * FLOOR;
    const a = Math.PI * 0.5 - 0.42 + (reduced ? 0 : Math.sin(t * 0.18) * 0.06) + s.parX * 0.2;
    const r = compact ? 10.4 : 9.2;
    cam.position.set(Math.cos(a) * r, tallest * 0.75 + 0.9 + s.parY * 0.4, Math.sin(a) * r);
    look.set(0, tallest * 0.55, 0);
    cam.lookAt(look);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={compact ? 34 : 30} near={0.1} far={50} />
      <GridGround ctl={ground} radius={7} />
      <instancedMesh ref={meshRef} args={[geometry, material, total]} frustumCulled={false} />
      {floors.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            spritesRef.current[i] = el;
          }}
          material={spriteMaterials[i]}
        />
      ))}
    </>
  );
}
