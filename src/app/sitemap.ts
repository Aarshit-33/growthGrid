import type { MetadataRoute } from "next";
import { getCardPeople } from "@/lib/cards/data";
import { cardPath } from "@/lib/cards/person";
import { getInsights, getPage, getProjects, getSavedAt, getServices, getSettings } from "@/lib/data";
import type { Seo } from "@/lib/schemas";
import { absoluteUrl } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   /sitemap.xml — every indexable route, generated from content so
   new services, case studies and articles appear automatically.
   `lastModified` is only set where content carries a real date
   (a fake "now" on every deploy would just be noise to crawlers),
   or, for pages and services without one, where the store records
   when they were last saved (MongoDB timestamps; none in JSON mode).
   Pages flagged `seo.noIndex` are left out.
   ───────────────────────────────────────────────────────────── */

type Entry = MetadataRoute.Sitemap[number];

const newest = (dates: (string | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort().at(-1);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settings, services, projects, insights, home, about, servicesPage, work, insightsPage, contact, privacy, terms, cards, cardPeople, saved] =
    await Promise.all([
      getSettings(),
      getServices(),
      getProjects(),
      getInsights(),
      getPage("home"),
      getPage("about"),
      getPage("services"),
      getPage("work"),
      getPage("insights"),
      getPage("contact"),
      getPage("privacy"),
      getPage("terms"),
      getPage("cards"),
      getCardPeople(),
      getSavedAt(),
    ]);

  const url = (path: string) => absoluteUrl(path, settings.url);
  const indexable = (seo: Seo) => !seo.noIndex;
  const entry = (path: string, seo: Seo, extra: Omit<Entry, "url">): Entry[] =>
    indexable(seo) ? [{ url: url(path), ...extra }] : [];

  const latestProject = newest(projects.map((p) => p.publishedAt));
  const latestInsight = newest(insights.map((i) => i.updatedAt ?? i.publishedAt));
  // The services index lists every service, so it changes when any of them does.
  const latestService = newest([saved.pages.services, ...services.map((s) => saved.services[s.slug])]);

  return [
    ...entry("/", home.seo, { changeFrequency: "weekly", priority: 1, lastModified: newest([latestProject, latestInsight]) }),
    ...entry("/services", servicesPage.seo, { changeFrequency: "monthly", priority: 0.9, lastModified: latestService }),
    ...services.flatMap((service) =>
      entry(`/services/${service.slug}`, service.seo, {
        changeFrequency: "monthly",
        priority: 0.8,
        lastModified: saved.services[service.slug],
      }),
    ),
    ...entry("/work", work.seo, { changeFrequency: "monthly", priority: 0.9, lastModified: latestProject }),
    ...projects.flatMap((project) =>
      entry(`/work/${project.slug}`, project.seo, {
        changeFrequency: "yearly",
        priority: 0.7,
        lastModified: project.publishedAt,
        images: [url(project.cover.src)],
      }),
    ),
    ...entry("/about", about.seo, { changeFrequency: "monthly", priority: 0.7, lastModified: saved.pages.about }),
    ...entry("/insights", insightsPage.seo, { changeFrequency: "weekly", priority: 0.8, lastModified: latestInsight }),
    ...insights.flatMap((insight) =>
      entry(`/insights/${insight.slug}`, insight.seo, {
        changeFrequency: "monthly",
        priority: 0.7,
        lastModified: insight.updatedAt ?? insight.publishedAt,
        images: [url(insight.cover.src)],
      }),
    ),
    ...entry("/contact", contact.seo, { changeFrequency: "yearly", priority: 0.8, lastModified: saved.pages.contact }),
    ...entry("/privacy", privacy.seo, { changeFrequency: "yearly", priority: 0.2, lastModified: privacy.updatedAt }),
    ...entry("/terms", terms.seo, { changeFrequency: "yearly", priority: 0.2, lastModified: terms.updatedAt }),
    // Business cards: one switch (the cards page's noIndex) covers the list and every card.
    ...entry("/cards", cards.seo, { changeFrequency: "monthly", priority: 0.3 }),
    ...cardPeople.flatMap((person) => entry(cardPath(person.slug), cards.seo, { changeFrequency: "monthly", priority: 0.3 })),
  ];
}
