import "server-only";
import {
  getAllFaqs,
  getInsights,
  getPage,
  getPrinciples,
  getProcess,
  getProjects,
  getServices,
  getSettings,
  getTechnologyIndex,
} from "@/lib/data";
import type { Faq, Seo } from "@/lib/schemas";
import { absoluteUrl, interpolate } from "@/lib/utils";
import { blocksToMarkdown, inlineMarkdown, linkItem } from "./markdown";
import { FEED_PATH, LLMS_FULL_PATH, LLMS_PATH } from "./paths";

/* ─────────────────────────────────────────────────────────────
   /llms.txt and /llms-full.txt (llmstxt.org): the site as plain
   Markdown for AI assistants and answer engines (GEO / LLMO).

   • /llms.txt: who the studio is, then a link and a line for
     every key page, so an assistant knows where to look.
   • /llms-full.txt: the content itself, in one file: services,
     case studies, articles, FAQs, process, aftercare, contact.

   Both are built from published content and skip anything marked
   "Hide from search engines". Left out on purpose: headline
   numbers (stats, service outcomes), testimonials, team bios and
   social profiles. AI answers repeat these files as fact, so
   they keep to what the studio does and how it works.
   ───────────────────────────────────────────────────────────── */

const indexable = <T extends { seo: Seo }>(items: T[]) => items.filter((item) => !item.seo.noIndex);

async function loadContent() {
  const [
    settings,
    services,
    projects,
    insights,
    faqs,
    process,
    principles,
    technologies,
    about,
    servicesPage,
    work,
    insightsPage,
    contact,
    privacy,
    terms,
  ] = await Promise.all([
    getSettings(),
    getServices(),
    getProjects(),
    getInsights(),
    getAllFaqs(),
    getProcess(),
    getPrinciples(),
    getTechnologyIndex(),
    getPage("about"),
    getPage("services"),
    getPage("work"),
    getPage("insights"),
    getPage("contact"),
    getPage("privacy"),
    getPage("terms"),
  ]);
  return {
    settings,
    /** Every visible service, for naming a case study's services. */
    allServices: services,
    services: indexable(services),
    projects: indexable(projects),
    insights: indexable(insights),
    faqs,
    process,
    principles,
    technologies,
    pages: { about, services: servicesPage, work, insights: insightsPage, contact, privacy, terms },
  };
}

type Content = Awaited<ReturnType<typeof loadContent>>;

const toText = (lines: string[]) => `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;

/** A heading and its lines, or nothing when there are no lines. */
const section = (heading: string, lines: string[]) => (lines.length ? ["", heading, "", ...lines] : []);

/** "**Label**" over a list, or nothing when the list is empty. */
const list = (label: string, items: string[], ordered = false) =>
  items.length ? ["", `**${label}**`, "", ...items.map((item, i) => `${ordered ? `${i + 1}.` : "-"} ${item}`)] : [];

/** Name, summary and contact facts: the top of both files. */
function intro({ settings: s }: Content): string[] {
  return [
    `# ${s.name}`,
    "",
    `> ${s.description}`,
    "",
    s.tagline,
    "",
    `- Website: ${absoluteUrl("/", s.url)}`,
    `- Email: ${s.contact.email}`,
    ...(s.contact.phone ? [`- Phone: ${s.contact.phone}`] : []),
    ...(s.contact.bookingUrl ? [`- Book a call: ${s.contact.bookingUrl}`] : []),
    `- Response time: ${s.contact.responseTime}`,
    `- Location: ${s.location.label}`,
    `- Availability: ${s.availability.label}`,
  ];
}

/* ── /llms.txt ─────────────────────────────────────────────── */

export async function llmsTxt(): Promise<string> {
  const c = await loadContent();
  const url = (path: string) => absoluteUrl(path, c.settings.url);
  const { pages } = c;
  const page = (path: string, { seo }: { seo: Seo }) => (seo.noIndex ? [] : [linkItem(seo.title, url(path), seo.description)]);

  return toText([
    ...intro(c),
    ...section(
      "## Services",
      c.services.map((s) => linkItem(s.title, url(`/services/${s.slug}`), s.summary)),
    ),
    ...section(
      "## Case studies",
      c.projects.map((p) => linkItem(p.title, url(`/work/${p.slug}`), `${p.summary} (${p.client.name}, ${p.year})`)),
    ),
    ...section(
      "## Insights",
      c.insights.map((i) => linkItem(i.title, url(`/insights/${i.slug}`), i.excerpt)),
    ),
    ...section("## Company", [
      ...page("/about", pages.about),
      ...(pages.about.seo.noIndex || c.process.length === 0
        ? []
        : [linkItem("How a project runs", url("/about#process"), c.process.map((step) => step.title).join(" → "))]),
      ...page("/services", pages.services),
      ...page("/work", pages.work),
      ...page("/insights", pages.insights),
      ...page("/contact", pages.contact),
    ]),
    ...section("## Optional", [
      linkItem("Full content", url(LLMS_FULL_PATH), "every service, case study, article and FAQ in one Markdown file"),
      ...(c.insights.length ? [linkItem("Insights RSS feed", url(FEED_PATH))] : []),
      ...page("/privacy", pages.privacy),
      ...page("/terms", pages.terms),
    ]),
  ]);
}

/* ── /llms-full.txt ────────────────────────────────────────── */

export async function llmsFullTxt(): Promise<string> {
  const c = await loadContent();
  const s = c.settings;
  const url = (path: string) => absoluteUrl(path, s.url);
  const md = (text: string) => inlineMarkdown(text, s.url);
  const tech = (slugs: string[]) => slugs.flatMap((slug) => c.technologies.get(slug)?.name ?? []);
  const serviceName = new Map(c.allServices.map((service) => [service.slug, service.title]));
  const { about, services: servicesPage, contact } = c.pages;
  const { aftercare } = servicesPage;
  const fill = (text: string) => md(interpolate(text, { days: aftercare.warranty.days }));

  const qa = (faqs: Faq[]) => faqs.flatMap((f) => ["", `**${f.question}**`, md(f.answer)]);
  // Questions for the site as a whole; the rest belong to one or more services.
  const isGeneral = (f: Faq) => f.scopes.some((scope) => !scope.startsWith("service:"));
  const generalFaqs = c.faqs.filter(isGeneral);
  const faqsFor = (slug: string) => c.faqs.filter((f) => !isGeneral(f) && f.scopes.includes(`service:${slug}`));

  const aboutSection = [
    "",
    `## About ${s.name}`,
    ...(about.seo.noIndex ? [] : ["", md(about.hero.lede), ...about.story.paragraphs.flatMap((p) => ["", md(p)]), "", md(about.story.highlight)]),
    ...section(
      "### What we stand for",
      c.principles.map((p) => `- **${p.title}**: ${md(p.summary)}`),
    ),
    ...section("### How a project runs", [
      ...(about.seo.noIndex ? [] : [`More: ${url("/about#process")}`, ""]),
      ...c.process.map(
        (step, i) => `${i + 1}. **${step.title}** (${step.duration}): ${md(step.summary)} Deliverables: ${step.deliverables.join(", ")}.`,
      ),
    ]),
    ...(about.seo.noIndex
      ? []
      : section(
          "### Ways to work together",
          about.engagement.models.map((m) => `- **${m.title}** (${m.duration}): ${md(m.summary)} Best for: ${md(m.bestFor)}`),
        )),
    "",
    "### After launch",
    "",
    `**${fill(aftercare.warranty.title)}**: ${fill(aftercare.warranty.text)}`,
    ...list(
      aftercare.handover.label,
      aftercare.handover.items.map((item) => `**${item.title}**: ${fill(item.text)}`),
    ),
    ...list(
      aftercare.plans.label,
      aftercare.plans.items.map(
        (plan) => `**${plan.name}**: ${fill(plan.summary)} First response: ${plan.response}. Best for: ${fill(plan.bestFor)}`,
      ),
    ),
    ...(aftercare.plans.note ? ["", fill(aftercare.plans.note)] : []),
  ];

  const servicesSection = section(
    "## Services",
    c.services.flatMap((service) => [
      "",
      `### ${service.title}`,
      "",
      `URL: ${url(`/services/${service.slug}`)}`,
      service.tagline,
      "",
      md(service.summary),
      ...service.description.flatMap((p) => ["", md(p)]),
      ...list("Deliverables", service.deliverables.map(md)),
      ...list("Capabilities", service.capabilities.map((x) => `**${x.title}**: ${md(x.description)}`)),
      ...list("Approach", service.approach.map((x) => `**${x.title}**: ${md(x.description)}`), true),
      ...(service.technologies.length ? ["", `**Technologies**: ${tech(service.technologies).join(", ")}`] : []),
      ...(faqsFor(service.slug).length ? ["", `**Questions about ${service.title}**`, ...qa(faqsFor(service.slug))] : []),
    ]),
  );

  const projectsSection = section(
    "## Case studies",
    c.projects.flatMap((project) => [
      "",
      `### ${project.title}`,
      "",
      `URL: ${url(`/work/${project.slug}`)}`,
      [project.client.name, project.category, project.client.industry, project.client.region, project.year, project.duration].join(" · "),
      `Services: ${project.services.map((slug) => serviceName.get(slug) ?? slug).join(", ")}`,
      "",
      md(project.summary),
      "",
      `Outcome: ${md(project.outcome)}`,
      ...(
        [
          ["Challenge", project.challenge],
          ["Approach", project.approach],
          ["Solution", project.solution],
        ] as const
      ).flatMap(([label, texts]) => ["", `**${label}**`, ...texts.flatMap((p) => ["", md(p)])]),
      ...list("Highlights", project.highlights.map(md)),
      ...list("Results", project.results.map((m) => `**${m.value}** ${m.label}`)),
      ...(project.stack.length ? ["", `**Stack**: ${tech(project.stack).join(", ")}`] : []),
    ]),
  );

  const insightsSection = section(
    "## Insights",
    c.insights.flatMap((insight) => [
      "",
      `### ${insight.title}`,
      "",
      `URL: ${url(`/insights/${insight.slug}`)}`,
      [
        `Published ${insight.publishedAt}`,
        ...(insight.updatedAt ? [`Updated ${insight.updatedAt}`] : []),
        `${insight.readingTime} min read`,
        insight.category.label,
        ...(insight.tags.length ? [`Tags: ${insight.tags.join(", ")}`] : []),
      ].join(" · "),
      "",
      `**Key takeaway:** ${md(insight.takeaway)}`,
      "",
      blocksToMarkdown(insight.body, s.url, 2),
    ]),
  );

  const contactSection = [
    "",
    "## Contact",
    "",
    ...(contact.seo.noIndex ? [] : [md(contact.hero.lede), "", `Start a project: ${url("/contact")}`, ""]),
    `- Email: ${s.contact.email}`,
    ...(s.contact.phone ? [`- Phone: ${s.contact.phone}`] : []),
    ...(s.contact.bookingUrl ? [`- Book a call: ${s.contact.bookingUrl}`] : []),
    `- ${s.contact.responseTime}`,
    ...list(
      contact.steps.heading,
      contact.steps.items.map((step) => `**${step.title}**: ${md(step.description)}`),
      true,
    ),
  ];

  return toText([
    ...intro(c),
    "",
    `The site's content in one Markdown file, for AI assistants. The short index: ${url(LLMS_PATH)}`,
    ...aboutSection,
    ...servicesSection,
    ...projectsSection,
    ...insightsSection,
    ...section("## Frequently asked questions", qa(generalFaqs)),
    ...contactSection,
  ]);
}

/**
 * Markdown as plain text, so it reads in a browser too. Kept out of search
 * results (noindex): the pages themselves are what should rank.
 */
export function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
