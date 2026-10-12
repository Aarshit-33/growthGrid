/**
 * Raw JSON content.
 *
 * Imported statically so it's bundled into the server build: no filesystem
 * reads at runtime (works on any host, including serverless), and edits
 * hot-reload in development. Everything is typed `unknown` on purpose — data
 * only becomes typed after it passes through the Zod schemas.
 *
 * Deliberately NOT `server-only`, so Node scripts (validate / seed) can
 * import it too. Never import this from a client component.
 */
import audiences from "@content/audiences.json";
import faqs from "@content/faqs.json";
import insights from "@content/insights.json";
import principles from "@content/principles.json";
import problems from "@content/problems.json";
import processSteps from "@content/process.json";
import projects from "@content/projects.json";
import services from "@content/services.json";
import settings from "@content/settings.json";
import stats from "@content/stats.json";
import team from "@content/team.json";
import technologies from "@content/technologies.json";
import testimonials from "@content/testimonials.json";

import aboutPage from "@content/pages/about.json";
import cardsPage from "@content/pages/cards.json";
import contactPage from "@content/pages/contact.json";
import homePage from "@content/pages/home.json";
import insightsPage from "@content/pages/insights.json";
import notFoundPage from "@content/pages/not-found.json";
import privacyPage from "@content/pages/privacy.json";
import servicesPage from "@content/pages/services.json";
import termsPage from "@content/pages/terms.json";
import workPage from "@content/pages/work.json";

import type { PageKey } from "@/lib/schemas";
import type { CollectionName } from "./registry";

export const rawSettings: unknown = settings;

export const rawCollections: Record<CollectionName, unknown[]> = {
  services,
  projects,
  insights,
  testimonials,
  team,
  faqs,
  technologies,
  process: processSteps,
  principles,
  audiences,
  problems,
  stats,
};

export const rawPages: Record<PageKey, unknown> = {
  home: homePage,
  about: aboutPage,
  services: servicesPage,
  work: workPage,
  insights: insightsPage,
  contact: contactPage,
  privacy: privacyPage,
  terms: termsPage,
  "not-found": notFoundPage,
  cards: cardsPage,
};
