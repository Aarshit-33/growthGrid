import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties } from "react";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { PageHero } from "@/components/sections/page-hero";
import { ProcessTimeline } from "@/components/sections/process-timeline";
import { StatsGrid } from "@/components/sections/stats-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InstrumentGlyph } from "@/components/ui/instrument-glyph";
import { SectionHeading } from "@/components/ui/section-heading";
import { SocialIcon } from "@/components/ui/social-icon";
import { Availability, Tag } from "@/components/ui/tag";
import { getFaqs, getPage, getPrinciples, getProcess, getSettings, getStats, getTeam } from "@/lib/data";
import type { SocialPlatform, TeamMember } from "@/lib/schemas";
import { buildMetadata } from "@/lib/seo/metadata";
import { aboutSchema } from "@/lib/seo/schema";
import { cn, initials, interpolate, pad } from "@/lib/utils";
import { headingText } from "@/lib/utils/text";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("about")]);
  return buildMetadata({ settings, seo: page.seo, path: "/about" });
}

/* Decorative monogram tints, cycled by team order. */
const TINTS = ["#3ce49a", "#6cc7ff", "#b794f4", "#ffbf5a", "#4fd1c5", "#8b9cf7"];
const tintFor = (i: number) => TINTS[i % TINTS.length];

/** Portrait, or a monogram on a tinted blueprint when there's no photo. */
function Portrait({ member, index }: { member: TeamMember; index: number }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface-2 sm:aspect-square">
      {member.avatar ? (
        <Image
          src={member.avatar.src}
          alt={member.avatar.alt}
          fill
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 92vw"
          className="object-cover grayscale transition-[filter,scale] duration-700 ease-out-expo group-hover/member:scale-[1.03] group-hover/member:grayscale-0"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <div className="blueprint absolute inset-0 opacity-60 [--grid-size:1.75rem]" />
          <div
            className="absolute inset-0 opacity-70 transition-opacity duration-700 group-hover/member:opacity-100"
            style={{ background: "radial-gradient(circle at 50% 38%, color-mix(in oklab, var(--tint) 30%, transparent), transparent 62%)" }}
          />
          <span className="relative font-display text-[clamp(3.2rem,2.4rem+2.6vw,4.6rem)] font-medium leading-none tracking-[-0.07em] text-ink transition-transform duration-700 ease-out-expo group-hover/member:-translate-y-1">
            {initials(member.name)}
          </span>
        </div>
      )}
      <span aria-hidden="true" className="absolute left-4 top-4 label-mono tabular-nums">
        {pad(index + 1)}
      </span>
      <span
        aria-hidden="true"
        className="absolute right-4 top-4 size-2 rounded-full bg-[var(--tint)] shadow-[0_0_12px_var(--tint)]"
      />
    </div>
  );
}

export default async function AboutPage() {
  const [settings, page, stats, principles, process, team, faqs] = await Promise.all([
    getSettings(),
    getPage("about"),
    getStats(),
    getPrinciples(),
    getProcess(),
    getTeam(),
    getFaqs("about"),
  ]);

  const platformLabel = (platform: SocialPlatform) =>
    settings.socials.find((s) => s.platform === platform)?.label ?? platform;

  return (
    <>
      <Stage />
      <PageHero
        eyebrow={page.hero.eyebrow}
        headline={page.hero.headline}
        lede={page.hero.lede}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.hero.eyebrow, href: "/about" },
        ]}
        aside={
          <div className="grid gap-4">
            <div className="card card-hover edge-glow relative overflow-hidden p-6 sm:p-8">
              <div aria-hidden="true" className="blueprint fade-radial absolute inset-0 opacity-50 [--grid-size:2rem]" />
              <div className="relative">
                <Availability availability={settings.availability} />
                <ul aria-hidden="true" className="mt-9 flex -space-x-3">
                  {team.map((member, i) => (
                    <li
                      key={member.slug}
                      className="grid size-14 place-items-center rounded-full border-2 border-surface bg-surface-3 font-display text-sm font-medium tracking-[-0.03em] text-ink"
                      style={{ boxShadow: `inset 0 0 0 1px ${tintFor(i)}66, 0 0 22px -6px ${tintFor(i)}` }}
                    >
                      {initials(member.name)}
                    </li>
                  ))}
                </ul>
                <p className="mt-7 text-ink">{settings.location.label}</p>
                <p className="mt-2 text-sm text-muted">{settings.contact.responseTime}</p>
              </div>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={page.cta.primary.href} size="lg" external={page.cta.primary.external}>
            {page.cta.primary.label}
          </ButtonLink>
          {page.cta.secondary && (
            <ButtonLink href={page.cta.secondary.href} variant="secondary" size="lg">
              {page.cta.secondary.label}
            </ButtonLink>
          )}
        </div>
      </PageHero>

      {/* 01 · Story */}
      <section id="story" aria-labelledby="story-heading" className="section-y relative pt-0 md:pt-0">
        <div className="container-x grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h)+2.5rem)]">
              <SectionHeading intro={page.story} index="01" id="story-heading" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <div className="space-y-7">
              {page.story.paragraphs.map((paragraph, i) => (
                <p
                  key={i}
                  data-reveal=""
                  className={
                    i === 0 ? "text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] leading-snug text-ink" : "text-lede"
                  }
                >
                  {paragraph}
                </p>
              ))}
            </div>
            <blockquote
              data-reveal=""
              className="relative mt-12 overflow-hidden rounded-panel border border-em/25 bg-[linear-gradient(135deg,rgb(60_228_154/0.09),transparent_60%)] p-7 sm:p-10"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-2 font-serif text-[7rem] italic leading-none text-em opacity-20 sm:right-8"
              >
                ”
              </span>
              <span aria-hidden="true" className="absolute inset-y-7 left-0 w-px bg-[linear-gradient(to_bottom,transparent,var(--color-em),transparent)] sm:inset-y-10" />
              <p className="relative font-display text-[clamp(1.35rem,1.05rem+1.1vw,2.05rem)] font-medium leading-[1.2] tracking-[-0.025em] text-ink">
                {page.story.highlight}
              </p>
            </blockquote>
          </div>
        </div>
      </section>

      {/* 02 · Stats */}
      <section aria-labelledby="stats-heading" className="section-y relative border-t border-line">
        <div className="container-x">
          <SectionHeading intro={page.stats} index="02" id="stats-heading">
            {/* Each number a step up: one pillar per stat, lit by the cell under the pointer. */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-line lg:w-[24rem] xl:w-[28rem]">
              <SceneSlot
                scene={{ id: "pillars", data: { count: stats.length } }}
                fallback={
                  <>
                    <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:2rem]" />
                    <div className="absolute inset-x-[24%] bottom-[20%] top-[18%] flex items-end gap-3">
                      {stats.map((stat, i) => (
                        <span
                          key={stat.key}
                          className="flex-1 rounded-sm border border-em/40 bg-em/[0.05]"
                          style={{ height: `${((i + 1) / stats.length) * 100}%` }}
                        />
                      ))}
                    </div>
                  </>
                }
              />
            </div>
          </SectionHeading>
          <StatsGrid stats={stats} className="mt-14 lg:mt-20" />
        </div>
      </section>

      {/* 03 · Principles */}
      <section id="principles" aria-labelledby="principles-heading" className="section-y relative border-t border-line">
        <div className="container-x">
          <SectionHeading intro={page.principles} index="03" id="principles-heading" />
          <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-20 xl:grid-cols-4">
            {principles.map((principle, i) => (
              <li
                key={principle.key}
                data-reveal=""
                style={{ "--reveal-delay": `${i * 80}ms` } as CSSProperties}
                className="flex"
              >
                {/* Inner card: keeps hover styles independent of the reveal transition on the <li>. */}
                <div
                  data-principle-card=""
                  className="card card-hover edge-glow group/principle relative isolate flex w-full flex-col overflow-hidden bg-transparent! p-6 sm:p-7"
                >
                  <p className="flex items-center justify-between label-mono">
                    <span className="text-em tabular-nums">{pad(i + 1)}</span>
                    <span>{principle.label}</span>
                  </p>
                  {/* The instrument, drawn by the shared canvas beneath the page exactly as in the
                      home explorer. The card's surface is painted by a spread shadow around this
                      window, so the canvas only shows through here (decorative). */}
                  <div className="relative my-6 aspect-square w-full rounded-xl border border-line bg-[radial-gradient(circle_at_50%_48%,rgb(60_228_154/0.07),transparent_62%)]">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-px -z-10 rounded-xl shadow-[0_0_0_100vmax_rgb(13_20_26)]"
                    />
                    <SceneSlot
                      instance={principle.key}
                      scene={{
                        id: "instrument",
                        data: { shape: principle.instrument.shape, index: i, total: principles.length },
                      }}
                      className="overflow-hidden rounded-xl"
                      fallback={
                        <div className="absolute inset-0 grid place-items-center">
                          <InstrumentGlyph
                            shape={principle.instrument.shape}
                            className="w-[62%] opacity-75 drop-shadow-[0_0_14px_rgb(60_228_154/0.45)]"
                          />
                        </div>
                      }
                    />
                  </div>
                  <h3 className="text-h4 text-ink">{principle.title}</h3>
                  <p className="mt-3 text-[0.95rem] text-dim">{principle.summary}</p>
                  <p className="mt-auto flex items-center gap-2 pt-7 label-mono text-em">
                    <span aria-hidden="true" className="size-1.5 rotate-45 bg-em" />
                    {principle.instrument.name}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 04 · Process (linked as /about#process from the homepage and llms.txt) */}
      <section id="process" aria-labelledby="process-heading" className="section-y relative border-t border-line">
        <div className="container-x grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h)+2.5rem)]">
              <SectionHeading intro={page.process} index="04" id="process-heading" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <ProcessTimeline steps={process} />
          </div>
        </div>
      </section>

      {/* 05 · Engagement models */}
      <section id="engagement" aria-labelledby="engagement-heading" className="section-y relative border-t border-line">
        <div className="container-x">
          <SectionHeading intro={page.engagement} index="05" id="engagement-heading" />
          <ol className="mt-14 grid gap-4 lg:mt-20 lg:grid-cols-3">
            {page.engagement.models.map((model, i) => (
              <li
                key={model.title}
                data-reveal=""
                style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
                className={cn(
                  "card card-hover relative flex flex-col overflow-hidden p-7 sm:p-8",
                  i === 1 && "edge-glow bg-[linear-gradient(160deg,rgb(60_228_154/0.07),transparent_55%),var(--color-surface)]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-xl border border-em/30 bg-em/[0.07] text-em">
                    <Icon name={model.icon} className="size-5" aria-hidden="true" />
                  </span>
                  <span className="label-mono tabular-nums">{pad(i + 1)}</span>
                </div>
                <h3 className="text-h3 mt-8 text-ink">{model.title}</h3>
                <p className="mb-8 mt-3 text-dim">{model.summary}</p>
                <dl className="mt-auto grid gap-6 border-t border-line pt-6">
                  <div>
                    <dt className="label-mono">{page.engagement.bestForLabel}</dt>
                    <dd className="mt-2 text-[0.95rem] text-dim">{model.bestFor}</dd>
                  </div>
                  <div>
                    <dt className="label-mono">{page.engagement.durationLabel}</dt>
                    <dd className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-ink">{model.duration}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 06 · Team */}
      <section id="team" aria-labelledby="team-heading" className="section-y relative border-t border-line">
        <div className="container-x">
          <SectionHeading intro={page.team} index="06" id="team-heading" />
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-20 xl:grid-cols-4">
            {team.map((member, i) => (
              <li
                key={member.slug}
                id={member.slug}
                data-reveal=""
                style={{ "--reveal-delay": `${i * 80}ms`, "--tint": tintFor(i) } as CSSProperties}
                className="card card-hover group/member relative flex scroll-mt-28 flex-col overflow-hidden p-4 sm:p-5"
              >
                <Portrait member={member} index={i} />
                <div className="flex flex-1 flex-col px-2 pb-2 pt-6">
                  <h3 className="text-h4 text-ink">{member.name}</h3>
                  <p className="mt-2 label-mono normal-case tracking-[0.04em] text-[var(--tint)]">{member.role}</p>
                  <p className="mt-4 text-[0.95rem] text-dim">{member.bio}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {member.focus.map((f) => (
                      <li key={f}>
                        <Tag>{f}</Tag>
                      </li>
                    ))}
                  </ul>
                  {member.socials.length > 0 && (
                    <ul className="mt-auto flex gap-2 pt-6">
                      {member.socials.map((social) => (
                        <li key={social.url}>
                          <a
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={interpolate(page.team.socialLabel, {
                              name: member.name,
                              platform: platformLabel(social.platform),
                            })}
                            className="grid size-10 place-items-center rounded-full border border-line-strong text-dim transition-colors duration-300 hover:border-[var(--tint)] hover:text-ink"
                          >
                            <SocialIcon platform={social.platform} size={16} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FaqSection intro={page.faq} faqs={faqs} index="07" className="border-t border-line" />

      <CtaSection cta={page.cta} />

      <JsonLd
        data={aboutSchema(
          { name: headingText(page.hero.headline), description: page.seo.description, path: "/about" },
          team,
          settings,
        )}
      />
    </>
  );
}
