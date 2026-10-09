import type { Metadata } from "next";
import { ProjectCard } from "@/components/cards/cards";
import { CtaSection } from "@/components/sections/cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { WorkIndex } from "@/components/work/work-index";
import { getPage, getProjects, getServices, getSettings } from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { collectionPageSchema } from "@/lib/seo/schema";
import { headingText } from "@/lib/utils/text";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("work")]);
  return buildMetadata({ settings, seo: page.seo, path: "/work" });
}

export default async function WorkPage() {
  const [settings, page, projects, services] = await Promise.all([
    getSettings(),
    getPage("work"),
    getProjects(),
    getServices(),
  ]);

  // One chip per service that at least one case study uses, in service order.
  const chips = services
    .map((service) => ({
      slug: service.slug,
      label: service.title,
      count: projects.filter((project) => project.services.includes(service.slug)).length,
    }))
    .filter((chip) => chip.count > 0);

  return (
    <>
      {/* Shared WebGL stage for the grid city (lazy, client-only). */}
      <Stage />

      <PageHero
        eyebrow={page.hero.eyebrow}
        headline={page.hero.headline}
        lede={page.hero.lede}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.breadcrumb, href: "/work" },
        ]}
        aside={
          /* The grid city: one tower per case study below, lit by the filter and
             by the card in focus (decorative). No background: the shared canvas
             draws beneath the content and shows through. */
          <div className="relative aspect-[5/4] overflow-hidden rounded-card border border-line sm:aspect-[16/10] lg:aspect-[4/5]">
            <SceneSlot
              scene={{ id: "city", data: { count: projects.length } }}
              fallback={
                <>
                  <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:2rem]" />
                  <div className="absolute inset-x-[14%] bottom-[22%] top-[22%] flex items-end justify-between gap-[3%]">
                    {projects.map((project, i) => (
                      <span
                        key={project.slug}
                        className="flex-1 rounded-sm border border-em/40 bg-em/[0.05]"
                        style={{ height: `${([5, 7, 4, 6, 8, 5][i % 6] / 8) * 100}%` }}
                      />
                    ))}
                  </div>
                </>
              }
            />
          </div>
        }
      />

      <section aria-label={page.breadcrumb} className="section-y relative pt-0 md:pt-0">
        <div className="container-x">
          <WorkIndex
            chips={chips}
            labels={page.filters}
            items={projects.map((project, i) => ({
              slug: project.slug,
              services: project.services,
              card: (
                <ProjectCard
                  project={project}
                  cursorLabel={page.detail.view}
                  preload={i < 2}
                  headingLevel={2}
                  sizes="(min-width: 1024px) 44vw, (min-width: 768px) 46vw, 92vw"
                />
              ),
            }))}
          />
        </div>
      </section>

      <CtaSection cta={page.cta} />

      <JsonLd
        data={collectionPageSchema(
          {
            name: headingText(page.hero.headline),
            description: page.seo.description,
            path: "/work",
            items: projects.map((project) => ({ name: project.title, path: `/work/${project.slug}` })),
          },
          settings,
        )}
      />
    </>
  );
}
