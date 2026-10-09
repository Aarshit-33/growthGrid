import {
  Activity,
  BookOpen,
  Compass,
  Gauge,
  Globe,
  GraduationCap,
  Handshake,
  Hourglass,
  KeyRound,
  Layers,
  LifeBuoy,
  MousePointerClick,
  RefreshCw,
  Repeat,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingDown,
  Unplug,
  Workflow,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { IconName } from "@/lib/schemas";

/**
 * Content → icon map. Typed as `Record<IconName, …>` so adding a name to
 * ICON_NAMES without mapping it here is a compile error.
 */
const ICONS: Record<IconName, LucideIcon> = {
  layers: Layers,
  globe: Globe,
  smartphone: Smartphone,
  sparkles: Sparkles,
  workflow: Workflow,
  "refresh-cw": RefreshCw,
  gauge: Gauge,
  hourglass: Hourglass,
  unplug: Unplug,
  "mouse-pointer-click": MousePointerClick,
  repeat: Repeat,
  "trending-down": TrendingDown,
  rocket: Rocket,
  handshake: Handshake,
  compass: Compass,
  "shield-check": ShieldCheck,
  zap: Zap,
  target: Target,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  "key-round": KeyRound,
  activity: Activity,
  "life-buoy": LifeBuoy,
};

export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const Component = ICONS[name];
  return <Component aria-hidden="true" strokeWidth={1.6} {...props} />;
}

/** True for names the map above can draw (used by the admin's icon picker). */
export const isIconName = (name: unknown): name is IconName => typeof name === "string" && Object.hasOwn(ICONS, name);
