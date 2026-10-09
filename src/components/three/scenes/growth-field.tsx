"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { pointers, stageStore } from "../store";
import { HASH, SIMPLEX_3D } from "./glsl";
import { FIELD, FIELD_LOOK, FIELD_VIEWS } from "./growth-field-shape";
import { useCompact } from "./journey/kit";
import { PALETTE, color, damp, scrollProgress, useSceneReady, useSceneTime } from "./shared";

/* ─────────────────────────────────────────────────────────────
   Growth Field: the hero's living grid. One instanced draw call
   of columns whose height, glow and "live data" pings are all
   computed in the vertex shader. The field rises from the centre
   on load, swells toward the cursor (or wanders on its own on
   touch), and grows taller as the visitor scrolls, a literal
   picture of the brand promise. (The story's staircase is kept
   for the Growth Grid section alone.)
   ───────────────────────────────────────────────────────────── */

const SPACING = FIELD.spacing;
const CELL = FIELD.cell;
const FRONT_Z = FIELD.front;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uGrowth;
  uniform vec3 uPointer; // world x, world z, strength

  attribute vec2 aCell;
  attribute float aSeed;

  varying float vLevel;
  varying float vLocalY;
  varying float vTop;
  varying float vShade;
  varying float vGlow;
  varying float vFog;

  ${SIMPLEX_3D}
  ${HASH}

  void main() {
    vec2 cell = aCell;

    // Terrain: a slow, broad swell plus finer detail.
    float swell = snoise(vec3(cell * 0.105, uTime * 0.065)) * 0.5 + 0.5;
    float detail = snoise(vec3(cell * 0.43 + 17.0, uTime * 0.17)) * 0.5 + 0.5;
    float h = 0.05 + pow(swell, 2.6) * 2.0 + detail * 0.2;

    // Growth: scrolling raises the field, most of all toward the horizon.
    float depth = clamp((FRONT - cell.y) / 16.0, 0.0, 1.0);
    h *= 0.72 + uGrowth * (0.5 + depth * 1.6);

    // Pointer attractor.
    float d = distance(cell, uPointer.xy);
    float lift = exp(-d * d * 0.3) * uPointer.z;
    h += lift * 1.7;

    // Live pings: a few cells flash, then decay, every cycle.
    float t = uTime * 0.3 + aSeed * 9.0;
    float ping = step(0.968, hash11(aSeed * 113.0 + floor(t))) * pow(1.0 - fract(t), 3.0);
    h += ping * 0.85;

    // Intro: columns rise outward from the front centre.
    float delay = length(cell - vec2(0.0, FRONT - 3.0)) / 17.0;
    float rise = clamp((uIntro * 1.4 - delay) / 0.4, 0.0, 1.0);
    rise = 1.0 - pow(1.0 - rise, 3.0);
    h = max(h * rise, 0.002);

    vec3 p = position;
    p.y *= h;
    p.xz += cell;

    vLevel = clamp(h / 2.3, 0.0, 1.0);
    vLocalY = position.y;
    vTop = step(0.5, normal.y);
    vShade = abs(normal.x) * 0.3 + abs(normal.z) * 0.62;
    vGlow = max(lift * 0.85, ping);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFog = smoothstep(8.5, 23.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uEm;
  uniform vec3 uHot;
  uniform vec3 uBg;

  varying float vLevel;
  varying float vLocalY;
  varying float vTop;
  varying float vShade;
  varying float vGlow;
  varying float vFog;

  void main() {
    // Sides: dark glass that catches emerald light near the top edge.
    vec3 side = mix(uBase, uEm * 0.32, pow(vLocalY, 3.0) * (0.3 + vLevel));
    side *= 0.5 + vShade;

    // Tops: the taller the column, the hotter it glows.
    vec3 top = mix(uEm * 0.16, uHot, smoothstep(0.22, 1.0, vLevel));

    vec3 col = mix(side, top, vTop);
    col += uHot * vGlow * (0.3 + 0.7 * vTop);
    col = mix(col, uBg, vFog);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function GrowthField({ track }: { track: RefObject<HTMLDivElement | null> }) {
  const compact = useCompact();
  const view = FIELD_VIEWS[compact ? "compact" : "wide"];
  const cols = view.cols;
  const rows = view.rows;
  const count = cols * rows;

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const time = useSceneTime(18);
  useSceneReady("hero");

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(CELL, 1, CELL);
    g.translate(0, 0.5, 0);
    const cells = new Float32Array(count * 2);
    const seeds = new Float32Array(count);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells[i * 2] = (c - (cols - 1) / 2) * SPACING;
        cells[i * 2 + 1] = FRONT_Z - r * SPACING;
        seeds[i] = Math.random();
        i++;
      }
    }
    g.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    return g;
  }, [cols, rows, count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        defines: { FRONT: FRONT_Z.toFixed(2) },
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uGrowth: { value: 0 },
          uPointer: { value: new THREE.Vector3() },
          uBase: { value: color(PALETTE.base) },
          uEm: { value: color(PALETTE.em) },
          uHot: { value: color(PALETTE.hot) },
          uBg: { value: color(PALETTE.bg) },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const tmp = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    [],
  );
  const live = useRef({ intro: 0, growth: 0, px: 0, pz: 2, strength: 0, camX: 0 });

  useFrame((_, rawDelta) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const t = time.current;

    s.intro = reduced ? 1 : Math.min(1, s.intro + dt / 2.8);
    s.growth = damp(s.growth, reduced ? 0 : scrollProgress(track.current), 6, dt);

    // Where the field should swell: under the cursor, at the last tap, or
    // an autonomous wanderer when nobody is interacting.
    const p = pointers.hero;
    const mouse = p.inside && p.type === "mouse";
    const touch = p.type !== "mouse" && performance.now() - p.at < 2600;
    let tx = s.px;
    let tz = s.pz;
    let strength: number;
    if (!reduced && (mouse || touch)) {
      tmp.ndc.set(p.x, p.y);
      tmp.raycaster.setFromCamera(tmp.ndc, cam);
      if (tmp.raycaster.ray.intersectPlane(tmp.plane, tmp.hit)) {
        tx = tmp.hit.x;
        tz = tmp.hit.z;
      }
      strength = 1;
    } else {
      tx = Math.sin(t * 0.21) * (compact ? 2.4 : 5.6);
      tz = 1 + Math.cos(t * 0.13) * 3.4;
      strength = reduced ? 0 : 0.55;
    }
    s.px = damp(s.px, tx, 4.5, dt);
    s.pz = damp(s.pz, tz, 4.5, dt);
    s.strength = damp(s.strength, strength, 3, dt);

    const u = material.uniforms;
    u.uTime.value = t;
    u.uIntro.value = s.intro;
    u.uGrowth.value = s.growth;
    u.uPointer.value.set(s.px, s.pz, s.strength);

    // Camera: gentle parallax with the mouse; rises and leans in on scroll.
    s.camX = damp(s.camX, mouse && !reduced ? p.x * 0.55 : 0, 2.5, dt);
    const g = s.growth;
    cam.position.set(s.camX, view.camY + g * 2.4, view.camZ - g * 2.6);
    tmp.look.set(s.camX * 0.4, FIELD_LOOK.y - g * 0.5, FIELD_LOOK.z);
    cam.lookAt(tmp.look);
  });

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={view.fov}
        near={0.1}
        far={60}
        position={[0, FIELD_VIEWS.wide.camY, FIELD_VIEWS.wide.camZ]}
      />
      <instancedMesh key={count} args={[geometry, material, count]} frustumCulled={false} />
    </>
  );
}
