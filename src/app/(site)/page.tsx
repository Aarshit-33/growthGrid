import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { AudiencesSection } from "@/components/home/audiences";
import { HeroSection } from "@/components/home/hero";
import { InsightsSection } from "@/components/home/insights";
import { PrinciplesSection } from "@/components/home/principles";
import { ProblemSection } from "@/components/home/problem";
import { ProcessSection } from "@/components/home/process";
import { ProofSection } from "@/components/home/proof";
import { ServicesSection } from "@/components/home/services";
import { TechnologySection } from "@/components/home/technology";
import { TestimonialsSection } from "@/components/home/testimonials";
import { WorkSection } from "@/components/home/work";
import { AftercareSection } from "@/components/sections/aftercare";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { JsonLd } from "@/components/seo/json-ld";
import { JourneyBackdrop } from "@/components/three/journey-backdrop";
import { Stage } from "@/components/three/lazy";
import { HOME_INSIGHTS, NUMBERED_HOME_SECTIONS, resolveHomeSections } from "@/lib/content/home-sections";
import {
  getAudiences,
  getFaqs,
  getFeaturedProjects,
  getInsights,
  getPage,
  getPrinciples,
  getProblems,
  getProcess,
  getServices,
  getSettings,
  getStats,
  getTechnologies,
  getTestimonials,
} from "@/lib/data";
import type { HomeSectionId } from "@/lib/schemas";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";
import { SPEAKABLE } from "@/lib/seo/speakable";
import { localeTag } from "@/lib/utils";

/** Items switched off for the home page (admin → "On homepage") stay on their other pages. */
const onHome = <T extends { home?: boolean }>(items: T[]) => items.filter((item) => item.home !== false);

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("home")]);
  return buildMetadata({ settings, seo: page.seo, path: "/", absoluteTitle: true });
}

export default async function HomePage() {
  const [
    settings,
    page,
    servicesPage,
    workPage,
    insightsPage,
    problems,
    allServices,
    allSteps,
    projects,
    allPrinciples,
    technologies,
    audiences,
    testimonials,
    allInsights,
    faqs,
    allStats,
  ] = await Promise.all([
    getSettings(),
    getPage("home"),
    getPage("services"),
    getPage("work"),
    getPage("insights"),
    getProblems(),
    getServices(),
    getProcess(),
    getFeaturedProjects(),
    getPrinciples(),
    getTechnologies(),
    getAudiences(),
    getTestimonials(),
    getInsights(),
    getFaqs("home"),
    getStats(),
  ]);

  const services = onHome(allServices);
  const steps = onHome(allSteps);
  const principles = onHome(allPrinciples);
  const stats = onHome(allStats);
  const insights = onHome(allInsights).slice(0, HOME_INSIGHTS);
  const featuredTestimonials = testimonials.filter((t) => t.featured);

  // A section with nothing to show is skipped, so it never renders empty.
  const hasContent: Record<HomeSectionId, boolean> = {
    proof: true,
    problem: problems.length > 0,
    services: services.length > 0,
    process: steps.length > 0,
    aftercare: true,
    work: projects.length > 0,
    principles: principles.length > 0,
    technology: technologies.length > 0,
    audiences: audiences.length > 0,
    testimonials: featuredTestimonials.length > 0,
    insights: insights.length > 0,
    faq: faqs.length > 0,
    cta: true,
  };

  // Order and on/off switches come from the admin (home.json `sections`).
  // Numbered labels ("01", "02"…) follow the order of the sections that show.
  const layout = resolveHomeSections(page.sections).filter((s) => s.enabled && hasContent[s.id]);
  const numbers = new Map<HomeSectionId, string>();
  for (const { id } of layout) {
    if (NUMBERED_HOME_SECTIONS.has(id)) numbers.set(id, String(numbers.size + 1).padStart(2, "0"));
  }
  const index = (id: HomeSectionId) => numbers.get(id);

  const sections: Record<HomeSectionId, () => ReactNode> = {
    proof: () => <ProofSection proof={page.proof} stats={stats} />,
    problem: () => <ProblemSection intro={page.problem} problems={problems} index={index("problem")} />,
    services: () => <ServicesSection intro={page.services} services={services} index={index("services")} />,
    process: () => <ProcessSection intro={page.process} steps={steps} index={index("process")} />,
    // What happens after the build: warranty, handover, care plans.
    aftercare: () => (
      <AftercareSection intro={page.aftercare} offer={servicesPage.aftercare} index={index("aftercare")} />
    ),
    work: () => (
      <WorkSection intro={page.work} projects={projects} labels={workPage.detail} index={index("work")} />
    ),
    principles: () => (
      <PrinciplesSection intro={page.principles} principles={principles} index={index("principles")} />
    ),
    technology: () => (
      <TechnologySection intro={page.technology} categories={technologies} index={index("technology")} />
    ),
    audiences: () => <AudiencesSection intro={page.audiences} audiences={audiences} index={index("audiences")} />,
    testimonials: () => (
      <TestimonialsSection
        intro={page.testimonials}
        testimonials={featuredTestimonials}
        index={index("testimonials")}
      />
    ),
    insights: () => (
      <InsightsSection
        intro={page.insights}
        insights={insights}
        minReadLabel={insightsPage.detail.minRead}
        locale={localeTag(settings.locale)}
        index={index("insights")}
      />
    ),
    faq: () => <FaqSection intro={page.faq} faqs={faqs} index={index("faq")} />,
    // The summit: the journey's last step glows through a translucent panel.
    cta: () => (
      <div data-journey-zone="summit">
        <CtaSection cta={page.cta} className="[&>div>div]:bg-surface/90 lg:[&>div>div]:bg-surface/65" />
      </div>
    ),
  };

  return (
    <>
      {/* One shared WebGL canvas for every 3D scene on the page (lazy, client-only). */}
      <Stage />
      {/* The story behind Problem → Services → Process → Work → CTA: ground to summit. */}
      <JourneyBackdrop accents={services.map((service) => service.accent)} />

      {/* Content sits above the fixed canvas; 3D shows through transparent sections. */}
      <div className="relative z-[1]">
        <HeroSection hero={page.hero} availability={settings.availability} />
        {layout.map(({ id }) => (
          <Fragment key={id}>{sections[id]()}</Fragment>
        ))}
      </div>

      {/* The homepage as a page about the studio; voice assistants read the hero's headline and lede. */}
      <JsonLd
        data={webPageSchema(
          {
            name: page.seo.title,
            description: page.seo.description,
            path: "/",
            speakable: [SPEAKABLE.heroTitle, SPEAKABLE.heroSummary],
          },
          settings,
        )}
      />
    </>
  );
}
