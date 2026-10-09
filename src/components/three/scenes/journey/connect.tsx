"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointers, stageStore } from "../../store";
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
   Contact hero: "the conversation". Two glass speech bubbles
   float over the grid — the visitor's (front, right) and the
   studio's (back, left). They take turns: one types (three
   bouncing dots), the dots settle into a written message, and a
   pulse of light carries it along the arc to the other bubble,
   which lights up, sends a ripple across the grid and starts
   typing its reply. Clicking the scene sends a message from the
   visitor's bubble straight away.
   ───────────────────────────────────────────────────────────── */

/** Bubble body size. */
const W = 1.4;
const H = 0.9;
const D = 0.24;
/** Instances per bubble: body, tail, three typing dots, two message lines. */
const PARTS = 7;
const LINES = [
  { y: 0.14, len: 0.92 },
  { y: -0.14, len: 0.56 },
] as const;

/** Seconds spent typing, carrying the message, and pausing before the reply. */
const T_TYPE = 1.9;
const T_TRAVEL = 1.25;
const T_PAUSE = 0.8;

const ARC_POINTS = 72;
const TRAIL = 6;

type Phase = "typing" | "send" | "pause";

interface Bubble {
  pos: THREE.Vector3;
  /** Turn toward the other bubble. */
  yaw: number;
  /** Which bottom corner the tail sits on (1: right, -1: left). */
  tail: 1 | -1;
  tint: number;
  /** Bob phase offset. */
  phase: number;
}

const BUBBLES: readonly Bubble[] = [
  // The visitor: in front and to the right, tail bottom-right, like your own chat messages.
  { pos: new THREE.Vector3(1.0, 0.95, 0.9), yaw: -0.3, tail: 1, tint: 1, phase: 0 },
  // The studio: further back and higher, tail bottom-left.
  { pos: new THREE.Vector3(-1.0, 2.05, -0.7), yaw: 0.3, tail: -1, tint: 0.78, phase: 2.1 },
];

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── Arc wire: dashes drift toward the listener; the message lights it up ── */

const arcVertex = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const arcFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDir;
  uniform float uPulse;
  uniform float uOn;
  varying float vT;
  void main() {
    float ends = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.94, 1.0, vT));
    float dash = step(0.55, fract(vT * 26.0 - uTime * 0.8 * uDir));
    // Signed distance along the travel direction: > 0 ahead of the pulse.
    float d = (vT - uPulse) * uDir;
    float lit = uOn * (exp(-d * d * 900.0) + step(d, 0.0) * exp(d * 6.0) * 0.55);
    vec3 col = mix(uColor, uHot, clamp(lit, 0.0, 1.0));
    float a = (0.14 + dash * 0.2 + lit) * ends * uOpacity;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

function additiveSprite(map: THREE.Texture, hex: string) {
  return new THREE.SpriteMaterial({
    map,
    color: color(hex),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
}

export function ConnectScene() {
  const compact = useCompact();
  const time = useSceneTime(9);
  useSceneReady("connect");

  const total = BUBBLES.length * PARTS;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const haloRefs = useRef<(THREE.Sprite | null)[]>([]);
  const pulseRefs = useRef<(THREE.Sprite | null)[]>([]);

  const geometry = useMemo(() => createGlassGeometry(total), [total]);
  const material = useMemo(
    () => createGlassMaterial({ face: PALETTE.em, edge: PALETTE.hot, faceAlpha: 0.07, fog: [12, 30] }),
    [],
  );
  const glow = useMemo(() => glowTexture(), []);
  const haloMaterials = useMemo(() => BUBBLES.map(() => additiveSprite(glow, PALETTE.em)), [glow]);
  const pulseMaterials = useMemo(
    () => Array.from({ length: TRAIL + 1 }, (_, k) => additiveSprite(glow, k === 0 ? PALETTE.ink : PALETTE.hot)),
    [glow],
  );

  const arc = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    g.setAttribute(
      "aT",
      new THREE.BufferAttribute(Float32Array.from({ length: ARC_POINTS }, (_, i) => i / (ARC_POINTS - 1)), 1),
    );
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color(PALETTE.em) },
        uHot: { value: color(PALETTE.hot) },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uDir: { value: 1 },
        uPulse: { value: 0 },
        uOn: { value: 0 },
      },
      vertexShader: arcVertex,
      fragmentShader: arcFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(g, m);
    line.frustumCulled = false;
    return line;
  }, []);

  const ripple = useMemo(
    () => ({
      geometry: new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      material: new THREE.MeshBasicMaterial({
        color: color(PALETTE.em),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    }),
    [],
  );

  useDispose(geometry, material, glow, arc.geometry, arc.material as THREE.Material, ripple.geometry, ripple.material);
  useEffect(() => () => haloMaterials.forEach((m) => m.dispose()), [haloMaterials]);
  useEffect(() => () => pulseMaterials.forEach((m) => m.dispose()), [pulseMaterials]);

  const ground = useRef<OpacityCtl>({ opacity: 0.55 });
  const sparks = useRef<SparkCtl>({ opacity: 0.16, burst: 0 });

  // Scratch objects, reused every frame.
  const scratch = useMemo(
    () => ({
      bubble: BUBBLES.map(() => new THREE.Matrix4()),
      local: new THREE.Matrix4(),
      out: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      v: new THREE.Vector3(),
      s: new THREE.Vector3(),
      tint: new THREE.Color(),
      anchors: BUBBLES.map(() => new THREE.Vector3()),
      centers: BUBBLES.map(() => new THREE.Vector3()),
      ctrl: new THREE.Vector3(),
      point: new THREE.Vector3(),
      look: new THREE.Vector3(0, 1.5, 0),
    }),
    [],
  );

  const live = useRef({
    intro: 0,
    /** 0: the visitor, 1: the studio. The visitor types first; the studio has already said hello. */
    speaker: 0 as 0 | 1,
    phase: "typing" as Phase,
    clock: 0,
    progress: 0,
    said: [false, true],
    typing: [0, 0],
    written: [0, 1],
    flash: [0, 0],
    on: 0,
    ripple: 1,
    rippleAt: 0,
    burst: 0,
    taps: pointers.connect.taps,
    parX: 0,
    parY: 0,
  });

  /** Point on the arc (visitor → studio) at t. */
  const arcPoint = (t: number, target: THREE.Vector3) => {
    const [a, b] = scratch.anchors;
    const c = scratch.ctrl;
    const u = 1 - t;
    return target.set(
      u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      u * u * a.z + 2 * u * t * c.z + t * t * b.z,
    );
  };

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    const cam = cameraRef.current;
    const ring = rippleRef.current;
    if (!mesh || !cam || !ring) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const t = time.current;
    const p = pointers.connect;

    /* ── Turn-taking ── */
    if (p.taps !== s.taps) {
      s.taps = p.taps;
      // A click sends the visitor's message now (unless one is already on its way).
      if (!reduced && s.phase !== "send") {
        s.speaker = 0;
        s.phase = "send";
        s.clock = 0;
        s.progress = 0;
        s.said[0] = true;
      }
    }

    if (reduced) {
      // One still frame: the visitor's message halfway across.
      s.intro = 1;
      s.speaker = 0;
      s.phase = "send";
      s.progress = 0.55;
      s.typing.fill(0);
      s.written.fill(1);
      s.flash.fill(0);
      s.on = 1;
      s.ripple = 1;
      s.burst = 0;
    } else {
      s.intro = Math.min(1, s.intro + dt / 1.4);
      s.clock += dt;
      const other = (1 - s.speaker) as 0 | 1;
      if (s.phase === "typing" && s.clock >= T_TYPE) {
        s.phase = "send";
        s.clock = 0;
        s.progress = 0;
        s.said[s.speaker] = true;
      } else if (s.phase === "send") {
        s.progress = Math.min(1, s.clock / T_TRAVEL);
        if (s.progress >= 1) {
          s.phase = "pause";
          s.clock = 0;
          s.flash[other] = 1;
          s.ripple = 0;
          s.rippleAt = other;
          s.burst = 1;
        }
      } else if (s.phase === "pause" && s.clock >= T_PAUSE) {
        s.speaker = other;
        s.phase = "typing";
        s.clock = 0;
      }

      for (let b = 0; b < BUBBLES.length; b++) {
        const speaking = b === s.speaker;
        const typing = speaking && s.phase === "typing" ? 1 : 0;
        // A new message replaces the old one: it clears while its author types.
        const written = speaking ? (s.phase === "typing" ? 0 : 1) : s.said[b] ? 1 : 0;
        s.typing[b] = damp(s.typing[b], typing, 6, dt);
        s.written[b] = damp(s.written[b], written, 7, dt);
        s.flash[b] = Math.max(0, s.flash[b] - dt / 0.9);
      }
      s.on = damp(s.on, s.phase === "send" ? 1 : 0, 10, dt);
      s.ripple = Math.min(1, s.ripple + dt / 1.4);
      s.burst = Math.max(0, s.burst - dt / 2);
    }

    /* ── Bubbles ── */
    const { bubble, local, out, q, e, v, s: sc, tint, anchors, centers } = scratch;
    BUBBLES.forEach((cfg, b) => {
      const grow = easeOut(clamp01(s.intro * 1.6 - b * 0.35));
      const bob = Math.sin(t * 0.9 + cfg.phase) * 0.06;
      const sway = Math.sin(t * 0.4 + cfg.phase) * 0.05;
      bubble[b].compose(
        v.set(cfg.pos.x, cfg.pos.y + bob, cfg.pos.z),
        q.setFromEuler(e.set(0.04, cfg.yaw + sway, 0)),
        sc.setScalar(Math.max(0.0001, grow)),
      );
      centers[b].setFromMatrixPosition(bubble[b]);
      // The arc leaves from the edge facing the other bubble.
      anchors[b].set(-cfg.tail * W * 0.5, H * 0.08, 0).applyMatrix4(bubble[b]);

      const base = b * PARTS;
      const part = (k: number, x: number, y: number, rz: number, sx: number, sy: number, sz: number) => {
        local.compose(v.set(x, y, 0), q.setFromEuler(e.set(0, 0, rz)), sc.set(sx, sy, sz));
        out.multiplyMatrices(bubble[b], local);
        mesh.setMatrixAt(base + k, out);
      };

      const typing = s.typing[b];
      const written = s.written[b];
      const flash = s.flash[b];
      const shell = Math.min(1, 0.12 + typing * 0.22 + flash * 0.85);

      // Body and tail (a diamond poking out below one corner).
      part(0, 0, 0, 0, W, H, D);
      part(1, cfg.tail * (W / 2 - 0.3), -H / 2 - 0.02, Math.PI / 4, 0.28, 0.28, D * 0.8);
      mesh.setColorAt(base, tint.setScalar(cfg.tint));
      mesh.setColorAt(base + 1, tint);
      setGlow(mesh, base, shell);
      setGlow(mesh, base + 1, shell);

      // Typing dots: bounce in sequence, like any chat app.
      for (let i = 0; i < 3; i++) {
        const hop = reduced ? 0 : Math.max(0, Math.sin(t * 6.5 - i * 0.8)) * 0.08;
        const size = 0.14 * typing;
        part(2 + i, (i - 1) * 0.28, hop * typing, 0, size, size, size);
        mesh.setColorAt(base + 2 + i, tint.setScalar(1));
        setGlow(mesh, base + 2 + i, 0.7);
      }

      // The written message: two lines that draw in from the left.
      LINES.forEach((line, i) => {
        const len = Math.max(0.0001, line.len * written);
        part(5 + i, -W / 2 + 0.22 + len / 2, line.y, 0, len, 0.075 * (written > 0.01 ? 1 : 0), 0.075);
        mesh.setColorAt(base + 5 + i, tint.setScalar(1));
        setGlow(mesh, base + 5 + i, Math.min(1, 0.4 + flash * 0.4));
      });

      // Soft halo behind the bubble: brighter while typing or just spoken to.
      const halo = haloRefs.current[b];
      if (halo) {
        halo.position.copy(centers[b]).setZ(centers[b].z - 0.3);
        const size = (2.3 + flash * 0.9) * grow;
        halo.scale.set(size, size, 1);
        haloMaterials[b].opacity = (0.08 + typing * 0.1 + flash * 0.4) * grow;
      }
    });
    flush(mesh);

    /* ── Arc and the message riding it ── */
    const [a, bEnd] = anchors;
    scratch.ctrl.set((a.x + bEnd.x) / 2, Math.max(a.y, bEnd.y) + 0.9, (a.z + bEnd.z) / 2 + 0.3);
    const positions = arc.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < ARC_POINTS; i++) {
      arcPoint(i / (ARC_POINTS - 1), scratch.point);
      positions.setXYZ(i, scratch.point.x, scratch.point.y, scratch.point.z);
    }
    positions.needsUpdate = true;

    const dir = s.speaker === 0 ? 1 : -1;
    const eased = reduced ? s.progress : easeInOut(s.progress);
    const head = s.speaker === 0 ? eased : 1 - eased;
    const u = (arc.material as THREE.ShaderMaterial).uniforms;
    u.uOpacity.value = clamp01(s.intro * 1.4 - 0.3);
    u.uTime.value = t;
    u.uDir.value = dir;
    u.uPulse.value = head;
    u.uOn.value = s.on;

    // Fade the pulse in as it leaves and out as it lands.
    const visible = s.on * Math.min(1, s.progress * 8, (1 - s.progress) * 8 + 0.35);
    pulseRefs.current.forEach((sprite, k) => {
      if (!sprite) return;
      const at = clamp01(head - dir * k * 0.028);
      arcPoint(at, sprite.position);
      const fall = 1 - k / (TRAIL + 1);
      const size = k === 0 ? 0.62 : 0.42 * fall;
      sprite.scale.set(size, size, 1);
      pulseMaterials[k].opacity = visible * (k === 0 ? 0.95 : 0.5 * fall);
    });

    /* ── Ripple on the grid under whoever was just spoken to ── */
    const target = BUBBLES[s.rippleAt].pos;
    ring.position.set(target.x, 0.02, target.z);
    const r = 0.35 + easeOut(s.ripple) * 2.1;
    ring.scale.set(r, 1, r);
    ripple.material.opacity = (1 - s.ripple) * 0.5;
    ring.visible = s.ripple < 1;

    sparks.current.opacity = (0.14 + s.burst * 0.3) * s.intro;
    sparks.current.burst = s.burst * 0.6;

    /* ── Camera: in front, slightly above; a slow sway and a touch of parallax ── */
    const mouse = p.type === "mouse" && p.inside && !reduced;
    s.parX = damp(s.parX, mouse ? p.x : 0, 2.5, dt);
    s.parY = damp(s.parY, mouse ? p.y : 0, 2.5, dt);
    const swing = reduced ? 0.12 : Math.sin(t * 0.14) * 0.16 + s.parX * 0.25;
    const dist = compact ? 8.2 : 7.6;
    cam.position.set(Math.sin(swing) * dist, 2.7 + s.parY * 0.45, Math.cos(swing) * dist);
    cam.lookAt(scratch.look);
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={compact ? 44 : 38} near={0.1} far={50} />
      <GridGround ctl={ground} radius={8} />
      <mesh ref={rippleRef} geometry={ripple.geometry} material={ripple.material} visible={false} />
      <Sparks count={compact ? 40 : 80} radius={2.2} height={3.4} ctl={sparks} time={time} />
      <primitive object={arc} />
      <instancedMesh ref={meshRef} args={[geometry, material, total]} frustumCulled={false} />
      {BUBBLES.map((_, b) => (
        <sprite
          key={`halo-${b}`}
          ref={(el) => {
            haloRefs.current[b] = el;
          }}
          material={haloMaterials[b]}
        />
      ))}
      {pulseMaterials.map((m, k) => (
        <sprite
          key={`pulse-${k}`}
          ref={(el) => {
            pulseRefs.current[k] = el;
          }}
          material={m}
        />
      ))}
    </>
  );
}
