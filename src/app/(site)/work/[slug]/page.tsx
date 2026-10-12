import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { CtaSection } from "@/components/sections/cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { OutcomeValue } from "@/components/services/outcome-value";
import { SectionNav } from "@/components/services/section-nav";
import { Showcase } from "@/components/showcase";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { ArrowSwap, ButtonLink } from "@/components/ui/button";
import { TechBadge } from "@/components/ui/tech-logo";
import { CaseCover } from "@/components/work/case-cover";
import {
  getPage,
  getProjectBySlug,
  getProjects,
  getServices,
  getSettings,
  getTestimonialById,
  resolveTechnologies,
} from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { caseStudySchema, webPageSchema } from "@/lib/seo/schema";
import { byline, cn, initials, pad } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

/* Slugs not known at build time render on demand (a case study added in the
   Studio goes live without a redeploy); unknown ones still 404 via notFound(). */
export const dynamicParams = true;

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, project] = await Promise.all([getSettings(), getProjectBySlug(slug)]);
  if (!project) return {};
  return buildMetadata({
    settings,
    seo: project.seo,
    path: `/work/${project.slug}`,
    type: "article",
    publishedTime: project.publishedAt,
  });
}

/** Numbered mono label used as each narrative section's h2. */
function SectionLabel({ id, index, children }: { id: string; index: number; children: ReactNode }) {
  return (
    <h2 id={id} className="eyebrow">
      <span className="text-faint">[{pad(index)}]</span>
      <span aria-hidden="true" className="h-px w-8 bg-em/50" />
      {children}
    </h2>
  );
}

/** Narrative copy: the first paragraph reads as a lead, the rest as body. */
function Prose({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="mt-8 space-y-6">
      {paragraphs.map((paragraph, i) => (
        <p
          key={i}
          className={i === 0 ? "text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] leading-snug text-ink" : "text-lede"}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

const metaTerm = "label-mono";
const metaRow = "border-t border-line pt-5";

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const [settings, page, projects, services, technologies, testimonial] = await Promise.all([
    getSettings(),
    getPage("work"),
    getProjects(),
    getServices(),
    resolveTechnologies(project.stack),
    project.testimonial ? getTestimonialById(project.testimonial) : undefined,
  ]);
  const d = page.detail;
  const tagged = project.services.flatMap((s) => services.filter((service) => service.slug === s));
  const position = projects.findIndex((p) => p.slug === project.slug);
  const next = projects[(position + 1) % projects.length];
  // "Problem → Platform → 60% less admin time" → a stepped narrative line.
  const steps = project.outcome
    .split("→")
    .map((step) => step.trim())
    .filter(Boolean);
  const results = project.results;
  const schema = caseStudySchema(project, settings);

  const nav = [
    { id: "challenge", label: d.challenge },
    { id: "approach", label: d.approach },
    { id: "solution", label: d.solution },
    ...(project.highlights.length ? [{ id: "highlights", label: d.highlights }] : []),
    ...(project.showcase ? [{ id: "snapshot", label: d.snapshot }] : []),
    ...(technologies.length ? [{ id: "stack", label: d.stack }] : []),
  ];
  const number = (id: string) => nav.findIndex((item) => item.id === id) + 1;

  return (
    <>
      {/* Shared WebGL stage for the build panel (lazy, client-only). */}
      <Stage />

      <PageHero
        eyebrow={project.category}
        headline={project.title}
        lede={project.summary}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.breadcrumb, href: "/work" },
          { label: project.title, href: `/work/${project.slug}` },
        ]}
        aside={
          <div className="card card-hover edge-glow overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-20 size-64 rounded-full bg-em/25 opacity-50 blur-3xl"
            />
            <dl className="relative grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2">
                <dt className={metaTerm}>{d.client}</dt>
                <dd className="mt-2 font-medium text-ink">{project.client.name}</dd>
                <dd className="mt-0.5 text-sm text-muted">{project.client.region}</dd>
              </div>
              <div className={cn("col-span-2", metaRow)}>
                <dt className={metaTerm}>{d.industry}</dt>
                <dd className="mt-2 text-dim">{project.client.industry}</dd>
              </div>
              <div className={metaRow}>
                <dt className={metaTerm}>{d.year}</dt>
                <dd className="mt-2 text-dim tabular-nums">{project.year}</dd>
              </div>
              <div className={metaRow}>
                <dt className={metaTerm}>{d.duration}</dt>
                <dd className="mt-2 text-dim">{project.duration}</dd>
              </div>
              <div className={cn("col-span-2", metaRow)}>
                <dt className={metaTerm}>{d.services}</dt>
                <dd className="mt-3">
                  <ul className="flex flex-wrap gap-2">
                    {tagged.map((service) => (
                      <li key={service.slug}>
                        <Link
                          href={`/services/${service.slug}`}
                          className="inline-flex min-h-10 items-center rounded-full border border-line bg-white/[0.025] px-3.5 text-sm text-dim transition-colors duration-300 hover:border-em/40 hover:text-ink"
                        >
                          {service.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        }
      >
        <div className="flex flex-col items-start gap-8">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="sr-only">{project.outcome}</span>
            {steps.map((step, i) => (
              <Fragment key={step}>
                {i > 0 && <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-faint" />}
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-full border px-3 py-1.5 font-mono text-[0.72rem] tracking-[0.04em]",
                    i === steps.length - 1 ? "border-em/40 bg-em/[0.08] text-em" : "border-line text-dim",
                  )}
                >
                  {step}
                </span>
              </Fragment>
            ))}
          </p>
          {project.showcase && (
            <ButtonLink href="#snapshot" variant="secondary" size="lg">
              {d.snapshot}
            </ButtonLink>
          )}
        </div>
      </PageHero>

      <div className="mx-auto max-w-[120rem] sm:px-4 lg:px-6">
        <CaseCover image={project.cover} />
      </div>

      <section aria-labelledby="results-heading" className="section-y relative">
        <div className="container-x">
          <h2 id="results-heading" className="eyebrow">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            {d.results}
          </h2>
          <dl
            className={cn(
              "mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2",
              results.length === 3 && "lg:grid-cols-3",
              results.length === 4 && "lg:grid-cols-4",
            )}
          >
            {results.map((metric, i) => (
              <div
                key={metric.label}
                className={cn(
                  "flex min-w-0 flex-col-reverse gap-5 bg-bg p-7 sm:p-9 lg:p-10",
                  results.length === 3 && i === 2 && "sm:col-span-2 lg:col-span-1",
                )}
                style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
              >
                <dt className="max-w-[18rem] text-dim" data-reveal="">
                  {metric.label}
                </dt>
                <dd
                  className="break-words font-display text-[clamp(3rem,2rem+3.4vw,5.5rem)] font-medium leading-[0.9] tracking-[-0.06em] text-ink"
                  data-reveal=""
                >
                  <OutcomeValue value={metric.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="container-x grid gap-12 pb-[var(--section-y)] lg:grid-cols-12 lg:gap-10">
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[calc(var(--header-h)+2.5rem)]">
            <SectionNav label={d.toc} items={nav} />
            {/* The build: broken pieces lock into one tower as the story is read,
                two floors per section (decorative). Transparent so the shared
                canvas beneath shows through. */}
            <div className="relative mt-10 aspect-square overflow-hidden rounded-card border border-line">
              <SceneSlot
                scene={{ id: "build", data: { sections: nav.length } }}
                fallback={
                  <>
                    <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:1.5rem]" />
                    <div className="absolute bottom-[22%] left-1/2 flex w-[30%] -translate-x-1/2 flex-col-reverse gap-1">
                      {nav.map((item) => (
                        <span key={item.id} className="h-3 rounded-sm border border-em/40 bg-em/[0.05]" />
                      ))}
                    </div>
                  </>
                }
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-24 lg:col-span-8 lg:col-start-5 lg:space-y-32" data-build-zone="">
          <section id="challenge" aria-labelledby="challenge-heading" className="scroll-mt-28">
            <SectionLabel id="challenge-heading" index={number("challenge")}>
              {d.challenge}
            </SectionLabel>
            <Prose paragraphs={project.challenge} />
          </section>

          <section id="approach" aria-labelledby="approach-heading" className="scroll-mt-28">
            <SectionLabel id="approach-heading" index={number("approach")}>
              {d.approach}
            </SectionLabel>
            <ol className="mt-10 border-t border-line">
              {project.approach.map((paragraph, i) => (
                <li
                  key={i}
                  className="grid gap-3 border-b border-line py-7 sm:grid-cols-[4rem_1fr] sm:gap-6"
                  data-reveal=""
                >
                  <span className="font-mono text-xs text-em">{pad(i + 1)}</span>
                  <p className="text-lede">{paragraph}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="solution" aria-labelledby="solution-heading" className="scroll-mt-28">
            <SectionLabel id="solution-heading" index={number("solution")}>
              {d.solution}
            </SectionLabel>
            <Prose paragraphs={project.solution} />
            {project.gallery.length > 0 && (
              <ul className="mt-12 grid gap-4 sm:grid-cols-2">
                {project.gallery.map((image, i) => (
                  <li
                    key={image.src}
                    className={cn(
                      "overflow-hidden rounded-card border border-line bg-surface",
                      i % 3 === 0 && "sm:col-span-2",
                    )}
                    data-reveal=""
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={image.width}
                      height={image.height}
                      sizes={i % 3 === 0 ? "(min-width: 1024px) 58vw, 92vw" : "(min-width: 1024px) 29vw, (min-width: 640px) 45vw, 92vw"}
                      className="size-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {project.highlights.length > 0 && (
            <section id="highlights" aria-labelledby="highlights-heading" className="scroll-mt-28">
              <SectionLabel id="highlights-heading" index={number("highlights")}>
                {d.highlights}
              </SectionLabel>
              <ul className="mt-10 grid border-l border-t border-line sm:grid-cols-2">
                {project.highlights.map((item, i) => (
                  <li
                    key={item}
                    className="flex items-start gap-4 border-b border-r border-line p-5 sm:p-6 sm:last:odd:col-span-2"
                    data-reveal=""
                  >
                    <span className="mt-1 font-mono text-xs text-em">{pad(i + 1)}</span>
                    <span className="text-dim">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.showcase && (
            <section id="snapshot" aria-labelledby="snapshot-heading" className="scroll-mt-28">
              <SectionLabel id="snapshot-heading" index={number("snapshot")}>
                {d.snapshot}
              </SectionLabel>
              <p className="text-lede mt-6 max-w-2xl">{d.snapshotLede}</p>
              <div className="mt-10">
                <Showcase showcase={project.showcase} labels={d} />
              </div>
            </section>
          )}

          {technologies.length > 0 && (
            <section id="stack" aria-labelledby="stack-heading" className="scroll-mt-28">
              <SectionLabel id="stack-heading" index={number("stack")}>
                {d.stack}
              </SectionLabel>
              <ul className="mt-8 flex flex-wrap gap-2.5">
                {technologies.map((t) => (
                  <li
                    key={t.slug}
                    className="flex items-center gap-3 rounded-full border border-line bg-white/[0.02] py-1.5 pl-1.5 pr-4"
                  >
                    <TechBadge
                      slug={t.slug}
                      short={t.short}
                      fallbackColor={t.category.color}
                      className="size-8 text-[0.62rem]"
                      logoClassName="size-4"
                    />
                    <span className="text-sm font-medium text-ink">{t.name}</span>
                    <span className="label-mono hidden text-faint sm:inline">{t.category.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {testimonial && (
        <section aria-labelledby="testimonial-heading" className="section-y relative overflow-hidden border-t border-line">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="blueprint fade-radial absolute inset-0 opacity-50 [--grid-size:4rem]" />
            <div className="absolute -bottom-48 left-1/2 h-[28rem] w-[56rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-em/[0.07] blur-3xl" />
          </div>
          <div className="container-x relative">
            <h2 id="testimonial-heading" className="eyebrow">
              <span aria-hidden="true" className="h-px w-8 bg-em/50" />
              {d.testimonial}
            </h2>
            <figure className="mt-10 md:mt-14" data-reveal="">
              <blockquote className="max-w-5xl">
                <p className="font-display text-[clamp(1.6rem,1.05rem+2.4vw,3.2rem)] font-medium leading-[1.12] tracking-[-0.03em] text-ink">
                  <span aria-hidden="true" className="em-serif mr-1 text-[1.3em] leading-none">
                    “
                  </span>
                  {testimonial.quote}
                  <span aria-hidden="true" className="em-serif text-[1.3em] leading-none">
                    ”
                  </span>
                </p>
              </blockquote>
              <figcaption className="mt-10 flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-em/35 bg-em/[0.08] font-display text-sm font-medium text-em"
                >
                  {initials(testimonial.author)}
                </span>
                <span>
                  <span className="block font-medium text-ink">{testimonial.author}</span>
                  <span className="block text-sm text-muted">{byline(testimonial)}</span>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>
      )}

      {next && next.slug !== project.slug && (
        <section aria-labelledby="next-case-heading" className="border-t border-line">
          <div className="container-x">
            <article className="group/card relative flex flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <div className="min-w-0">
                <p className="label-mono">{d.next}</p>
                <h2
                  id="next-case-heading"
                  className="mt-4 font-display text-[clamp(2.2rem,1.4rem+4vw,5.5rem)] font-medium leading-none tracking-[-0.05em] text-ink transition-colors duration-500 group-hover/card:text-hot"
                >
                  <Link href={`/work/${next.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
                    {next.title}
                  </Link>
                </h2>
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.72rem] tracking-[0.04em] text-muted">
                  <span>{next.category}</span>
                  <span aria-hidden="true" className="size-1 rounded-full bg-line-strong" />
                  <span>{next.client.industry}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-8">
                <div
                  aria-hidden="true"
                  className="relative hidden aspect-[16/10] w-72 overflow-hidden rounded-card border border-line bg-surface xl:block"
                >
                  <Image
                    src={next.cover.src}
                    alt=""
                    width={next.cover.width}
                    height={next.cover.height}
                    sizes="18rem"
                    className="size-full object-cover opacity-80 transition-[scale,opacity] duration-[1.4s] ease-out-expo group-hover/card:scale-[1.06] group-hover/card:opacity-100"
                  />
                </div>
                <span
                  aria-hidden="true"
                  className="grid size-16 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-em group-hover/card:bg-em group-hover/card:text-bg lg:size-24"
                >
                  <ArrowSwap trigger="card" className="size-6" />
                </span>
              </div>
            </article>
          </div>
        </section>
      )}

      <CtaSection cta={page.cta} />
      <JsonLd
        data={[
          schema,
          // The page around the case study: what it's about and what voice assistants read out.
          webPageSchema(
            {
              name: project.seo.title,
              description: project.seo.description,
              path: `/work/${project.slug}`,
              mainEntity: schema["@id"],
            },
            settings,
          ),
        ]}
      />
    </>
  );
}
