"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointers, stageStore, workCity } from "../../store";
import type { CitySceneData } from "../../types";
import { PALETTE, clamp01, color, damp, glowTexture, useSceneReady, useSceneTime } from "../shared";
import { GRID, GridGround, createGlassGeometry, createGlassMaterial, flush, setGlow, useCompact, useDispose, type OpacityCtl } from "./kit";

/* ─────────────────────────────────────────────────────────────
   Work index: "the grid city". Every case study is one tower
   standing on the shared grid, in list order, built with the same
   generic floors as the home journey's Structures chapter (no
   bespoke model per project). The index drives it:
     filter  towers that don't match sink back to their footing
             and dim; matching ones stand tall and glow.
     hover   the case study under the pointer (or keyboard focus)
             lights up and grows its crowning floor.
   ───────────────────────────────────────────────────────────── */

/** Tower heights, cycled, so the skyline reads as varied but orderly. */
const FLOORS = [5, 7, 4, 6, 8, 5] as const;
const PITCH = 0.4;
const FOOT = 0.9;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function CityScene({ data }: { data: CitySceneData }) {
  const compact = useCompact();
  const time = useSceneTime(10);
  useSceneReady("city");

  const count = Math.max(1, Math.min(12, data.count));
  const towers = useMemo(() => {
    // A compact city block, two rows deep, in list order, snapped to the grid.
    const cols = Math.ceil(count / 2);
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, i) => ({
      x: ((i % cols) - (cols - 1) / 2) * GRID * 2,
      z: (Math.floor(i / cols) - (rows - 1) / 2) * GRID * 2,
      // +1: the crowning floor that only builds while the tower is in focus.
      of: FLOORS[i % FLOORS.length],
    }));
  }, [count]);
  const floors = useMemo(
    () => towers.flatMap((t, tower) => Array.from({ length: t.of + 1 }, (_, floor) => ({ tower, floor }))),
    [towers],
  );
  const total = floors.length;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const geometry = useMemo(() => createGlassGeometry(total), [total]);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.1, fog: [14, 30] }), []);
  const glow = useMemo(() => glowTexture(), []);
  const haloMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glow,
        color: color(PALETTE.em),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    [glow],
  );
  useDispose(geometry, material, glow, haloMaterial);

  const ground = useRef<OpacityCtl>({ opacity: 0.6 });
  const obj = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const look = useMemo(() => new THREE.Vector3(0, 1.3, 0), []);
  const live = useRef({
    intro: 0,
    height: new Float32Array(count).fill(1),
    focus: new Float32Array(count),
    halo: 0,
    haloX: 0,
    haloZ: 0,
    parX: 0,
    parY: 0,
  });

  // Leaving the page clears what the index wrote.
  useEffect(
    () => () => {
      workCity.hover = -1;
      workCity.match = [];
    },
    [],
  );

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    const cam = cameraRef.current;
    const halo = haloRef.current;
    if (!mesh || !cam || !halo) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const filtering = workCity.match.length === count && workCity.match.some((m) => !m);
    const hover = workCity.hover;

    s.intro = reduced ? 1 : Math.min(1, s.intro + dt / 2.4);
    for (let i = 0; i < count; i++) {
      const match = !filtering || workCity.match[i];
      const h = match ? 1 : 0.2;
      const f = i === hover ? 1 : 0;
      s.height[i] = reduced ? h : damp(s.height[i], h, 4, dt);
      s.focus[i] = reduced ? f : damp(s.focus[i], f, 6, dt);
    }

    floors.forEach(({ tower, floor }, k) => {
      const t = towers[tower];
      const matched = !filtering || workCity.match[tower];
      const rise = easeOut(clamp01(s.intro * 1.7 - tower * 0.11));
      const focus = s.focus[tower];
      const crown = floor === t.of;
      // Floors build bottom-up; unmatched towers keep only their footing.
      const built = crown
        ? clamp01(focus * rise)
        : clamp01(rise * t.of * s.height[tower] - floor);
      obj.position.set(t.x, 0.2 + floor * PITCH, t.z);
      obj.rotation.set(0, 0, 0);
      const w = FOOT * (crown ? 0.72 : 1) * (built > 0.01 ? 1 : 0);
      obj.scale.set(w, 0.34 * built, w);
      obj.updateMatrix();
      mesh.setMatrixAt(k, obj.matrix);
      const base = matched ? (filtering ? 0.8 : 0.5) : 0.22;
      mesh.setColorAt(k, tint.setScalar(Math.min(1, base + focus * 0.5)));
      const top = floor === t.of - 1 ? 0.12 : 0;
      setGlow(mesh, k, Math.min(1, (matched && filtering ? 0.22 : 0.04) + top + focus * (0.45 + (floor / t.of) * 0.5)));
    });
    flush(mesh);

    // A pool of light under the tower in focus.
    const target = hover >= 0 && hover < count ? towers[hover] : null;
    s.halo = reduced ? (target ? 1 : 0) : damp(s.halo, target ? 1 : 0, 5, dt);
    if (target) {
      s.haloX = reduced || s.halo < 0.05 ? target.x : damp(s.haloX, target.x, 10, dt);
      s.haloZ = reduced || s.halo < 0.05 ? target.z : damp(s.haloZ, target.z, 10, dt);
    }
    halo.position.set(s.haloX, 0.3, s.haloZ);
    haloMaterial.opacity = s.halo * 0.55;

    // Camera: in front of the street, slightly above it; a slow sway and parallax.
    const p = pointers.city;
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y : 0, 2.5, dt);
    const sway = reduced ? 0 : Math.sin(time.current * 0.12) * 0.22;
    const a = 0.55 + sway + s.parX * 0.28;
    const r = compact ? 11 : 11.5;
    cam.position.set(Math.sin(a) * r, 5.4 + s.parY * 0.6, Math.cos(a) * r);
    cam.lookAt(look);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={compact ? 40 : 36} near={0.1} far={50} />
      <GridGround ctl={ground} radius={9} />
      <instancedMesh ref={meshRef} args={[geometry, material, total]} frustumCulled={false} />
      <sprite ref={haloRef} material={haloMaterial} scale={[2.6, 2.6, 1]} />
    </>
  );
}
