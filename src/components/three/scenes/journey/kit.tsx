"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
import * as THREE from "three";
import { PALETTE, color, glowTexture } from "../shared";

/* ─────────────────────────────────────────────────────────────
   The story kit ("from ground to summit"). Every object on the
   journey is a box standing on the same grid, drawn with one
   material: see-through glass faces plus crisp, screen-space
   edges computed in the fragment shader (no line geometry, so
   everything instances into a single draw call). Glow comes from
   additive halos and sprites, never post-processing, because the
   shared canvas renders scissored views.
   ───────────────────────────────────────────────────────────── */

/** Grid pitch shared by the ground, the fragments and the towers. */
export const GRID = 0.72;

const COMPACT_QUERY = "(max-width: 767px)";

/**
 * Phone layout. Read from the window, not useThree(): inside a drei View
 * portal the R3F size reports 0 × 0.
 */
export function useCompact() {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(COMPACT_QUERY);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

/* ── Glass box material ─────────────────────────────────────── */

const glassVertex = /* glsl */ `
  attribute float aGlow;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vTint;
  varying float vGlow;
  varying float vFog;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = model * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;

    vLocal = position;
    // Boxes are only rotated and scaled on their own axes, so this stays exact.
    vNormal = normalize(mat3(viewMatrix) * mat3(model) * normal);
    vView = normalize(-mv.xyz);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    vGlow = aGlow;
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const glassFragment = /* glsl */ `
  uniform vec3 uFace;
  uniform vec3 uEdge;
  uniform float uFaceAlpha;
  uniform float uOpacity;
  uniform float uLevel;

  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vTint;
  varying float vGlow;
  varying float vFog;

  void main() {
    // Distance (in pixels) to the nearest box edge: on each face one axis is
    // pinned at ±0.5, so the second-smallest axis distance is the edge distance.
    vec3 p = vLocal;
    vec3 d = (0.5 - abs(p)) / max(fwidth(p), vec3(1e-5));
    float lo = min(d.x, min(d.y, d.z));
    float hi = max(d.x, max(d.y, d.z));
    float mid = d.x + d.y + d.z - lo - hi;
    float edge = 1.0 - smoothstep(0.5, 1.6, mid);
    float halo = exp(-mid * 0.16);

    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    vec3 face = uFace * vTint;
    vec3 line = uEdge * vTint;

    vec3 col = face * (0.45 + fresnel * 0.9) + line * (edge * (1.0 + vGlow) + halo * (0.25 + vGlow * 0.6));
    float alpha = uFaceAlpha * (0.45 + fresnel) + edge * (0.6 + vGlow * 0.4) + halo * (0.12 + vGlow * 0.3) + vGlow * 0.1;

    // Fill level (the summit step): below it the box turns solid, with a bright
    // meniscus line riding on top.
    if (uLevel > 0.001) {
      float surface = uLevel - 0.5;
      float aa = fwidth(p.y) * 1.5;
      float solid = 1.0 - smoothstep(surface - aa, surface + aa, p.y);
      float rim = (1.0 - smoothstep(0.0, aa * 3.0, abs(p.y - surface))) * step(uLevel, 0.995);
      col = mix(col, mix(face, line, 0.35) * (0.9 + fresnel * 0.5), solid * 0.92) + line * rim;
      alpha = max(alpha, solid * 0.86 + rim);
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uOpacity * (1.0 - vFog));
    #include <colorspace_fragment>
  }
`;

export interface GlassOptions {
  face?: string;
  edge?: string;
  faceAlpha?: number;
  fog?: readonly [number, number];
}

export function createGlassMaterial({
  face = PALETTE.deep,
  edge = PALETTE.hot,
  faceAlpha = 0.1,
  fog = [16, 44],
}: GlassOptions = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFace: { value: color(face) },
      uEdge: { value: color(edge) },
      uFaceAlpha: { value: faceAlpha },
      uOpacity: { value: 1 },
      uLevel: { value: 0 },
      uFogNear: { value: fog[0] },
      uFogFar: { value: fog[1] },
    },
    vertexShader: glassVertex,
    fragmentShader: glassFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Unit box with a per-instance glow attribute (0…1). */
export function createGlassGeometry(count: number) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("aGlow", glow);
  return g;
}

/** Dispose GPU resources when they are replaced or the scene unmounts. */
export function useDispose(...items: { dispose: () => void }[]) {
  useEffect(() => () => items.forEach((item) => item.dispose()), items); // eslint-disable-line react-hooks/exhaustive-deps
}

export const setGlow = (mesh: THREE.InstancedMesh, i: number, v: number) => {
  (mesh.geometry.getAttribute("aGlow") as THREE.InstancedBufferAttribute).setX(i, v);
};

/** Flag instance buffers for upload after a frame's writes. */
export function flush(mesh: THREE.InstancedMesh, matrices = true) {
  if (matrices) mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.geometry.getAttribute("aGlow").needsUpdate = true;
}

/* ── Grid ground ────────────────────────────────────────────── */

const groundVertex = /* glsl */ `
  varying vec3 vWorld;
  varying float vFog;
  uniform float uFogNear;
  uniform float uFogFar;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    vWorld = world.xyz;
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const groundFragment = /* glsl */ `
  uniform vec3 uLine;
  uniform vec3 uDot;
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uSpacing;
  varying vec3 vWorld;
  varying float vFog;
  void main() {
    // Lines sit between cells, so tiles and towers stand inside the squares.
    vec2 g = vWorld.xz / uSpacing;
    vec2 w = max(fwidth(g), vec2(1e-5));
    vec2 f = abs(fract(g) - 0.5) / w;
    float line = 1.0 - min(min(f.x, f.y), 1.0);
    float dist = length(fract(g) - 0.5) / max(w.x, w.y);
    float dotMask = 1.0 - smoothstep(1.2, 2.4, dist);
    float fade = 1.0 - smoothstep(0.25, 1.0, length(vWorld.xz) / uRadius);
    vec3 col = mix(uLine, uDot, dotMask);
    float alpha = (line * 0.2 + dotMask * 0.75) * fade * uOpacity * (1.0 - vFog);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export interface OpacityCtl {
  opacity: number;
}

export function GridGround({
  ctl,
  radius = 14,
  y = 0,
}: {
  ctl: RefObject<OpacityCtl>;
  radius?: number;
  y?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), [radius]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uLine: { value: color(PALETTE.deep) },
          uDot: { value: color(PALETTE.em) },
          uOpacity: { value: 0 },
          uRadius: { value: radius },
          uSpacing: { value: GRID },
          uFogNear: { value: 18 },
          uFogFar: { value: 46 },
        },
        vertexShader: groundVertex,
        fragmentShader: groundFragment,
        transparent: true,
        depthWrite: false,
      }),
    [radius],
  );
  useDispose(geometry, material);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = ctl.current.opacity;
    mesh.visible = o > 0.002;
    material.uniforms.uOpacity.value = o;
  });

  return <mesh ref={ref} geometry={geometry} material={material} position-y={y} renderOrder={-1} />;
}

/* ── Spiral staircase (growth) ──────────────────────────────── */

export interface Tread {
  x: number;
  y: number;
  z: number;
  /** Rotation about Y so the tread's local X points outward. */
  rot: number;
  sx: number;
  sy: number;
  sz: number;
  /** Landing index (one per process step), or -1. */
  landing: number;
}

export interface StairLayout {
  count: number;
  treads: Tread[];
  /** Tread index of each landing. */
  landings: number[];
  rise: number;
  height: number;
  /** The empty "next step" just past the last tread. */
  top: Tread;
  angle: (j: number) => number;
  radius: number;
}

export function stairLayout(
  count: number,
  segments: number,
  {
    perTurn = 16,
    rise = 0.15,
    inner = 0.34,
    outer = 1.95,
    width = 0.5,
    thick = 0.07,
    marks,
  }: {
    perTurn?: number;
    rise?: number;
    inner?: number;
    outer?: number;
    width?: number;
    thick?: number;
    /** Explicit landing tread indices, ascending (overrides even segments). */
    marks?: readonly number[];
  } = {},
): StairLayout {
  const step = (Math.PI * 2) / perTurn;
  const mid = (inner + outer) / 2;
  const span = outer - inner;
  const seg = Math.max(1, Math.round(count / segments));
  const angle = (j: number) => j * step;
  const at = (j: number, landing: number, grow = 1): Tread => {
    const a = angle(j);
    const r = landing >= 0 ? mid + 0.12 : mid;
    return {
      x: Math.cos(a) * r,
      y: j * rise + thick / 2,
      z: Math.sin(a) * r,
      rot: -a,
      sx: landing >= 0 ? span * 1.18 : span,
      sy: thick * grow,
      sz: landing >= 0 ? width * 1.9 : width,
      landing,
    };
  };
  const treads: Tread[] = [];
  const landings: number[] = [];
  for (let j = 0; j < count; j++) {
    const isLanding = marks ? marks.includes(j) : (j + 1) % seg === 0 && landings.length < segments;
    if (isLanding) landings.push(j);
    treads.push(at(j, isLanding ? landings.length - 1 : -1));
  }
  const top = at(count + 1, -1);
  top.y = (count + 1) * rise + 0.22;
  top.sx = span * 1.25;
  top.sy = 0.44;
  top.sz = width * 2.3;
  return { count, treads, landings, rise, height: count * rise, top, angle, radius: outer };
}

export interface StairCtl {
  opacity: number;
  /** Treads lit so far (fractional tread index). */
  lit: number;
  /** Landing currently in focus, or -1. */
  active: number;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export function Staircase({
  layout,
  ctl,
  fog,
  idle = 0.28,
  fill = 0,
  fade,
}: {
  layout: StairLayout;
  ctl: RefObject<StairCtl>;
  /** View-distance fade [near, far] (default: the journey's long range). */
  fog?: readonly [number, number];
  /** Brightness of treads not yet climbed (low values make the stair read as a progress bar). */
  idle?: number;
  /** Steady glow on every climbed tread, so the climbed part reads as "filled". */
  fill?: number;
  /** If set, treads climbed more than this many treads ago settle to half brightness. */
  fade?: number;
}) {
  const treadsRef = useRef<THREE.InstancedMesh>(null);
  const columnRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const spritesRef = useRef<(THREE.Sprite | null)[]>([]);
  const { count, treads, landings, height } = layout;

  const geometry = useMemo(() => createGlassGeometry(count), [count]);
  const fogNear = fog?.[0];
  const fogFar = fog?.[1];
  const material = useMemo(
    () =>
      createGlassMaterial({
        face: "#0c3a2a",
        edge: PALETTE.em,
        faceAlpha: 0.32,
        fog: fogNear !== undefined && fogFar !== undefined ? [fogNear, fogFar] : undefined,
      }),
    [fogNear, fogFar],
  );
  const columnGeometry = useMemo(() => createGlassGeometry(1), []);
  const columnMaterial = useMemo(
    () =>
      createGlassMaterial({
        face: PALETTE.base,
        edge: PALETTE.deep,
        faceAlpha: 0.2,
        fog: fogNear !== undefined && fogFar !== undefined ? [fogNear, fogFar] : undefined,
      }),
    [fogNear, fogFar],
  );
  const glow = useMemo(() => glowTexture(), []);
  const spriteMaterials = useMemo(
    () =>
      landings.map(
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
    [landings, glow],
  );
  useDispose(geometry, material, columnGeometry, columnMaterial, glow);
  useEffect(() => () => spriteMaterials.forEach((m) => m.dispose()), [spriteMaterials]);

  useLayoutEffect(() => {
    const mesh = treadsRef.current;
    if (!mesh) return;
    treads.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.setScalar(0.3));
    });
    flush(mesh);
    mesh.computeBoundingSphere();
  }, [treads]);

  useFrame(() => {
    const mesh = treadsRef.current;
    const group = groupRef.current;
    if (!mesh || !group) return;
    const { opacity, lit, active } = ctl.current;
    group.visible = opacity > 0.002;
    if (!group.visible) return;
    material.uniforms.uOpacity.value = opacity;
    columnMaterial.uniforms.uOpacity.value = opacity * 0.8;

    for (let j = 0; j < count; j++) {
      // Climbed treads light up; the few just below the climber glow hottest.
      const reached = THREE.MathUtils.clamp(lit - j + 1, 0, 1);
      const trail = reached * Math.max(0, 1 - (lit - j) / 5);
      const t = treads[j];
      const focus = t.landing >= 0 && t.landing === active ? 1 : 0;
      const recent = fade ? 0.5 + 0.5 * Math.max(0, 1 - (lit - j) / fade) : 1;
      mesh.setColorAt(j, tint.setScalar(idle + reached * (1 - idle) * recent));
      setGlow(mesh, j, Math.min(1, trail * 0.7 + focus + reached * fill * recent + (t.landing >= 0 ? reached * 0.25 : 0)));
    }
    flush(mesh, false);

    landings.forEach((j, k) => {
      const sprite = spritesRef.current[k];
      if (!sprite) return;
      const reached = lit >= j - 0.5 ? 1 : 0;
      const focus = k === active ? 1 : 0;
      // Kept small and soft: the camera sits close, so a big halo blooms
      // into an orb behind the copy.
      spriteMaterials[k].opacity = opacity * (0.1 + reached * 0.22 + focus * 0.32);
      const s = 0.8 + focus * 0.55;
      sprite.scale.set(s, s, 1);
    });
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={treadsRef} args={[geometry, material, count]} />
      <mesh
        ref={columnRef}
        geometry={columnGeometry}
        material={columnMaterial}
        position={[0, height / 2 + 0.3, 0]}
        scale={[0.22, height + 0.6, 0.22]}
      />
      {landings.map((j, k) => {
        const t = treads[j];
        const out = layout.radius + 0.1;
        const a = layout.angle(j);
        return (
          <sprite
            key={j}
            ref={(el) => {
              spritesRef.current[k] = el;
            }}
            material={spriteMaterials[k]}
            position={[Math.cos(a) * out, t.y + 0.06, Math.sin(a) * out]}
          />
        );
      })}
    </group>
  );
}

/* ── Summit step ────────────────────────────────────────────── */

export interface StepCtl {
  opacity: number;
  /** How far the step has filled in, 0…1. */
  level: number;
  /** Extra glow (hover, success burst), 0…1. */
  pulse: number;
}

export function SummitStep({ tread, ctl, time }: { tread: Tread; ctl: RefObject<StepCtl>; time: RefObject<number> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => createGlassGeometry(1), []);
  const material = useMemo(() => createGlassMaterial({ face: PALETTE.em, edge: PALETTE.hot, faceAlpha: 0.05 }), []);
  const glow = useMemo(() => glowTexture(), []);
  const spriteMaterial = useMemo(
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
  useDispose(geometry, material, glow, spriteMaterial);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(tread.sx, tread.sy, tread.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
    mesh.setColorAt(0, tint.setScalar(1));
    flush(mesh);
    mesh.computeBoundingSphere();
  }, [tread]);

  useFrame(() => {
    const mesh = meshRef.current;
    const group = groupRef.current;
    const sprite = spriteRef.current;
    if (!mesh || !group || !sprite) return;
    const { opacity, level, pulse } = ctl.current;
    group.visible = opacity > 0.002;
    if (!group.visible) return;
    // An empty outline breathes, inviting the next step; it calms as it fills.
    const breathe = (Math.sin(time.current * 2.1) * 0.5 + 0.5) * (1 - level);
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uLevel.value = level;
    setGlow(mesh, 0, Math.min(1, 0.25 + breathe * 0.45 + pulse * 0.6 + level * 0.3));
    flush(mesh, false);
    spriteMaterial.opacity = opacity * (0.18 + level * 0.45 + pulse * 0.5 + breathe * 0.12);
    const s = 3.2 + level * 1.4 + pulse * 2.2;
    sprite.scale.set(s, s, 1);
  });

  return (
    <group ref={groupRef} position={[tread.x, tread.y, tread.z]} rotation-y={tread.rot}>
      <instancedMesh ref={meshRef} args={[geometry, material, 1]} />
      <sprite ref={spriteRef} material={spriteMaterial} position-y={0.1} />
    </group>
  );
}

/* ── Growth sparks ──────────────────────────────────────────── */

const sparkVertex = /* glsl */ `
  attribute vec4 aSeed; // disc x, disc z, phase, speed
  uniform float uTime;
  uniform float uHeight;
  uniform float uSize;
  uniform float uBurst;
  uniform float uPixel;
  varying float vAlpha;
  void main() {
    float t = fract(aSeed.z + uTime * aSeed.w * (1.0 + uBurst * 2.2) / uHeight);
    vec3 p = vec3(aSeed.x, t * uHeight, aSeed.y);
    p.xz *= 1.0 + t * (0.4 + uBurst * 0.8);
    p.x += sin(uTime * 0.9 + aSeed.z * 21.0) * 0.1;
    p.z += cos(uTime * 0.7 + aSeed.z * 13.0) * 0.1;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (1.0 + uBurst * 0.8) * (1.0 - t * 0.55) / max(0.5, -mv.z);
    vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t));
  }
`;

const sparkFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface SparkCtl {
  opacity: number;
  burst: number;
}

export function Sparks({
  count,
  radius,
  height,
  ctl,
  time,
  position,
}: {
  count: number;
  radius: number;
  height: number;
  ctl: RefObject<SparkCtl>;
  time: RefObject<number>;
  position?: [number, number, number];
}) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      seeds.set([Math.cos(a) * r, Math.sin(a) * r, Math.random(), 0.35 + Math.random() * 0.75], i * 4);
    }
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    // Positions are computed in the shader; this only sizes the draw.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count, radius]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: height },
          uSize: { value: 26 },
          uBurst: { value: 0 },
          uPixel: { value: 1 },
          uColor: { value: color(PALETTE.hot) },
          uOpacity: { value: 0 },
        },
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [height],
  );
  useDispose(geometry, material);

  useFrame(({ gl }) => {
    const points = ref.current;
    if (!points) return;
    const { opacity, burst } = ctl.current;
    points.visible = opacity > 0.002;
    const u = material.uniforms;
    u.uTime.value = time.current;
    u.uOpacity.value = opacity;
    u.uBurst.value = burst;
    u.uPixel.value = gl.getPixelRatio();
  });

  return <points ref={ref} geometry={geometry} material={material} position={position} frustumCulled={false} />;
}
