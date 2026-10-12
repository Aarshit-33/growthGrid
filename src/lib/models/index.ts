import type { Model } from "mongoose";
import type { CollectionName } from "@/lib/content/registry";
import {
  AudienceModel,
  FaqModel,
  PrincipleModel,
  ProblemModel,
  ProcessStepModel,
  StatModel,
  TeamMemberModel,
  TechnologyCategoryModel,
  TestimonialModel,
} from "./collections";
import { InsightModel } from "./insight";
import { ProjectModel } from "./project";
import { ServiceModel } from "./service";

export * from "./collections";
export { HistoryEntryModel } from "./history";
export { InsightModel } from "./insight";
export { LeadModel, type LeadDocument } from "./lead";
export { PageModel, pageModels } from "./page";
export { ProjectModel } from "./project";
export { ServiceModel } from "./service";
export { SettingsModel, SETTINGS_KEY } from "./settings";

/** Collection name (see content registry) → Mongoose model. */
export const collectionModels: Record<CollectionName, Model<unknown>> = {
  services: ServiceModel as Model<unknown>,
  projects: ProjectModel as Model<unknown>,
  insights: InsightModel as Model<unknown>,
  testimonials: TestimonialModel as Model<unknown>,
  team: TeamMemberModel as Model<unknown>,
  faqs: FaqModel as Model<unknown>,
  technologies: TechnologyCategoryModel as Model<unknown>,
  process: ProcessStepModel as Model<unknown>,
  principles: PrincipleModel as Model<unknown>,
  audiences: AudienceModel as Model<unknown>,
  problems: ProblemModel as Model<unknown>,
  stats: StatModel as Model<unknown>,
};
