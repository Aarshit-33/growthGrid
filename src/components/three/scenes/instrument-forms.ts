"use client";

import * as THREE from "three";
import type { InstrumentShape } from "../types";
import { SIMPLEX_3D } from "./glsl";
import { PALETTE, clamp01, color } from "./shared";

/* ─────────────────────────────────────────────────────────────
   The principle "instruments" as particle forms, shared by the
   home explorer (one cloud morphing between all four) and the
   about-page cards (one instrument each). Every particle stores
   its place in all four forms, so a morph is one uniform change.
   ───────────────────────────────────────────────────────────── */

/** Attribute order: `position` holds the first shape, then aP1…aP3. */
export const SHAPES: InstrumentShape[] = ["prism", "lattice", "runway", "rings"];

type Rand = () => number;

/** Small deterministic PRNG (mulberry32), so the forms look the same on every visit. */
export function prng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly Gaussian jitter in [-1, 1]. */
const jitter = (r: Rand) => (r() + r() + r() - 1.5) / 1.5;

export interface ShapeBuffer {
  pos: Float32Array;
  /** 0…1 position along the form's "flow", used for travelling pulses. */
  path: Float32Array;
}

function buildShape(
  n: number,
  seed: number,
  euler: THREE.Euler,
  sample: (r: Rand, out: THREE.Vector3) => number,
): ShapeBuffer {
  const r = prng(seed);
  const pos = new Float32Array(n * 3);
  const path = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    path[i] = sample(r, v.set(0, 0, 0));
    v.applyEuler(euler);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }
  return { pos, path };
}

/** Focus → "Decision prism": scattered options converge into one clear beam. */
function prism(n: number) {
  const A = new THREE.Vector2(0, 1.2);
  const B = new THREE.Vector2(-1.15, -0.82);
  const C = new THREE.Vector2(1.15, -0.82);
  const D = 0.6;
  const tri = [A, B, C];
  const entry = A.clone().lerp(B, 0.55);
  const exit = A.clone().lerp(C, 0.55);
  const RAYS = 9;
  return buildShape(n, 11, new THREE.Euler(0.14, -0.42, 0), (r, v) => {
    const u = r();
    const k = r();
    if (u < 0.34) {
      // Frame: three front edges, three back edges, three depth edges.
      const e = Math.floor(r() * 9);
      if (e < 6) {
        const p = tri[e % 3];
        const q = tri[(e + 1) % 3];
        v.set(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k, e < 3 ? D : -D);
      } else {
        const p = tri[e - 6];
        v.set(p.x, p.y, -D + 2 * D * k);
      }
      v.addScalar(jitter(r) * 0.01);
      return 0.45 + k * 0.1;
    }
    if (u < 0.42) {
      // Faint glass faces.
      let a = r();
      let b = r();
      if (a + b > 1) {
        a = 1 - a;
        b = 1 - b;
      }
      const x = A.x + (B.x - A.x) * a + (C.x - A.x) * b;
      const y = A.y + (B.y - A.y) * a + (C.y - A.y) * b;
      v.set(x, y, (r() < 0.5 ? 1 : -1) * D);
      return r();
    }
    if (u < 0.76) {
      // Incoming options: rays fanning in from the left, converging on one point.
      const ray = Math.floor(r() * RAYS);
      const sy = -1.5 + (ray / (RAYS - 1)) * 3.0;
      const sz = (((ray * 5) % RAYS) / (RAYS - 1) - 0.5) * 1.5;
      const t = Math.pow(k, 0.85);
      v.set(-2.7 + (entry.x + 2.7) * t, sy + (entry.y - sy) * t, sz * (1 - t));
      v.addScalar(jitter(r) * 0.012);
      return t * 0.45;
    }
    if (u < 0.84) {
      // The decision, refracted through the prism.
      v.set(entry.x + (exit.x - entry.x) * k, entry.y + (exit.y - entry.y) * k, 0);
      v.addScalar(jitter(r) * 0.02);
      return 0.45 + k * 0.1;
    }
    // One focused beam out.
    const spread = 0.03 + k * 0.035;
    v.set(exit.x + (2.75 - exit.x) * k, exit.y + (-0.4 - exit.y) * k, 0);
    v.y += jitter(r) * spread;
    v.z += jitter(r) * spread;
    return 0.55 + k * 0.45;
  });
}

/** Foundation → "Load-bearing frame": a structural lattice that carries weight. */
function lattice(n: number) {
  const GX = 4;
  const GY = 5;
  const GZ = 4;
  const S = 0.78;
  const SY = 0.62;
  const node = (i: number, count: number, step: number) => (i - (count - 1) / 2) * step;
  const edges: [THREE.Vector3, THREE.Vector3][] = [];
  const nodes: THREE.Vector3[] = [];
  for (let x = 0; x < GX; x++)
    for (let y = 0; y < GY; y++)
      for (let z = 0; z < GZ; z++) {
        const p = new THREE.Vector3(node(x, GX, S), node(y, GY, SY), node(z, GZ, S));
        nodes.push(p);
        if (x < GX - 1) edges.push([p, new THREE.Vector3(node(x + 1, GX, S), p.y, p.z)]);
        if (y < GY - 1) edges.push([p, new THREE.Vector3(p.x, node(y + 1, GY, SY), p.z)]);
        if (z < GZ - 1) edges.push([p, new THREE.Vector3(p.x, p.y, node(z + 1, GZ, S))]);
      }
  const reach = new THREE.Vector3(node(GX - 1, GX, S), node(GY - 1, GY, SY), node(GZ - 1, GZ, S)).length();
  return buildShape(n, 23, new THREE.Euler(0.5, 0.74, 0), (r, v) => {
    if (r() < 0.74) {
      const [a, b] = edges[Math.floor(r() * edges.length)];
      v.lerpVectors(a, b, r());
      v.addScalar(jitter(r) * 0.008);
    } else {
      const p = nodes[Math.floor(r() * nodes.length)];
      v.set(p.x + jitter(r) * 0.05, p.y + jitter(r) * 0.05, p.z + jitter(r) * 0.05);
    }
    // Load travels from the base upward and outward.
    return clamp01((v.y + 1.3) / 2.6) * 0.6 + (v.length() / reach) * 0.4;
  });
}

/** Momentum → "Choice runway": guide lights lead to a lift-off. */
function runway(n: number) {
  const L0 = -2.6;
  const L1 = 0.9;
  const W = 0.5;
  const Y = -0.95;
  const LIGHTS = 14;
  const toPath = (x: number) => ((x - L0) / (L1 - L0)) * 0.6;
  return buildShape(n, 37, new THREE.Euler(0.46, -0.58, 0.02), (r, v) => {
    const u = r();
    if (u < 0.4) {
      // Edge lights, both sides.
      const li = Math.floor(r() * LIGHTS);
      const x = L0 + (L1 - L0) * (li / (LIGHTS - 1));
      v.set(x + jitter(r) * 0.03, Y + jitter(r) * 0.02, (r() < 0.5 ? -W : W) + jitter(r) * 0.03);
      return toPath(x);
    }
    if (u < 0.55) {
      // Centre-line dashes.
      const t = (Math.floor(r() * 9) + r() * 0.5) / 9;
      const x = L0 + (L1 - L0) * t;
      v.set(x, Y, jitter(r) * 0.012);
      return toPath(x);
    }
    if (u < 0.63) {
      // Threshold bars at the start.
      const bar = Math.floor(r() * 6);
      v.set(L0 + r() * 0.26, Y, -W * 0.78 + bar * ((1.56 * W) / 5) + jitter(r) * 0.01);
      return 0;
    }
    if (u < 0.7) {
      // Faint runway surface.
      const x = L0 + (L1 - L0) * r();
      v.set(x, Y, (r() * 2 - 1) * W);
      return toPath(x);
    }
    // Lift-off: spacing widens as it accelerates.
    const t = r();
    const d = Math.pow(t, 1.7);
    v.set(L1 + d * 1.85, Y + Math.pow(d, 1.55) * 2.35, 0);
    v.addScalar(jitter(r) * (0.015 + d * 0.03));
    return 0.6 + t * 0.4;
  });
}

/** Continuity → "Continuity link": interlocking chain links. */
function rings(n: number) {
  const LINKS = 3;
  const GAP = 1.22;
  const AX = 0.92;
  const AY = 0.52;
  return buildShape(n, 53, new THREE.Euler(0.32, -0.4, 0.1), (r, v) => {
    if (r() < 0.93) {
      const link = Math.floor(r() * LINKS);
      const theta = r() * Math.PI * 2;
      const cx = (link - (LINKS - 1) / 2) * GAP;
      const tube = 0.055;
      const a = Math.cos(theta) * AX + jitter(r) * tube;
      const b = Math.sin(theta) * AY + jitter(r) * tube;
      // Alternate links stand at right angles so they interlock.
      if (link % 2 === 0) v.set(cx + a, b, jitter(r) * tube);
      else v.set(cx + a, jitter(r) * tube, b);
      return (link + theta / (Math.PI * 2)) / LINKS;
    }
    // Loose dust around the chain.
    v.set((r() * 2 - 1) * 2.6, (r() * 2 - 1) * 1.3, (r() * 2 - 1) * 1.3);
    return r();
  });
}

export const BUILDERS: Record<InstrumentShape, (n: number) => ShapeBuffer> = { prism, lattice, runway, rings };

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform vec4 uFrom;
  uniform vec4 uTo;
  uniform float uScale;
  uniform float uDist;
  uniform vec3 uDeep;
  uniform vec3 uEm;
  uniform vec3 uHot;
  /** Hover emphasis (about-page cards): brighter, larger signal pulses. 0 on the home page. */
  uniform float uBoost;

  attribute vec3 aP1;
  attribute vec3 aP2;
  attribute vec3 aP3;
  attribute vec4 aPath;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  ${SIMPLEX_3D}

  vec3 shapeAt(vec4 w) {
    return position * w.x + aP1 * w.y + aP2 * w.z + aP3 * w.w;
  }

  void main() {
    // Each particle departs on its own delay, so the morph ripples.
    float t = clamp((uProgress - aSeed * 0.45) / 0.55, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(shapeAt(uFrom), shapeAt(uTo), t);

    // Loosen into a swirl mid-flight; a faint shimmer at rest.
    float flight = sin(t * 3.14159265);
    vec3 q = p * 0.55 + vec3(0.0, 0.0, uTime * 0.12);
    vec3 swirl = vec3(snoise(q), snoise(q + 31.7), snoise(q + 57.3));
    p += swirl * (0.03 + flight * 0.85);

    // Travelling signal pulses.
    float path = mix(dot(aPath, uFrom), dot(aPath, uTo), t);
    float flow = fract(path * 2.0 - uTime * 0.22);
    float pulse = pow(flow, 14.0 - uBoost * 6.0) * (1.0 - flight);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = (0.03 + aSeed * 0.024) * (1.0 + pulse * (1.1 + uBoost * 0.6) + flight * 0.35 + uBoost * 0.12);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;

    float hot = step(0.93, fract(aSeed * 13.7));
    vec3 base = mix(uDeep, uEm, 0.45 + 0.55 * fract(aSeed * 7.31));
    vColor = mix(base, uHot, max(pulse, hot * 0.75));
    float depth = clamp(1.0 - (-mv.z - uDist) * 0.2, 0.35, 1.0);
    vAlpha = (0.5 + 0.5 * pulse + hot * 0.2 + uBoost * 0.2) * depth;
  }
`;

export const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = pow(1.0 - d * 2.0, 1.7);
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

export const oneHot = (index: number, out: THREE.Vector4) =>
  out.set(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0, index === 3 ? 1 : 0);

/** Particle cloud holding every form (`position`, aP1…aP3), with per-particle flow paths and seeds. */
export function createInstrumentGeometry(count: number) {
  const g = new THREE.BufferGeometry();
  const built = SHAPES.map((shape) => BUILDERS[shape](count));
  const path = new Float32Array(count * 4);
  const seeds = new Float32Array(count);
  const r = prng(7);
  for (let i = 0; i < count; i++) {
    for (let s = 0; s < 4; s++) path[i * 4 + s] = built[s].path[i];
    seeds[i] = r();
  }
  g.setAttribute("position", new THREE.BufferAttribute(built[0].pos, 3));
  g.setAttribute("aP1", new THREE.BufferAttribute(built[1].pos, 3));
  g.setAttribute("aP2", new THREE.BufferAttribute(built[2].pos, 3));
  g.setAttribute("aP3", new THREE.BufferAttribute(built[3].pos, 3));
  g.setAttribute("aPath", new THREE.BufferAttribute(path, 4));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  // Morphing moves points outside the rest bounds; never cull.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  return g;
}

export function createInstrumentMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uFrom: { value: new THREE.Vector4(1, 0, 0, 0) },
      uTo: { value: new THREE.Vector4(1, 0, 0, 0) },
      uScale: { value: 1 },
      uDist: { value: 13 },
      uDeep: { value: color(PALETTE.deep) },
      uEm: { value: color(PALETTE.em) },
      uHot: { value: color(PALETTE.hot) },
      uBoost: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Radius of the dial ring around the instrument. */
export const DIAL_RADIUS = 3.2;

/** Dial: a slowly turning tick ring plus one arc per principle (the active arc is lit by the scene). */
export function createDial(count: number) {
  const ticks: number[] = [];
  const TICKS = 96;
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2;
    const inner = i % 8 === 0 ? DIAL_RADIUS - 0.16 : DIAL_RADIUS - 0.07;
    ticks.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a) * DIAL_RADIUS, Math.sin(a) * DIAL_RADIUS, 0);
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
  const tickMaterial = new THREE.LineBasicMaterial({
    color: PALETTE.em,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const segments = Math.max(1, count);
  const span = (Math.PI * 2) / segments;
  const arcs = Array.from({ length: segments }, (_, q) => {
    const pts: number[] = [];
    const start = Math.PI / 2 - q * span - span * 0.06;
    const end = start - span * 0.88;
    for (let s = 0; s <= 40; s++) {
      const a = start + (end - start) * (s / 40);
      pts.push(Math.cos(a) * (DIAL_RADIUS + 0.14), Math.sin(a) * (DIAL_RADIUS + 0.14), 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const material = new THREE.LineBasicMaterial({
      color: PALETTE.hot,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    return { line: new THREE.Line(geometry, material), geometry, material };
  });

  const dispose = () => {
    tickGeometry.dispose();
    tickMaterial.dispose();
    arcs.forEach((a) => {
      a.geometry.dispose();
      a.material.dispose();
    });
  };
  return { tickGeometry, tickMaterial, arcs, dispose };
}
