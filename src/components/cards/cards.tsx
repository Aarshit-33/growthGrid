import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { OutcomeValue } from "@/components/services/outcome-value";
import { ArrowSwap } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/tag";
import type { InsightWithMeta, Project, Service } from "@/lib/schemas";
import { cn, formatDate, pad } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Cards. Each has exactly one link (stretched over the card via
   ::after) inside a real heading — accessible and crawlable.
   Hover choreography is keyed to the named group `group/card`.
   ───────────────────────────────────────────────────────────── */

const stretched = "after:absolute after:inset-0 after:z-10 after:content-['']";

export function ProjectCard({
  project,
  cursorLabel,
  preload = false,
  headingLevel = 3,
  className,
  sizes = "(min-width: 1024px) 45vw, 92vw",
}: {
  project: Project;
  /** Label shown in the custom cursor, e.g. "View". */
  cursorLabel?: string;
  /** Preload the cover (use for above-the-fold LCP images only). */
  preload?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
  sizes?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={cn("group/card relative flex flex-col", className)}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-card border border-line bg-surface">
        <Image
          src={project.cover.src}
          alt={project.cover.alt}
          width={project.cover.width}
          height={project.cover.height}
          sizes={sizes}
          preload={preload}
          className="size-full object-cover transition-transform duration-[1.4s] ease-out-expo group-hover/card:scale-[1.045]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_top,rgb(4_7_10/0.85),rgb(4_7_10/0.1)_55%,transparent)]"
        />
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 sm:inset-x-6 sm:bottom-6">
          <dl className="flex min-w-0 gap-6">
            {project.results.slice(0, 2).map((m) => (
              <div key={m.label} className="flex min-w-0 flex-col-reverse">
                <dt className="mt-1.5 max-w-[9.5rem] text-xs leading-snug text-dim">{m.label}</dt>
                <dd className="break-words font-display text-2xl font-medium leading-none tracking-[-0.04em] text-ink sm:text-[2rem]">
                  <OutcomeValue value={m.value} count={false} />
                </dd>
              </div>
            ))}
          </dl>
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-em text-bg transition-transform duration-500 ease-out-expo lg:scale-0 lg:group-hover/card:scale-100"
          >
            <ArrowSwap trigger="card" />
          </span>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tag tone="em">{project.category}</Tag>
        <Tag>{project.client.industry}</Tag>
        <Tag>{project.year}</Tag>
      </div>
      <Heading className="text-h3 mt-4 text-ink transition-colors duration-300 group-hover/card:text-hot">
        <Link href={`/work/${project.slug}`} className={stretched} data-cursor={cursorLabel}>
          {project.title}
        </Link>
      </Heading>
      <p className="mt-3 line-clamp-3 text-dim">{project.summary}</p>
    </article>
  );
}

export function InsightCard({
  insight,
  minReadLabel,
  locale,
  headingLevel = 3,
  className,
  sizes = "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 88vw",
  preload = false,
}: {
  insight: InsightWithMeta;
  /** e.g. "min read" */
  minReadLabel: string;
  /** BCP 47 tag for the date (localeTag(settings.locale)). */
  locale: string;
  headingLevel?: 2 | 3;
  className?: string;
  sizes?: string;
  /** Preload the cover (use for above-the-fold LCP images only). */
  preload?: boolean;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={cn("group/card relative flex flex-col", className)}>
      <div className="relative aspect-[16/9] overflow-hidden rounded-card border border-line bg-surface">
        <Image
          src={insight.cover.src}
          alt={insight.cover.alt}
          width={insight.cover.width}
          height={insight.cover.height}
          sizes={sizes}
          preload={preload}
          className="size-full object-cover transition-transform duration-[1.4s] ease-out-expo group-hover/card:scale-[1.05]"
        />
        <div className="absolute left-4 top-4">
          <Tag tone="solid">{insight.category.label}</Tag>
        </div>
      </div>
      <p className="mt-5 flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
        <time dateTime={insight.publishedAt}>{formatDate(insight.publishedAt, locale)}</time>
        <span aria-hidden="true" className="size-1 rounded-full bg-faint" />
        <span>
          {insight.readingTime} {minReadLabel}
        </span>
      </p>
      <Heading className="text-h4 mt-3 text-ink transition-colors duration-300 group-hover/card:text-hot md:text-[1.4rem] md:leading-tight">
        <Link href={`/insights/${insight.slug}`} className={stretched}>
          {insight.title}
        </Link>
      </Heading>
      <p className="mt-3 line-clamp-3 text-[0.95rem] text-dim">{insight.excerpt}</p>
    </article>
  );
}

export function ServiceCard({
  service,
  index,
  headingLevel = 3,
  className,
}: {
  service: Service;
  /** 1-based position, rendered as "01". */
  index?: number;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      className={cn(
        "card card-hover edge-glow group/card relative flex flex-col overflow-hidden p-6 hover:bg-surface-2 sm:p-8",
        className,
      )}
      style={{ "--accent": service.accent } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover/card:opacity-100"
        style={{ background: `radial-gradient(circle, ${service.accent}40, transparent 70%)` }}
      />
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-12 place-items-center rounded-xl border border-line bg-white/[0.03] text-[var(--accent)]">
          <Icon name={service.icon} className="size-5" />
        </span>
        {index !== undefined && <span className="label-mono text-faint">{pad(index)}</span>}
      </div>
      <Heading className="text-h3 mt-8 text-ink">
        <Link href={`/services/${service.slug}`} className={stretched}>
          {service.title}
        </Link>
      </Heading>
      <p className="mt-3 font-mono text-[0.72rem] tracking-[0.04em] text-muted">{service.tagline}</p>
      <p className="mt-5 flex-1 text-dim">{service.summary}</p>
      <span
        aria-hidden="true"
        className="mt-8 grid size-10 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-em group-hover/card:bg-em group-hover/card:text-bg"
      >
        <ArrowSwap trigger="card" />
      </span>
    </article>
  );
}
