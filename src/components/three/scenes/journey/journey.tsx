"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { JOURNEY_ZONES, journey, pointers, stageStore } from "../../store";
import type { JourneySceneData } from "../../types";
import { PALETTE, clamp01, color, damp, useSceneReady, useSceneTime } from "../shared";
import {
  GRID,
  GridGround,
  Sparks,
  Staircase,
  SummitStep,
  createGlassGeometry,
  createGlassMaterial,
  flush,
  setGlow,
  stairLayout,
  useCompact,
  useDispose,
  type OpacityCtl,
  type SparkCtl,
  type StairCtl,
  type StepCtl,
} from "./kit";

/* ─────────────────────────────────────────────────────────────
   The home journey: "from ground to summit". One fixed backdrop
   plays behind Problem → Services → Process → Work → CTA, and the
   camera only ever rises:
     Broken     the grid's tiles are fractured (six kinds of
                breakage, one per problem) and heal as the monitor
                is repaired; hovering a problem isolates its tiles.
     Blueprint  six glass layers assemble upward, one per service;
                scrolling the services list lifts the layer of the row
                at mid-screen (the focus climbs as the page goes down)
                and turns the stack; hovering a service lifts its layer.
     Climb      a spiral staircase rises from the stack. Its six
                landings are the six process steps and the camera
                climbs with the pinned process rail; a glowing step
                caps the climb. The stair appears in this chapter only.
     Structures towers build floor by floor, in step with the work
                deck.
     Summit     growth sparks rise beside the CTA and burst when it
                is hovered.
   Chapter weights come from how much of each section is on screen,
   and every chapter's camera is blended by those weights.
   ───────────────────────────────────────────────────────────── */

const STACK_PITCH = 0.4;
const STACK_BASE = 0.26;
const STAIR_SEGMENTS = 6;
const TOWER_FLOORS = [4, 6, 3, 5, 7, 4] as const;
const FLOOR_PITCH = 0.4;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Share of the viewport a section covers (1 once it fills 60% of it). */
function zoneWeight(el: Element | null, vh: number) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
  return smooth(0, 0.6, visible / Math.max(1, Math.min(vh, r.height)));
}

/** 0 as a section's top enters at the bottom of the screen, 1 as its bottom leaves the top. */
function passProgress(el: Element | null, vh: number) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  return clamp01((vh - r.top) / Math.max(1, r.height + vh));
}

/* ── Broken: fractured grid tiles ───────────────────────────── */

interface FragmentCtl extends OpacityCtl {
  heal: number;
  hovered: number;
}

function Fragments({
  ctl,
  time,
  compact,
}: {
  ctl: RefObject<FragmentCtl>;
  time: RefObject<number>;
  compact: boolean;
}) {
  const n = compact ? 7 : 9;
  const count = n * n;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createGlassGeometry(count), [count]);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.08 }), []);
  useDispose(geometry, material);

  const tiles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const x = ((i % n) - (n - 1) / 2) * GRID;
        const z = (Math.floor(i / n) - (n - 1) / 2) * GRID;
        // Six sectors around the centre: one per problem, one kind of breakage each.
        const group = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
        return { x, z, group, a: Math.random(), b: Math.random(), c: Math.random() };
      }),
    [count, n],
  );
  const state = useRef({ lift: new Float32Array(count) });
  const colors = useMemo(
    () => ({ danger: color("#ff6b6b"), warn: color("#ffbf5a"), em: color(PALETTE.em), c: new THREE.Color() }),
    [],
  );
  const obj = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, rawDelta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const { opacity, heal, hovered } = ctl.current;
    mesh.visible = opacity > 0.002;
    if (!mesh.visible) return;
    material.uniforms.uOpacity.value = opacity;
    const dt = Math.min(rawDelta, 1 / 20);
    const t = time.current;
    const lift = state.current.lift;

    tiles.forEach((tile, i) => {
      // Problems heal in the same order as the monitor's nodes.
      const at = (tile.group + 1) / (6 + 1.4);
      const h = smooth(at - 0.14, at, heal);
      const k = 1 - h;
      const focus = hovered === tile.group;
      lift[i] = damp(lift[i], focus ? 1 : 0, 6, dt);

      let x = tile.x;
      let z = tile.z;
      let y = 0.04 + k * tile.a * 0.25;
      let rx = 0;
      let ry = 0;
      let sx = 0.6;
      let sy = 0.06;
      switch (tile.group) {
        case 0: // Slow: a sluggish, heavy bob.
          y += k * (0.3 + 0.25 * Math.sin(t * 0.55 + tile.b * 6));
          break;
        case 1: // Stuck in planning: frozen mid-air.
          y += k * (0.8 + tile.b * 0.9);
          break;
        case 2: // Disconnected: pushed apart.
          x *= 1 + k * 0.28;
          z *= 1 + k * 0.28;
          y += k * 0.18;
          break;
        case 3: // Poor experience: misaligned.
          ry += k * (tile.b - 0.5) * 1.3;
          rx += k * (tile.c - 0.5) * 0.6;
          y += k * 0.12;
          break;
        case 4: // Manual work: looping in place.
          ry += k * t * (0.8 + tile.b);
          y += k * 0.28;
          break;
        default: // Doesn't scale: cracking columns.
          sy += k * tile.b * 1.6;
          sx *= 1 - k * 0.4;
          y += k * sy * 0.5;
      }
      y += lift[i] * 0.35;
      // Some tiles are missing until the grid is repaired.
      const present = tile.c < 0.16 ? h : 1;

      obj.position.set(x, y, z);
      obj.rotation.set(rx, ry, 0);
      obj.scale.set(sx * present, sy, sx * present);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);

      const flicker = k * (Math.sin(t * 7 + tile.a * 40) > 0.93 ? 1 : 0);
      colors.c.copy(colors.danger).lerp(colors.warn, tile.a * 0.6).lerp(colors.em, h);
      colors.c.multiplyScalar(hovered >= 0 && !focus ? 0.35 : 0.6 + tile.b * 0.4);
      mesh.setColorAt(i, colors.c);
      setGlow(mesh, i, Math.min(1, flicker * 0.8 + lift[i] * 0.9 + h * 0.08));
    });
    flush(mesh);
  });

  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

/* ── Blueprint: one glass layer per service ─────────────────── */

interface StackCtl extends OpacityCtl {
  rise: number;
  /** Service row under the pointer (-1: none): its layer lifts, the rest dim. */
  hovered: number;
  /** Services list scroll position in rows (journey.serviceScroll): the layer there lifts. */
  scroll: number;
  /** Extra turn from scrolling through the section (radians). */
  spin: number;
}

/** Focused layer: rises by its own lift; layers above it make room. */
const LAYER_LIFT = 0.22;
const LAYER_GAP = 0.34;

function LayerStack({
  ctl,
  accents,
  time,
  compact,
}: {
  ctl: RefObject<StackCtl>;
  accents: string[];
  time: RefObject<number>;
  compact: boolean;
}) {
  const count = accents.length;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createGlassGeometry(count), [count]);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.07 }), []);
  useDispose(geometry, material);
  const palette = useMemo(() => accents.map((a) => color(a)), [accents]);
  const em = useMemo(() => color(PALETTE.em), []);
  const c = useMemo(() => new THREE.Color(), []);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const lift = useRef(new Float32Array(count));
  const base = compact ? 2.7 : 3.3;

  useFrame((_, rawDelta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const { opacity, rise, hovered, scroll, spin } = ctl.current;
    mesh.visible = opacity > 0.002 && count > 0;
    if (!mesh.visible) return;
    material.uniforms.uOpacity.value = opacity;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    // A hovered row picks one layer; otherwise the scroll position does, blending
    // between neighbours (whole layers only with reduced motion).
    const at = reduced ? Math.round(scroll) : scroll;
    const engaged = hovered >= 0 ? 1 : clamp01(scroll + 1);
    // Layers out of focus dim: firmly under hover, gently while scrolling.
    const rest = hovered >= 0 ? 0.35 : 0.75 - 0.25 * engaged;

    let raised = 0;
    for (let i = 0; i < count; i++) {
      const target = hovered >= 0 ? (hovered === i ? 1 : 0) : Math.max(0, 1 - Math.abs(at - i));
      lift.current[i] = reduced ? target : damp(lift.current[i], target, 7, dt);
      const l = lift.current[i];
      // Layers assemble upward, bottom first.
      const r = easeOut(clamp01(rise * 1.7 - i * 0.12));
      const size = (base - i * 0.24) * (0.55 + 0.45 * r);
      obj.position.set(0, (STACK_BASE + i * STACK_PITCH) * r + raised + l * LAYER_LIFT, 0);
      raised += l * LAYER_GAP * r;
      obj.rotation.set(0, reduced ? 0.4 : 0.4 + time.current * 0.04 + i * 0.02 + spin, 0);
      obj.scale.set(size, 0.1 + l * 0.04, size);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      c.copy(em).lerp(palette[i], 0.35 + l * 0.65);
      c.multiplyScalar(rest + (1 - rest) * l);
      mesh.setColorAt(i, c);
      setGlow(mesh, i, l * 0.9 + r * 0.1);
    }
    flush(mesh);
  });

  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, count)]} frustumCulled={false} />;
}

/* ── Structures: towers built floor by floor ────────────────── */

interface TowerCtl extends OpacityCtl {
  rise: number;
  active: number;
}

function Towers({ ctl, radius }: { ctl: RefObject<TowerCtl>; radius: number }) {
  const floors = useMemo(
    () =>
      TOWER_FLOORS.flatMap((n, tower) => {
        // Around the stair's base, snapped to the grid.
        const a = (tower / TOWER_FLOORS.length) * Math.PI * 2 + 0.5;
        const x = Math.round((Math.cos(a) * radius) / GRID) * GRID;
        const z = Math.round((Math.sin(a) * radius) / GRID) * GRID;
        return Array.from({ length: n }, (_, floor) => ({ tower, floor, of: n, x, z }));
      }),
    [radius],
  );
  const count = floors.length;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createGlassGeometry(count), [count]);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, faceAlpha: 0.1 }), []);
  useDispose(geometry, material);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { opacity, rise, active } = ctl.current;
    mesh.visible = opacity > 0.002;
    if (!mesh.visible) return;
    material.uniforms.uOpacity.value = opacity;
    floors.forEach((f, i) => {
      const r = clamp01(rise * 1.5 - f.tower * 0.07);
      const focus = f.tower === active;
      const built = clamp01(r * (f.of + (focus ? 1 : 0)) - f.floor);
      obj.position.set(f.x, 0.2 + f.floor * FLOOR_PITCH, f.z);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(0.58, 0.34 * built, 0.58);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      mesh.setColorAt(i, c.setScalar(focus ? 1 : 0.42));
      setGlow(mesh, i, focus ? 0.55 + (f.floor / f.of) * 0.45 : 0.05);
    });
    flush(mesh);
  });

  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

/* ── The journey ────────────────────────────────────────────── */

export function JourneyScene({ data }: { data: JourneySceneData }) {
  const compact = useCompact();
  const time = useSceneTime(10);
  useSceneReady("journey");

  const accentKey = data.accents.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accents = useMemo(() => data.accents.slice(0, 8), [accentKey]);

  const stackTop = STACK_BASE + Math.max(0, accents.length - 1) * STACK_PITCH + 0.12;
  const layout = useMemo(() => stairLayout(compact ? 48 : 72, STAIR_SEGMENTS), [compact]);
  const lastLanding = layout.landings[layout.landings.length - 1] ?? layout.count - 1;
  const firstLanding = layout.landings[0] ?? 0;

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rootRef = useRef<THREE.Group>(null);
  const zones = useRef<(Element | null)[]>([]);

  const ground = useRef<OpacityCtl>({ opacity: 0 });
  const frag = useRef<FragmentCtl>({ opacity: 0, heal: 0, hovered: -1 });
  const stack = useRef<StackCtl>({ opacity: 0, rise: 0, hovered: -1, scroll: -1, spin: 0 });
  const stair = useRef<StairCtl>({ opacity: 0, lit: 0, active: -1 });
  const towers = useRef<TowerCtl>({ opacity: 0, rise: 0, active: -1 });
  const step = useRef<StepCtl>({ opacity: 0, level: 0, pulse: 0 });
  const sparks = useRef<SparkCtl>({ opacity: 0, burst: 0 });

  const live = useRef({
    w: new Float32Array(JOURNEY_ZONES.length),
    process: 0,
    work: 0,
    heal: 0,
    spin: 0,
    lit: 0,
    level: 0,
    parX: 0,
    parY: 0,
    started: false,
  });
  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useEffect(() => {
    zones.current = JOURNEY_ZONES.map((selector) => document.querySelector(selector));
  }, []);

  // Start the camera where the story starts, so the first frame doesn't swoop.
  useLayoutEffect(() => {
    cameraRef.current?.position.set(0, 6, 9);
  }, []);

  // Runs before the kit's frame callbacks (priority -1) so they read fresh values.
  useFrame((_, rawDelta) => {
    const cam = cameraRef.current;
    const root = rootRef.current;
    if (!cam || !root) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const vh = window.innerHeight;
    const s = live.current;
    const els = zones.current;

    // Chapter weights (smoothed, so chapters cross-fade).
    let total = 0;
    let lead = 0;
    for (let i = 0; i < JOURNEY_ZONES.length; i++) {
      const target = zoneWeight(els[i] ?? null, vh);
      s.w[i] = reduced || !s.started ? target : damp(s.w[i], target, 5, dt);
      total += s.w[i];
      if (s.w[i] > s.w[lead]) lead = i;
    }
    const [wProblem, wServices, wProcess, wWork, wSummit] = s.w;
    root.visible = total > 0.002;
    if (!root.visible) {
      s.started = false;
      for (const ctl of [ground, frag, stack, stair, towers, step, sparks]) ctl.current.opacity = 0;
      return;
    }

    // Story inputs from the sections.
    const pinnedProcess = journey.process >= 0;
    const processTarget = pinnedProcess ? journey.process : smooth(0.25, 0.8, passProgress(els[2] ?? null, vh));
    const workTarget = journey.work >= 0 ? journey.work : passProgress(els[3] ?? null, vh);
    const steps = layout.landings.length;
    const snap = (v: number) => (steps > 1 ? Math.round(v * (steps - 1)) / (steps - 1) : 0);
    s.process = reduced ? snap(processTarget) : damp(s.process, processTarget, 6, dt);
    s.work = reduced ? snap(workTarget) : damp(s.work, workTarget, 5, dt);
    s.heal = reduced ? journey.heal : damp(s.heal, journey.heal, 5, dt);
    const activeStep = Math.round(s.process * (steps - 1));

    // Chapter visibility. Neighbouring chapters linger faintly for continuity.
    // Phones stack copy over the whole width (nothing can sit beside it), so
    // every chapter is much quieter there and text reads the same everywhere.
    ground.current.opacity = Math.min(1, total) * (compact ? 0.3 : 0.55);
    // The problem copy is dense, so the fracture stays a backdrop, not a subject.
    frag.current.opacity = wProblem * (compact ? 0.18 : 0.38);
    frag.current.heal = s.heal;
    frag.current.hovered = journey.problem;
    // The stack belongs to Services alone (it no longer lingers under the
    // stair), and stays a backdrop to the service rows. Scrolling the list
    // walks its layers and turns it; a hovered row takes over.
    stack.current.opacity = wServices * (compact ? 0.18 : 0.55);
    stack.current.rise = wServices;
    stack.current.hovered = wServices > 0.5 ? journey.service : -1;
    stack.current.scroll = journey.serviceScroll;
    const spinTarget = reduced ? 0 : (passProgress(els[1] ?? null, vh) - 0.5) * 1.3;
    s.spin = reduced || !s.started ? spinTarget : damp(s.spin, spinTarget, 4, dt);
    stack.current.spin = s.spin;

    const litTarget = lead >= 3 ? layout.count : firstLanding + s.process * (lastLanding - firstLanding);
    s.lit = reduced ? litTarget : damp(s.lit, litTarget, 4, dt);
    // The stair is the process's progress bar: climbed treads glow, the rest are
    // ghosted (see <Staircase idle fill>), so it stays calm enough to sit behind
    // copy on phones too. It belongs to the Growth Grid alone: no other chapter
    // shows it.
    const quiet = compact ? 0.32 : 0.62;
    stair.current.opacity = wProcess * quiet;
    stair.current.lit = s.lit;
    stair.current.active = lead === 2 ? activeStep : -1;

    towers.current.opacity = wWork * (compact ? 0.22 : 0.65);
    towers.current.rise = wWork;
    towers.current.active = Math.round(s.work * (TOWER_FLOORS.length - 1));

    const hover = journey.cta ? 1 : 0;
    s.level = reduced ? hover : damp(s.level, hover, 3.5, dt);
    // The glowing step caps the climb at the end of the Growth Grid only; the
    // closing CTA keeps just the growth sparks.
    step.current.opacity = wProcess * smooth(0.8, 1, s.process) * (compact ? 0 : 0.2);
    step.current.level = s.level;
    step.current.pulse = s.level * 0.6;
    sparks.current.opacity = wSummit * (0.55 + s.level * 0.45);
    sparks.current.burst = s.level * 0.4;

    // Chapter cameras, blended by weight.
    const k = compact ? 1.35 : 1;
    const shift = compact ? 0 : 1;
    tmp.camPos.set(0, 0, 0);
    tmp.camTarget.set(0, 0, 0);
    const add = (w: number, px: number, py: number, pz: number, tx: number, ty: number, tz: number, side = 0) => {
      if (w <= 0) return;
      tmp.a.set(px, py, pz);
      tmp.b.set(tx, ty, tz);
      if (side) {
        // Nudge the subject sideways on screen (beside the section's copy).
        tmp.right.subVectors(tmp.b, tmp.a).cross(tmp.up).normalize();
        tmp.b.addScaledVector(tmp.right, -side);
      }
      tmp.camPos.addScaledVector(tmp.a, w);
      tmp.camTarget.addScaledVector(tmp.b, w);
    };

    const drift = reduced ? 0.5 : passProgress(els[0] ?? null, vh);
    add(wProblem, -1.6 + drift * 3.2, 7.4 * k, 10.2 * k, 0, 0.6, -0.4);
    {
      // The camera rises a little as the focus climbs the stack, and leans toward the focused layer.
      const layers = Math.max(1, accents.length - 1);
      const focus = stack.current.hovered >= 0 ? stack.current.hovered : clamp01(stack.current.scroll / layers) * layers;
      const focusY = STACK_BASE + focus * STACK_PITCH;
      const ty = stackTop * 0.5 + (focusY - stackTop * 0.5) * 0.3;
      add(wServices, 4.4 * k, (3.5 + (focus / layers) * 0.6) * k, 5.4 * k, 0, ty, 0, 2.7 * shift);
    }
    {
      // Close on the climber: about half the stair is in view (a bit more on
      // phones), and the camera rises with the progress. On phones the climber
      // sits above centre, beside the rail rather than behind the step copy.
      const y = stackTop + s.lit * layout.rise;
      const a = 0.7 + s.process * Math.PI * 1.15;
      const r = compact ? 4.6 : 6.2;
      add(wProcess, Math.cos(a) * r, y + (compact ? 1 : 0.9), Math.sin(a) * r, 0, y + (compact ? -0.9 : -0.45), 0);
    }
    {
      const a = 2.3 + (reduced ? 0.5 : s.work) * Math.PI * 0.75;
      const r = 12.5 * k;
      add(wWork, Math.cos(a) * r, 8.2, Math.sin(a) * r, 0, 3.6, 0);
    }
    {
      const top = layout.top;
      const a = layout.angle(layout.count + 1);
      const out = compact ? 9.4 : 9;
      const side = 1.4;
      add(
        wSummit,
        top.x + Math.cos(a) * out - Math.sin(a) * side,
        stackTop + top.y + (compact ? 4.2 : 3.2),
        top.z + Math.sin(a) * out + Math.cos(a) * side,
        top.x,
        stackTop + top.y + (compact ? 3 : 1.3),
        top.z,
        // Beside the CTA copy on wide screens, below it on phones.
        compact ? 0 : 3,
      );
    }
    tmp.camPos.divideScalar(total);
    tmp.camTarget.divideScalar(total);

    // A little parallax under the mouse.
    const p = pointers.journey;
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x * 0.45 : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y * 0.25 : 0, 2.5, dt);
    tmp.camPos.x += s.parX;
    tmp.camPos.y += s.parY;

    if (reduced || !s.started) {
      tmp.pos.copy(tmp.camPos);
      tmp.target.copy(tmp.camTarget);
      s.started = true;
    } else {
      tmp.pos.x = damp(tmp.pos.x, tmp.camPos.x, 3.2, dt);
      tmp.pos.y = damp(tmp.pos.y, tmp.camPos.y, 3.2, dt);
      tmp.pos.z = damp(tmp.pos.z, tmp.camPos.z, 3.2, dt);
      tmp.target.x = damp(tmp.target.x, tmp.camTarget.x, 3.2, dt);
      tmp.target.y = damp(tmp.target.y, tmp.camTarget.y, 3.2, dt);
      tmp.target.z = damp(tmp.target.z, tmp.camTarget.z, 3.2, dt);
    }
    cam.position.copy(tmp.pos);
    cam.lookAt(tmp.target);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={compact ? 52 : 36} near={0.1} far={80} />
      <group ref={rootRef}>
        <GridGround ctl={ground} radius={16} />
        <Fragments ctl={frag} time={time} compact={compact} />
        <LayerStack ctl={stack} accents={accents} time={time} compact={compact} />
        <group position-y={stackTop}>
          <Staircase layout={layout} ctl={stair} idle={0.08} fill={0.3} fade={compact ? 10 : 16} />
          <SummitStep tread={layout.top} ctl={step} time={time} />
          <Sparks
            count={compact ? 70 : 170}
            radius={1.6}
            height={4.5}
            ctl={sparks}
            time={time}
            position={[layout.top.x, layout.top.y - 1.2, layout.top.z]}
          />
        </group>
        <Towers ctl={towers} radius={compact ? 3.6 : 4.8} />
      </group>
    </>
  );
}
