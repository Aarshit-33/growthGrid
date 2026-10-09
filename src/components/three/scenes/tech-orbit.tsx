"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { techLogoColor, techLogoSvg } from "@/components/ui/tech-logo";
import { activeTech, pointers, stageStore, techStore, techTooltip } from "../store";
import type { TechSceneData } from "../types";
import { GridGround, createGlassGeometry, createGlassMaterial, flush, setGlow, useDispose, type OpacityCtl } from "./journey/kit";
import { PALETTE, damp, glowTexture, useSceneReady, useSceneTime } from "./shared";

/* ─────────────────────────────────────────────────────────────
   Technology orbit: the studio's stack as a small solar system.
   One orbit per discipline, one planet per technology. Planets
   are camera-facing badges drawn on a 2D canvas (no font files
   to fetch). Hover and taps are raycast by hand against the
   shared pointer store, and the scene positions a DOM tooltip
   over whichever planet is in focus. Orbits slow to a crawl
   while something is being inspected.
   Styled with the story kit: the core is a cube of glass grid
   cells, orbits are dashed grid rings with tick marks, and the
   category colours are muted toward the brand emerald.
   ───────────────────────────────────────────────────────────── */

const R0 = 1.12;
const STEP = 0.41;
const BADGE = 128;
/** Grid-cube core: cells per side, cell size and pitch. */
const CORE_N = 3;
const CORE_CELL = 0.2;
const CORE_PITCH = 0.25;
const CORE_COUNT = CORE_N * CORE_N * CORE_N;

interface Planet {
  slug: string;
  short: string;
  color: string;
  category: string;
  ring: number;
  phase: number;
}

/** Display font family from next/font's CSS variable (falls back to system). */
function displayFont() {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-space-grotesk").trim();
  return family || "ui-sans-serif, system-ui, sans-serif";
}

function drawBadge(ctx: CanvasRenderingContext2D, planet: Planet, family: string, logo?: HTMLImageElement | null) {
  const c = BADGE / 2;
  ctx.clearRect(0, 0, BADGE, BADGE);
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(6, 11, 15, 0.94)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = `#${muted(planet.color, 0.3).getHexString()}`;
  ctx.stroke();
  // The technology's logo; its short label until the logo has decoded.
  if (logo?.complete && logo.naturalWidth) {
    const s = BADGE * 0.46;
    ctx.drawImage(logo, c - s / 2, c - s / 2, s, s);
    return;
  }
  ctx.fillStyle = "#f0f4f7";
  ctx.font = `600 ${planet.short.length >= 3 ? 34 : 44}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(planet.short, c, c + 2);
}

/** A dashed grid ring: short arcs with gaps, plus a radial tick every 30°. */
function gridRingPoints(radius: number, dashes = 72) {
  const pts: number[] = [];
  const span = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) {
    const a0 = i * span;
    const a1 = a0 + span * 0.55;
    pts.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius, Math.cos(a1) * radius, 0, Math.sin(a1) * radius);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = radius - 0.05;
    const r1 = radius + 0.05;
    pts.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** Category colour muted toward the brand emerald. */
const muted = (hex: string, amount = 0.45) => new THREE.Color(hex).lerp(new THREE.Color(PALETTE.em), amount);

export function TechOrbit({
  data,
}: {
  track: RefObject<HTMLDivElement | null>;
  data: TechSceneData;
}) {
  const size = useThree((s) => s.size);
  const compact = size.width < 560;
  const time = useSceneTime(8);
  useSceneReady("technology");

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const systemRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Group>(null);
  const cellsRef = useRef<THREE.InstancedMesh>(null);
  const waveRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const spriteRefs = useRef<(THREE.Sprite | null)[]>([]);

  const rings = useMemo(
    () =>
      data.categories.map((cat, i) => ({
        key: cat.key,
        color: cat.color,
        radius: R0 + i * STEP,
        // Slight, alternating inclinations read as a real system, not a target.
        tiltX: (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.012),
        tiltZ: (i % 3 === 0 ? -1 : 1) * 0.04,
        speed: 0.22 * Math.pow(R0 / (R0 + i * STEP), 1.5),
      })),
    [data],
  );

  const planets = useMemo<Planet[]>(
    () =>
      data.categories.flatMap((cat, ring) =>
        cat.technologies.map((tech, j) => ({
          slug: tech.slug,
          short: tech.short,
          color: cat.color,
          category: cat.key,
          ring,
          phase: (j / cat.technologies.length) * Math.PI * 2 + ring * 0.93,
        })),
      ),
    [data],
  );

  /* GPU resources: one badge texture + material per planet, one line per orbit. */
  const resources = useMemo(() => {
    const family = displayFont();
    const badges = planets.map((planet) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = BADGE;
      const ctx = canvas.getContext("2d")!;
      drawBadge(ctx, planet, family);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      // Logo drawn from inline SVG (no network); redraw the badge once decoded.
      const svg = techLogoSvg(planet.slug, techLogoColor(planet.slug, planet.color), BADGE);
      const logo = svg ? new Image() : null;
      if (logo && svg) {
        logo.onload = () => {
          drawBadge(ctx, planet, displayFont(), logo);
          texture.needsUpdate = true;
        };
        logo.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }
      return { canvas, ctx, texture, material, logo };
    });
    const orbits = rings.map((ring) => ({
      geometry: gridRingPoints(ring.radius),
      material: new THREE.LineBasicMaterial({
        color: muted(ring.color),
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      }),
    }));
    const glow = glowTexture();
    const glowMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: PALETTE.em,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreGlowMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: PALETTE.em,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { badges, orbits, glow, glowMaterial, coreGlowMaterial };
  }, [planets, rings]);

  // Redraw badges once the display font has loaded.
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      const family = displayFont();
      resources.badges.forEach((b, i) => {
        drawBadge(b.ctx, planets[i], family, b.logo);
        b.texture.needsUpdate = true;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [resources, planets]);

  useEffect(
    () => () => {
      resources.badges.forEach((b) => {
        if (b.logo) b.logo.onload = null;
        b.texture.dispose();
        b.material.dispose();
      });
      resources.orbits.forEach((o) => {
        o.geometry.dispose();
        o.material.dispose();
      });
      resources.glow.dispose();
      resources.glowMaterial.dispose();
      resources.coreGlowMaterial.dispose();
    },
    [resources],
  );

  // Leaving the scene must not leave a stale hover or a visible tooltip behind.
  useEffect(
    () => () => {
      techStore.set({ hovered: null });
    },
    [],
  );

  /* Grid-cube core: 3×3×3 glass cells in the story kit's material. */
  const cellGeometry = useMemo(() => createGlassGeometry(CORE_COUNT), []);
  const cellMaterial = useMemo(() => createGlassMaterial({ face: PALETTE.em, edge: PALETTE.hot, faceAlpha: 0.1 }), []);
  useDispose(cellGeometry, cellMaterial);
  const cells = useMemo(() => {
    const list: THREE.Vector3[] = [];
    const mid = (CORE_N - 1) / 2;
    for (let x = 0; x < CORE_N; x++)
      for (let y = 0; y < CORE_N; y++)
        for (let z = 0; z < CORE_N; z++) list.push(new THREE.Vector3(x - mid, y - mid, z - mid).multiplyScalar(CORE_PITCH));
    return list;
  }, []);
  const cellObj = useMemo(() => new THREE.Object3D(), []);
  const cellTint = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = cellsRef.current;
    if (!mesh) return;
    cells.forEach((_, i) => mesh.setColorAt(i, cellTint.setScalar(1)));
    flush(mesh);
  }, [cells, cellTint]);
  const ground = useRef<OpacityCtl>({ opacity: 0.3 });

  const tmp = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      world: new THREE.Vector3(),
      scales: new Float32Array(planets.length).fill(1),
    }),
    [planets.length],
  );

  const live = useRef({ clock: 0, timeScale: 1, taps: pointers.technology.taps, hovered: null as string | null, yaw: 0, pitch: 0 });

  const pick = (cam: THREE.Camera, x: number, y: number): string | null => {
    tmp.ndc.set(x, y);
    tmp.raycaster.setFromCamera(tmp.ndc, cam);
    const sprites = spriteRefs.current.filter((s): s is THREE.Sprite => !!s);
    const hit = tmp.raycaster.intersectObjects(sprites, false)[0];
    return (hit?.object.userData.slug as string | undefined) ?? null;
  };

  useFrame((_, rawDelta) => {
    const cam = cameraRef.current;
    const system = systemRef.current;
    if (!cam || !system) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = stageStore.get().reduced;
    const s = live.current;
    const t = time.current;
    const p = pointers.technology;

    // Camera: ~38° above the orbital plane so rings fill the frame without
    // planets piling up on the core. Pulled back on tall viewports so every
    // orbit stays in frame.
    const aspect = size.width / Math.max(1, size.height);
    const k = Math.max(1, 1.12 / aspect);
    cam.position.set(0, 6.1 * k, 7.9 * k);
    cam.lookAt(0, -0.2, 0);

    // Pointer hover (mouse) and taps (any pointer) → store.
    const mouse = p.inside && p.type === "mouse";
    const hovered = mouse ? pick(cam, p.x, p.y) : null;
    if (hovered !== s.hovered) {
      s.hovered = hovered;
      techStore.set({ hovered });
    }
    if (p.taps !== s.taps) {
      s.taps = p.taps;
      const slug = pick(cam, p.x, p.y);
      const current = techStore.get().selected;
      techStore.set({ selected: slug && slug !== current ? slug : null });
    }

    const state = techStore.get();
    const active = activeTech(state);
    const category = state.category;
    const activePlanet = active ? planets.findIndex((pl) => pl.slug === active) : -1;

    // Orbits crawl while something is being inspected.
    s.timeScale = damp(s.timeScale, active || category ? 0.1 : 1, 3, dt);
    if (!reduced) s.clock += dt * s.timeScale;

    s.yaw = damp(s.yaw, mouse && !reduced ? p.x * 0.18 : 0, 2, dt);
    s.pitch = damp(s.pitch, mouse && !reduced ? -p.y * 0.08 : 0, 2, dt);
    system.rotation.set(s.pitch, s.yaw, 0);

    const base = compact ? 0.5 : 0.42;
    planets.forEach((planet, i) => {
      const sprite = spriteRefs.current[i];
      if (!sprite) return;
      const ring = rings[planet.ring];
      const angle = planet.phase + s.clock * ring.speed;
      sprite.position.set(Math.cos(angle) * ring.radius, 0, Math.sin(angle) * ring.radius);

      const isActive = i === activePlanet;
      const inCategory = !category || planet.category === category;
      const targetScale = base * (isActive ? 1.55 : category && inCategory ? 1.14 : 1);
      tmp.scales[i] = damp(tmp.scales[i], targetScale, 9, dt);
      sprite.scale.setScalar(tmp.scales[i]);

      const opacity = active ? (isActive ? 1 : 0.42) : inCategory ? 1 : 0.2;
      const material = resources.badges[i].material;
      material.opacity = damp(material.opacity, opacity, 8, dt);
    });

    resources.orbits.forEach((orbit, ci) => {
      const lit = rings[ci].key === category || (activePlanet >= 0 && planets[activePlanet].ring === ci);
      orbit.material.opacity = damp(orbit.material.opacity, lit ? 0.8 : active || category ? 0.1 : 0.26, 6, dt);
    });

    // Core: slow spin, and a ping wave rolling out every few seconds.
    // The grid cells part slightly as each wave leaves, then settle.
    const phase = reduced ? 0 : (t * 0.25) % 1;
    if (coreRef.current) coreRef.current.rotation.set(t * 0.21, t * 0.33, 0);
    const cellMesh = cellsRef.current;
    if (cellMesh) {
      const spread = 1 + Math.pow(1 - phase, 6) * 0.35;
      cells.forEach((c, i) => {
        const centre = c.lengthSq() < 1e-6;
        cellObj.position.copy(c).multiplyScalar(spread);
        cellObj.scale.setScalar(CORE_CELL * (centre ? 1.15 : 1));
        cellObj.updateMatrix();
        cellMesh.setMatrixAt(i, cellObj.matrix);
        setGlow(cellMesh, i, centre ? 0.9 : 0.25 + Math.pow(1 - phase, 4) * 0.4);
      });
      flush(cellMesh);
    }
    const wave = waveRef.current;
    if (wave) {
      const radius = 0.6 + phase * (R0 + STEP * Math.max(0, rings.length - 1) + 0.4);
      wave.scale.setScalar(radius);
      (wave.material as THREE.MeshBasicMaterial).opacity = reduced ? 0 : 0.28 * Math.pow(1 - phase, 2);
    }

    // Halo + DOM tooltip follow the planet in focus.
    const glow = glowRef.current;
    const sprite = activePlanet >= 0 ? spriteRefs.current[activePlanet] : null;
    if (glow) {
      if (sprite) {
        sprite.getWorldPosition(tmp.world);
        glow.position.copy(tmp.world);
        resources.glowMaterial.color.set(planets[activePlanet].color);
      }
      resources.glowMaterial.opacity = damp(resources.glowMaterial.opacity, sprite ? 0.9 : 0, 8, dt);
      glow.scale.setScalar(base * 3.6);
    }
    const el = techTooltip.el;
    if (el && sprite) {
      sprite.getWorldPosition(tmp.world).project(cam);
      const x = (tmp.world.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.world.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={36} near={0.1} far={80} position={[0, 3.5, 9.6]} />
      <GridGround ctl={ground} radius={4.6} y={-0.55} />
      <group ref={systemRef}>
        {/* Core: the grid at the centre of everything. */}
        <group ref={coreRef}>
          <instancedMesh ref={cellsRef} args={[cellGeometry, cellMaterial, CORE_COUNT]} frustumCulled={false} />
        </group>
        <sprite material={resources.coreGlowMaterial} scale={2.2} />
        <mesh ref={waveRef} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.985, 1, 128]} />
          <meshBasicMaterial color={PALETTE.hot} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>

        {rings.map((ring, ci) => (
          <group key={ring.key} rotation={[ring.tiltX, 0, ring.tiltZ]}>
            <lineSegments geometry={resources.orbits[ci].geometry} material={resources.orbits[ci].material} />
            {planets.map((planet, i) =>
              planet.ring === ci ? (
                <sprite
                  key={planet.slug}
                  ref={(el) => {
                    spriteRefs.current[i] = el;
                  }}
                  material={resources.badges[i].material}
                  userData={{ slug: planet.slug }}
                />
              ) : null,
            )}
          </group>
        ))}
      </group>
      <sprite ref={glowRef} material={resources.glowMaterial} />
    </>
  );
}
