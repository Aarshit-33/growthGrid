import {
  BriefcaseBusiness,
  Bug,
  ChartColumn,
  CircleHelp,
  Compass,
  Cpu,
  FileText,
  House,
  Layers,
  LifeBuoy,
  MessageSquareQuote,
  Newspaper,
  Target,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CollectionName } from "@/lib/content/registry";
import type { PageKey } from "@/lib/schemas";

/** One icon per collection and page, shared by the sidebar, dashboard and lists. */
export const COLLECTION_ICONS: Record<CollectionName, LucideIcon> = {
  services: Layers,
  projects: BriefcaseBusiness,
  insights: Newspaper,
  testimonials: MessageSquareQuote,
  faqs: CircleHelp,
  team: UsersRound,
  process: Workflow,
  principles: Compass,
  stats: ChartColumn,
  problems: Bug,
  audiences: Target,
  technologies: Cpu,
};

export const pageIcon = (key: PageKey): LucideIcon => (key === "home" ? House : FileText);

/** The After launch screen (warranty, handover, care plans). */
export const AFTERCARE_ICON: LucideIcon = LifeBuoy;
