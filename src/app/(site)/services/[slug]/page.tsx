import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ProjectCard } from "@/components/cards/cards";
import { AftercareBlock } from "@/components/sections/aftercare";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { OutcomeValue } from "@/components/services/outcome-value";
import { SectionNav } from "@/components/services/section-nav";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { ArrowSwap, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TechBadge } from "@/components/ui/tech-logo";
import {
  getFaqs,
  getPage,
  getProjectBySlug,
  getProjectsForService,
  getServiceBySlug,
  getServices,
  getSettings,
  resolveTechnologies,
} from "@/lib/data";
import type { Project } from "@/lib/schemas";
import { buildMetadata } from "@/lib/seo/metadata";
import { serviceSchema, webPageSchema } from "@/lib/seo/schema";
import { pad } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  const services = await getServices();
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, service] = await Promise.all([getSettings(), getServiceBySlug(slug)]);
  if (!service) return {};
  return buildMetadata({ settings, seo: service.seo, path: `/services/${service.slug}` });
}

/** Related case studies: curated list first, then any others tagged with the service. */
async function relatedWork(slug: string, curated: string[]): Promise<Project[]> {
  const [picked, tagged] = await Promise.all([
    Promise.all(curated.map((s) => getProjectBySlug(s))),
    getProjectsForService(slug),
  ]);
  const seen = new Set<string>();
  return [...picked.filter((p): p is Project => !!p), ...tagged]
    .filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)))
    .slice(0, 2);
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  const [settings, page, services, faqs, technologies, projects] = await Promise.all([
    getSettings(),
    getPage("services"),
    getServices(),
    getFaqs(`service:${service.slug}`),
    resolveTechnologies(service.technologies),
    relatedWork(service.slug, service.relatedProjects),
  ]);
  const d = page.detail;
  const position = services.findIndex((s) => s.slug === service.slug);
  const next = services[(position + 1) % services.length];
  const schema = serviceSchema(service, settings);

  const nav = [
    { id: "overview", label: d.overviewLabel },
    { id: "deliverables", label: d.deliverablesHeading },
    { id: "capabilities", label: d.capabilitiesHeading },
    { id: "approach", label: d.approachHeading },
    ...(technologies.length ? [{ id: "technologies", label: d.technologiesHeading }] : []),
    { id: "aftercare", label: page.aftercare.eyebrow },
    ...(projects.length ? [{ id: "related-work", label: d.workHeading }] : []),
    ...(faqs.length ? [{ id: "faq", label: d.faqHeading }] : []),
  ];

  return (
    <div style={{ "--accent": service.accent } as CSSProperties}>
      {/* Shared WebGL stage for the blueprint layer (lazy, client-only). */}
      <Stage />

      <PageHero
        eyebrow={service.tagline}
        headline={service.headline}
        lede={service.summary}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.hero.eyebrow, href: "/services" },
          { label: service.title, href: `/services/${service.slug}` },
        ]}
        aside={
          <div className="card card-hover edge-glow overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-20 size-64 rounded-full opacity-60 blur-3xl"
              style={{ background: `radial-gradient(circle, ${service.accent}45, transparent 70%)` }}
            />
            <div className="relative flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-xl border border-line bg-white/[0.03] text-[var(--accent)]">
                <Icon name={service.icon} className="size-5" aria-hidden="true" />
              </span>
              <p className="label-mono">{d.outcomesHeading}</p>
            </div>
            <dl className="relative mt-8 grid grid-cols-2 gap-x-6 gap-y-7">
              {service.outcomes.map((m) => (
                <div key={m.label} className="flex flex-col-reverse">
                  <dt className="mt-2 text-sm leading-snug text-muted">{m.label}</dt>
                  <dd className="font-display text-[clamp(2rem,1.5rem+1.5vw,2.8rem)] font-medium leading-none tracking-[-0.05em] text-ink">
                    <OutcomeValue value={m.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/contact" size="lg">
            {d.ctaLabel}
          </ButtonLink>
          {projects.length > 0 && (
            <ButtonLink href="#related-work" variant="secondary" size="lg">
              {d.workHeading}
            </ButtonLink>
          )}
        </div>
      </PageHero>

      <div className="container-x grid gap-12 pb-[var(--section-y)] lg:grid-cols-12 lg:gap-10">
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[calc(var(--header-h)+2.5rem)]">
            <SectionNav label={d.tocLabel} items={nav} />
            {/* This service's layer, lifted out of the six-layer blueprint with its
                motif on top (decorative). Transparent so the canvas shows through. */}
            <div className="relative mt-10 aspect-square overflow-hidden rounded-card border border-line">
              <SceneSlot
                scene={{
                  id: "stack",
                  data: { accents: services.map((s) => s.accent), motifs: services.map((s) => s.slug), active: position },
                }}
                fallback={
                  <>
                    <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:1.5rem]" />
                    <div className="absolute inset-x-[20%] bottom-[22%] flex flex-col-reverse gap-1.5">
                      {services.map((s, i) => (
                        <span
                          key={s.slug}
                          className="mx-auto h-3 skew-x-[-24deg] rounded-sm border"
                          style={{
                            width: `${100 - i * 8}%`,
                            borderColor: i === position ? s.accent : "rgb(255 255 255 / 0.12)",
                            marginBottom: i === position ? "1.25rem" : undefined,
                          }}
                        />
                      ))}
                    </div>
                  </>
                }
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-24 lg:col-span-8 lg:col-start-5 lg:space-y-32">
          <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-28">
            <h2 id="overview-heading" className="eyebrow">
              <span className="text-faint">[01]</span>
              <span aria-hidden="true" className="h-px w-8 bg-em/50" />
              {d.overviewLabel}
            </h2>
            <div className="mt-8 space-y-6">
              {service.description.map((paragraph, i) => (
                <p key={i} className={i === 0 ? "text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] leading-snug text-ink" : "text-lede"}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          <section id="deliverables" aria-labelledby="deliverables-heading" className="scroll-mt-28">
            <h2 id="deliverables-heading" className="text-h2 text-ink">
              {d.deliverablesHeading}
            </h2>
            <ul className="mt-10 grid border-l border-t border-line sm:grid-cols-2">
              {service.deliverables.map((item, i) => (
                <li key={item} className="flex items-start gap-4 border-b border-r border-line p-5 sm:p-6" data-reveal="">
                  <span className="font-mono text-xs text-[var(--accent)]">{pad(i + 1)}</span>
                  <span className="text-dim">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="capabilities" aria-labelledby="capabilities-heading" className="scroll-mt-28">
            <h2 id="capabilities-heading" className="text-h2 text-ink">
              {d.capabilitiesHeading}
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {service.capabilities.map((c) => (
                <li key={c.title} className="card card-hover edge-glow p-6 sm:p-7" data-reveal="">
                  <span aria-hidden="true" className="block size-2 rotate-45 bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
                  <h3 className="text-h4 mt-6 text-ink">{c.title}</h3>
                  <p className="mt-2 text-[0.95rem] text-dim">{c.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="approach" aria-labelledby="approach-heading" className="scroll-mt-28">
            <h2 id="approach-heading" className="text-h2 text-ink">
              {d.approachHeading}
            </h2>
            <ol className="mt-10 border-t border-line">
              {service.approach.map((step, i) => (
                <li
                  key={step.title}
                  className="grid gap-3 border-b border-line py-7 sm:grid-cols-[4rem_1fr_1.4fr] sm:gap-6"
                  data-reveal=""
                >
                  <span className="font-mono text-xs text-[var(--accent)]">{pad(i + 1)}</span>
                  <h3 className="text-h4 text-ink">{step.title}</h3>
                  <p className="text-dim">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>

          {technologies.length > 0 && (
            <section id="technologies" aria-labelledby="technologies-heading" className="scroll-mt-28">
              <h2 id="technologies-heading" className="text-h2 text-ink">
                {d.technologiesHeading}
              </h2>
              <ul className="mt-10 grid gap-3 sm:grid-cols-2">
                {technologies.map((t) => (
                  <li key={t.slug} className="group card card-hover flex items-start gap-4 p-5" data-reveal="">
                    <TechBadge
                      slug={t.slug}
                      short={t.short}
                      fallbackColor={t.category.color}
                      className="size-11 text-xs transition-shadow duration-500 group-hover:shadow-[0_0_22px_-6px_var(--logo)]"
                      logoClassName="size-5 transition-transform duration-500 ease-out-expo group-hover:scale-110"
                    />
                    <span>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-ink">{t.name}</span>
                        <span className="label-mono text-faint">{t.category.name}</span>
                      </span>
                      <span className="mt-1 block text-sm text-dim">{t.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* What happens after launch (the same offer as the home section). */}
          <AftercareBlock offer={page.aftercare} />

          {projects.length > 0 && (
            <section id="related-work" aria-labelledby="related-work-heading" className="scroll-mt-28">
              <h2 id="related-work-heading" className="text-h2 text-ink">
                {d.workHeading}
              </h2>
              <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-2">
                {projects.map((project) => (
                  <ProjectCard key={project.slug} project={project} cursorLabel={d.viewWorkLabel} sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 92vw" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <FaqSection
        intro={{ eyebrow: service.title, heading: d.faqHeading }}
        faqs={faqs}
        className="border-t border-line"
      />

      {next && next.slug !== service.slug && (
        <section aria-labelledby="next-service-heading" className="border-t border-line">
          <div className="container-x">
            <article className="group/card relative flex flex-col gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="label-mono">{d.nextLabel}</p>
                <h2
                  id="next-service-heading"
                  className="mt-4 font-display text-[clamp(2.2rem,1.4rem+4vw,5.5rem)] font-medium leading-none tracking-[-0.05em] text-ink transition-colors duration-500 group-hover/card:text-hot"
                >
                  <Link href={`/services/${next.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
                    {next.title}
                  </Link>
                </h2>
                <p className="mt-4 font-mono text-[0.72rem] tracking-[0.04em] text-muted">{next.tagline}</p>
              </div>
              <span
                aria-hidden="true"
                className="grid size-16 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-em group-hover/card:bg-em group-hover/card:text-bg lg:size-24"
              >
                <ArrowSwap trigger="card" className="size-6" />
              </span>
            </article>
          </div>
        </section>
      )}

      <CtaSection cta={page.cta} />
      <JsonLd
        data={[
          schema,
          // The page around the service: what it's about and what voice assistants read out.
          webPageSchema(
            {
              name: service.seo.title,
              description: service.seo.description,
              path: `/services/${service.slug}`,
              mainEntity: schema["@id"],
            },
            settings,
          ),
        ]}
      />
    </div>
  );
}
