"use client";

import { useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────────
   Tiny state layer shared by the DOM tree and the WebGL tree.
   Scenes render inside the R3F reconciler (drei <View> tunnels
   them into the one canvas), so React context doesn't cross
   over. Everything the two sides share goes through here.
   This module must never import three.js; it ships with the
   initial bundle.
   ───────────────────────────────────────────────────────────── */

type Listener = () => void;

export interface Store<T extends object> {
  get: () => T;
  set: (patch: Partial<T> | ((state: T) => Partial<T>)) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const key in next) {
        if (!Object.is(next[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Subscribe to one primitive slice of a store (selectors must not allocate). */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const get = () => selector(store.get());
  return useSyncExternalStore(store.subscribe, get, get);
}

/* ── Stage ─────────────────────────────────────────────────── */

export type SceneId =
  | "hero"
  | "principles"
  | "instrument"
  | "technology"
  | "journey"
  | "connect"
  | "city"
  | "build"
  | "stack"
  | "pillars";

export const stageStore = createStore({
  /** WebGL is available and the canvas may mount (set after first idle). */
  enabled: false,
  /** The stage won't run on this page view (no GPU, data saver, or it
   *  failed): the static fallbacks are final, not placeholders. */
  off: false,
  /** prefers-reduced-motion: scenes render still frames. */
  reduced: false,
  /** Scenes that have drawn their first frame (fallbacks fade out). */
  heroReady: false,
  principlesReady: false,
  instrumentReady: false,
  technologyReady: false,
  journeyReady: false,
  connectReady: false,
  cityReady: false,
  buildReady: false,
  stackReady: false,
  pillarsReady: false,
});

export const readyKey = (id: SceneId) => `${id}Ready` as const;

/** Every scene's ready flag cleared (used when the stage unmounts). */
export const NOT_READY = {
  heroReady: false,
  principlesReady: false,
  instrumentReady: false,
  technologyReady: false,
  journeyReady: false,
  connectReady: false,
  cityReady: false,
  buildReady: false,
  stackReady: false,
  pillarsReady: false,
} as const;

/** Mark a scene's first frame as drawn (its CSS fallback fades out). */
export function setSceneReady(id: SceneId, ready: boolean) {
  stageStore.set({ [readyKey(id)]: ready } as Partial<ReturnType<typeof stageStore.get>>);
}

/** The stage failed (a chunk didn't load, a scene threw, the GPU dropped
 *  the context): unmount it and bring every static fallback back for the
 *  rest of this page view. The page itself never goes down with it. */
export function disableStage(reason?: unknown) {
  if (reason !== undefined) console.warn("[3D] stage disabled, showing static scenes:", reason);
  stageStore.set({ enabled: false, off: true, ...NOT_READY });
}

/** DOM elements of mounted scene slots, observed by the stage to pause
 *  the render loop when no 3D is on screen. Keyed by scene id, or
 *  `id:instance` when a scene appears in several slots on one page. */
export const slotRegistry = createStore<{ slots: ReadonlyMap<string, HTMLElement> }>({
  slots: new Map(),
});

export const slotKey = (id: SceneId, instance?: string) => (instance ? `${id}:${instance}` : id);

export function registerSlot(key: string, el: HTMLElement) {
  slotRegistry.set((s) => {
    const next = new Map(s.slots);
    next.set(key, el);
    return { slots: next };
  });
  return () =>
    slotRegistry.set((s) => {
      if (s.slots.get(key) !== el) return {};
      const next = new Map(s.slots);
      next.delete(key);
      return { slots: next };
    });
}

/* ── Pointer (mutable, read every frame, never triggers React) ── */

export interface PointerState {
  /** Normalised device coords relative to the slot (-1…1, y up). */
  x: number;
  y: number;
  /** The pointer is currently over the slot. */
  inside: boolean;
  /** Last pointer type seen (touch devices get an autonomous attractor). */
  type: string;
  /** performance.now() of the last move inside the slot. */
  at: number;
  /** Increments on every click/tap inside the slot (not on scroll gestures). */
  taps: number;
}

export const pointers: Record<SceneId, PointerState> = {
  hero: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  principles: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  instrument: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  technology: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  journey: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  connect: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  city: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  build: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  stack: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
  pillars: { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 },
};

const instancePointers = new Map<string, PointerState>();

/** Pointer state for a slot: shared per scene id, or its own for an `id:instance` slot. */
export function pointerFor(id: SceneId, instance?: string): PointerState {
  if (!instance) return pointers[id];
  const key = slotKey(id, instance);
  let p = instancePointers.get(key);
  if (!p) {
    p = { x: 0, y: 0, inside: false, type: "mouse", at: 0, taps: 0 };
    instancePointers.set(key, p);
  }
  return p;
}

/* ── Scene-specific state ──────────────────────────────────── */

export const principlesStore = createStore({ active: 0 });

export const techStore = createStore({
  /** Planet under the pointer (tech slug), written by the scene's raycast. */
  hovered: null as string | null,
  /** Tech hovered/focused in the DOM list. */
  focused: null as string | null,
  /** Planet pinned by click/tap or chosen from the list. */
  selected: null as string | null,
  /** Category highlighted from the legend. */
  category: null as string | null,
});

/** The tech currently in focus, by priority: pointer, list, pinned. */
export const activeTech = (s: ReturnType<typeof techStore.get>) => s.hovered ?? s.focused ?? s.selected;

/** DOM element the tech scene positions over the focused planet. */
export const techTooltip: { el: HTMLElement | null } = { el: null };

/* ── Home journey: "from ground to summit" ─────────────────────
   One fixed backdrop tells the story behind Problem → Services →
   Process → Work → CTA. The sections below write what the visitor
   is doing; the scene reads it every frame. Plain mutable object:
   writes never re-render anything. */

/** Home chapters the backdrop plays behind, in story order. */
export const JOURNEY_ZONES = [
  "#problem",
  "#services",
  "#process",
  "#work",
  "[data-journey-zone='summit']",
] as const;

export const journey = {
  /** Problem monitor repair progress, 0 (broken) … 1 (healed). */
  heal: 0,
  /** Problem card under the pointer (-1: none). */
  problem: -1,
  /** Service row under the pointer (-1: none). */
  service: -1,
  /** Services list scroll position, in rows: 0 when the first row's middle is
   *  at mid-screen … n-1 for the last, blended in between; -1 while the list
   *  is still below (-1…0 as the first row comes up). */
  serviceScroll: -1,
  /** Pinned process progress 0…1 (-1: not pinned, derive from scroll). */
  process: -1,
  /** Pinned work deck progress 0…1 (-1: not pinned, derive from scroll). */
  work: -1,
  /** A CTA action is hovered or focused: the summit step turns solid. */
  cta: false,
};

/* ── Work: the structures we built ─────────────────────────── */

/** Work index: one tower per case study, in list order. */
export const workCity = {
  /** Towers matching the active filter (empty: every tower matches). */
  match: [] as boolean[],
  /** Case study under the pointer or keyboard focus (-1: none). */
  hover: -1,
};

/** Case study narrative (Challenge → Stack). Its progress builds the tower. */
export const BUILD_ZONE = "[data-build-zone]";

/* ── The close ────────────────────────────────────────────── */

/** About stats: the stat cell under the pointer lights its pillar. */
export const PILLAR_ATTR = "data-stat-index";
