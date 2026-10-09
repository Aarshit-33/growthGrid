"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILD_ZONE, pointers, stageStore } from "../../store";
import type { BuildSceneData } from "../../types";
import { PALETTE, clamp01, color, damp, glowTexture, useSceneReady, useSceneTime } from "../shared";
import {
  GridGround,
  Sparks,
  createGlassGeometry,
  createGlassMaterial,
  flush,
  setGlow,
  useCompact,
  useDispose,
  type OpacityCtl,
  type SparkCtl,
} from "./kit";

/* ─────────────────────────────────────────────────────────────
   Case study: "the build". The page's before → after, told in 3D.
   The project starts as broken pieces (red/amber, drifting like
   the home page's fractured grid) and, as the visitor reads from
   Challenge down to Stack, the pieces fly home and lock into one
   tower, floor by floor, healing to green. Each narrative section
   owns two floors, which glow while it is being read. The camera
   climbs with the tower, as it does everywhere on the site.
   Generic on purpose: every project builds the same kind of tower.
   ───────────────────────────────────────────────────────────── */

const PITCH = 0.36;
const PIECE = 0.56;
const OFFSET = 0.3;
const FLOORS_PER_SECTION = 2;
/** Four quarter-slabs make one floor. */
const QUARTERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Seeded random, so the scattered pieces never jump between renders. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function BuildScene({ data }: { data: BuildSceneData }) {
  const compact = useCompact();
  const time = useSceneTime(10);
  useSceneReady("build");

  const sections = Math.max(1, Math.min(8, data.sections));
  const floorCount = sections * FLOORS_PER_SECTION;
  const height = floorCount * PITCH;

  const pieces = useMemo(() => {
    const rand = rng(7 + sections * 31);
    return Array.from({ length: floorCount }, (_, floor) =>
      QUARTERS.map(([qx, qz]) => {
        const a = rand() * Math.PI * 2;
        const r = 1.2 + rand() * 1.1;
        return {
          floor,
          hx: qx * OFFSET,
          hz: qz * OFFSET,
          hy: 0.2 + floor * PITCH,
          a,
          r,
          sy: 0.3 + rand() * height * 0.7,
          rx: (rand() - 0.5) * 2.2,
          ry: (rand() - 0.5) * 2.6,
          rz: (rand() - 0.5) * 2.2,
          seed: rand(),
          warm: rand(),
        };
      }),
    ).flat();
  }, [floorCount, height, sections]);
  const count = pieces.length;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const crownRef = useRef<THREE.Sprite>(null);
  // White base colours: each piece's tint alone decides red → amber → green.
  const geometry = useMemo(() => createGlassGeometry(count), [count]);
  const material = useMemo(
    () => createGlassMaterial({ face: "#9fb8ad", edge: "#ffffff", faceAlpha: 0.1, fog: [12, 26] }),
    [],
  );
  const glow = useMemo(() => glowTexture(), []);
  const crownMaterial = useMemo(
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
  useDispose(geometry, material, glow, crownMaterial);

  const ground = useRef<OpacityCtl>({ opacity: 0.55 });
  const sparks = useRef<SparkCtl>({ opacity: 0, burst: 0 });
  const obj = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(
    () => ({
      danger: color("#ff6b6b"),
      warn: color("#ffbf5a"),
      em: color(PALETTE.em),
      hot: color(PALETTE.hot),
      c: new THREE.Color(),
    }),
    [],
  );
  const look = useMemo(() => new THREE.Vector3(), []);
  const live = useRef({ progress: 0, active: -1, parX: 0, parY: 0, started: false });

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    const cam = cameraRef.current;
    const crown = crownRef.current;
    if (!mesh || !cam || !crown) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const t = time.current;
    const s = live.current;

    // Reading progress through the narrative, and the section being read.
    const zone = document.querySelector<HTMLElement>(BUILD_ZONE);
    const vh = window.innerHeight;
    let target = 0;
    let active = -1;
    if (zone) {
      const r = zone.getBoundingClientRect();
      target = clamp01((vh * 0.45 - r.top) / Math.max(1, r.height - vh * 0.35));
      zone.querySelectorAll(":scope > section").forEach((section, i) => {
        if (section.getBoundingClientRect().top < vh * 0.45) active = i;
      });
    }
    s.progress = reduced || !s.started ? target : damp(s.progress, target, 3.5, dt);
    s.started = true;
    s.active = active;
    const q = clamp01(s.progress / 0.94);

    pieces.forEach((pc, i) => {
      const f0 = pc.floor / floorCount;
      const b = smooth(f0 - 0.04, f0 + 1 / floorCount, q);
      const e = easeOut(b);
      const k = 1 - e;
      // Loose pieces orbit slowly and bob; built ones sit exactly on the grid.
      const a = pc.a + (reduced ? 0 : t * 0.06 * (0.6 + pc.seed));
      const bob = reduced ? 0 : Math.sin(t * 0.7 + pc.seed * 12) * 0.12;
      obj.position.set(
        pc.hx + (Math.cos(a) * pc.r - pc.hx) * k,
        pc.hy + (pc.sy + bob - pc.hy) * k,
        pc.hz + (Math.sin(a) * pc.r - pc.hz) * k,
      );
      obj.rotation.set(pc.rx * k, pc.ry * k + (reduced ? 0 : t * 0.3 * k), pc.rz * k);
      obj.scale.set(PIECE, 0.3 * (0.7 + e * 0.3), PIECE);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);

      const reading = Math.floor(pc.floor / FLOORS_PER_SECTION) === s.active ? 1 : 0;
      colors.c.copy(colors.danger).lerp(colors.warn, pc.warm * 0.7).lerp(colors.em, e);
      if (reading && b > 0.5) colors.c.lerp(colors.hot, 0.5);
      colors.c.multiplyScalar(0.55 + e * 0.35 + reading * 0.1);
      mesh.setColorAt(i, colors.c);
      // A flash as each piece locks home; broken ones flicker now and then.
      const lock = Math.sin(Math.PI * smooth(0.55, 1, b)) * 0.9;
      const flicker = k * (!reduced && Math.sin(t * 6 + pc.seed * 50) > 0.94 ? 0.7 : 0);
      setGlow(mesh, i, Math.min(1, lock + flicker + reading * e * 0.35 + e * 0.05));
    });
    flush(mesh);

    // Complete: the top glows and growth sparks rise off it.
    const done = smooth(0.9, 1, s.progress);
    crown.position.set(0, 0.3 + height, 0);
    crownMaterial.opacity = done * 0.6;
    sparks.current.opacity = done * 0.55;

    // Camera climbs and circles with the build.
    const p = pointers.build;
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y : 0, 2.5, dt);
    const sway = reduced ? 0 : Math.sin(t * 0.15) * 0.15;
    const ang = 0.7 + q * Math.PI * 0.8 + sway + s.parX * 0.35;
    const r = (compact ? 7.4 : 6.6) + height * 0.35;
    const y = 1.4 + q * height * 0.85 + s.parY * 0.4;
    cam.position.set(Math.cos(ang) * r, y + 1.6, Math.sin(ang) * r);
    look.set(0, 0.5 + q * height * 0.55, 0);
    cam.lookAt(look);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={40} near={0.1} far={50} />
      <GridGround ctl={ground} radius={8} />
      <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />
      <sprite ref={crownRef} material={crownMaterial} scale={[3, 3, 1]} />
      <Sparks count={compact ? 40 : 80} radius={0.8} height={3} ctl={sparks} time={time} position={[0, height, 0]} />
    </>
  );
}
