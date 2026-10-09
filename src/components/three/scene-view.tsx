"use client";

import { View } from "@react-three/drei";
import type { RefObject } from "react";
import { GrowthField } from "./scenes/growth-field";
import { InstrumentCard } from "./scenes/instrument-card";
import { BuildScene } from "./scenes/journey/build";
import { CityScene } from "./scenes/journey/city";
import { ConnectScene } from "./scenes/journey/connect";
import { JourneyScene } from "./scenes/journey/journey";
import { PillarsScene } from "./scenes/journey/pillars";
import { StackScene } from "./scenes/journey/stack";
import { PrinciplesInstrument } from "./scenes/principles-instrument";
import { TechOrbit } from "./scenes/tech-orbit";
import type { SceneProps } from "./types";

/**
 * Renders a drei <View> that tracks its slot. Outside the canvas, drei
 * tunnels the children into the shared stage's <View.Port />, where they
 * are drawn with a scissor over this element's rectangle.
 */
export default function SceneView({
  scene,
  track,
}: {
  scene: SceneProps;
  track: RefObject<HTMLDivElement | null>;
}) {
  return (
    <View className="absolute inset-0">
      {scene.id === "hero" && <GrowthField track={track} />}
      {scene.id === "principles" && <PrinciplesInstrument track={track} data={scene.data} />}
      {scene.id === "instrument" && <InstrumentCard track={track} data={scene.data} />}
      {scene.id === "technology" && <TechOrbit track={track} data={scene.data} />}
      {scene.id === "journey" && <JourneyScene data={scene.data} />}
      {scene.id === "connect" && <ConnectScene />}
      {scene.id === "city" && <CityScene data={scene.data} />}
      {scene.id === "build" && <BuildScene data={scene.data} />}
      {scene.id === "stack" && <StackScene data={scene.data} />}
      {scene.id === "pillars" && <PillarsScene data={scene.data} />}
    </View>
  );
}
