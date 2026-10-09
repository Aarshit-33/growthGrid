/* Serializable scene inputs. Server components pass these through
   <SceneSlot>, so this file must stay free of three.js imports. */

export type InstrumentShape = "prism" | "lattice" | "runway" | "rings";

export interface PrinciplesSceneData {
  /** One shape per principle, in display order. */
  shapes: InstrumentShape[];
}

export interface InstrumentSceneData {
  /** The one instrument this card shows. */
  shape: InstrumentShape;
  /** This principle's place in the set (lights its arc on the dial). */
  index: number;
  total: number;
}

export interface TechSceneData {
  categories: {
    key: string;
    color: string;
    technologies: { slug: string; short: string }[];
  }[];
}

export interface JourneySceneData {
  /** One accent colour per service (blueprint layer), in display order. */
  accents: string[];
}

export interface CitySceneData {
  /** Number of case studies (one tower each, in list order). */
  count: number;
}

export interface BuildSceneData {
  /** Narrative sections on the case study; each one adds floors. */
  sections: number;
}

export interface StackSceneData {
  /** One accent colour per service (layer), bottom to top, in display order. */
  accents: string[];
  /** One motif key per layer (the service slug). */
  motifs: string[];
  /** Layer lifted out of the stack (service detail), or -1 on the index. */
  active: number;
}

export interface PillarsSceneData {
  /** Number of stats (one pillar each, rising left to right). */
  count: number;
}

export type SceneProps =
  | { id: "hero" }
  | { id: "principles"; data: PrinciplesSceneData }
  | { id: "instrument"; data: InstrumentSceneData }
  | { id: "technology"; data: TechSceneData }
  | { id: "journey"; data: JourneySceneData }
  | { id: "connect" }
  | { id: "city"; data: CitySceneData }
  | { id: "build"; data: BuildSceneData }
  | { id: "stack"; data: StackSceneData }
  | { id: "pillars"; data: PillarsSceneData };
