import type { Metadata } from "next";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { PageHero } from "@/components/sections/page-hero";
import { ProcessTimeline } from "@/components/sections/process-timeline";
import { JsonLd } from "@/components/seo/json-ld";
import { HighlightList } from "@/components/services/highlight-list";
import { ServiceRow } from "@/components/services/service-row";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getFaqs, getPage, getProcess, getServices, getSettings } from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { collectionPageSchema } from "@/lib/seo/schema";
import { headingText } from "@/lib/utils/text";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("services")]);
  return buildMetadata({ settings, seo: page.seo, path: "/services" });
}

export default async function ServicesPage() {
  const [settings, page, services, process, faqs] = await Promise.all([
    getSettings(),
    getPage("services"),
    getServices(),
    getProcess(),
    getFaqs("services"),
  ]);

  return (
    <>
      {/* Shared WebGL stage for the blueprint stack (lazy, client-only). */}
      <Stage />

      <PageHero
        eyebrow={page.hero.eyebrow}
        headline={page.hero.headline}
        lede={page.hero.lede}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.hero.eyebrow, href: "/services" },
        ]}
        aside={
          /* The blueprint: one glass layer per service below; the row in focus
             opens its layer (decorative). Transparent so the shared canvas
             beneath shows through. */
          <div className="relative aspect-[5/4] overflow-hidden rounded-card border border-line sm:aspect-[16/10] lg:aspect-[4/5]">
            <SceneSlot
              scene={{
                id: "stack",
                data: { accents: services.map((s) => s.accent), motifs: services.map((s) => s.slug), active: -1 },
              }}
              fallback={
                <>
                  <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:2rem]" />
                  <div className="absolute inset-x-[22%] bottom-[24%] flex flex-col-reverse gap-2">
                    {services.map((service, i) => (
                      <span
                        key={service.slug}
                        className="mx-auto h-4 skew-x-[-24deg] rounded-sm border bg-white/[0.02]"
                        style={{ width: `${100 - i * 8}%`, borderColor: `${service.accent}80` }}
                      />
                    ))}
                  </div>
                </>
              }
            />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={page.cta.primary.href} size="lg">
            {page.cta.primary.label}
          </ButtonLink>
          {page.cta.secondary && (
            <ButtonLink href={page.cta.secondary.href} variant="secondary" size="lg">
              {page.cta.secondary.label}
            </ButtonLink>
          )}
        </div>
      </PageHero>

      <section aria-labelledby="services-list-heading" className="section-y relative pt-0 md:pt-0">
        <div className="container-x">
          <SectionHeading intro={page.list} index="01" id="services-list-heading" />
          <HighlightList
            className="mt-14 border-t border-line md:mt-20"
            itemClassName="border-b border-line"
            highlightClassName="rounded-card border border-line bg-[linear-gradient(90deg,rgb(60_228_154/0.07),transparent_55%),var(--color-surface)]"
            items={services.map((service, i) => ({
              key: service.slug,
              content: (
                <div data-stack-layer={i} className="contents">
                  <ServiceRow service={service} index={i + 1} viewLabel={page.list.viewLabel} />
                </div>
              ),
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="process-heading" className="section-y relative border-t border-line">
        <div className="container-x grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h)+2.5rem)]">
              <SectionHeading intro={page.process} index="02" id="process-heading" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <ProcessTimeline steps={process} />
          </div>
        </div>
      </section>

      <FaqSection intro={page.faq} faqs={faqs} index="03" className="border-t border-line" />

      <CtaSection cta={page.cta} />

      <JsonLd
        data={collectionPageSchema(
          {
            name: headingText(page.hero.headline),
            description: page.seo.description,
            path: "/services",
            items: services.map((service) => ({ name: service.title, path: `/services/${service.slug}` })),
          },
          settings,
        )}
      />
    </>
  );
}
