import Image from "next/image";
import Link from "next/link";
import { AuthorByline } from "@/components/insights/author";
import { ArrowSwap } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { InsightWithMeta, TeamMember } from "@/lib/schemas";
import { cn, formatDate } from "@/lib/utils";

/**
 * Wide lead story for the insights index: cover on the left, story on
 * the right (stacked on mobile). The whole panel is one link target.
 */
export function FeaturedInsight({
  insight,
  author,
  featuredLabel,
  minReadLabel,
  locale,
  className,
}: {
  insight: InsightWithMeta;
  author?: TeamMember;
  featuredLabel: string;
  minReadLabel: string;
  /** BCP 47 tag for the date (localeTag(settings.locale)). */
  locale: string;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group/card card card-hover edge-glow isolate grid overflow-hidden before:z-20 hover:before:opacity-100 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-em/70 lg:grid-cols-12",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-surface-2 lg:col-span-7 lg:row-start-1 lg:aspect-auto lg:min-h-[32rem] lg:border-b-0 lg:border-r">
        <Image
          src={insight.cover.src}
          alt={insight.cover.alt}
          fill
          preload
          sizes="(min-width: 1440px) 760px, (min-width: 1024px) 55vw, 94vw"
          className="object-cover transition-transform duration-[1.4s] ease-out-expo group-hover/card:scale-[1.04]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(4_7_10/0.55))] lg:bg-[linear-gradient(90deg,transparent_60%,rgb(4_7_10/0.45))]"
        />
      </div>

      {/* Absolutely positioned grid child: its containing block is the text column's grid area.
          The column itself stays unpositioned so the title's stretched link covers the whole card. */}
      <div
        aria-hidden="true"
        className="blueprint fade-radial pointer-events-none absolute inset-0 -z-10 row-start-2 opacity-30 [--grid-size:2rem] lg:col-span-5 lg:col-start-8 lg:row-start-1"
      />

      <div className="flex flex-col p-6 sm:p-8 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:p-10 xl:p-12">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="em">
            <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-em" />
            {featuredLabel}
          </Tag>
          <Tag>{insight.category.label}</Tag>
        </div>

        <p className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted lg:mt-10">
          <time dateTime={insight.publishedAt}>{formatDate(insight.publishedAt, locale)}</time>
          <span aria-hidden="true" className="size-1 rounded-full bg-faint" />
          <span>
            {insight.readingTime} {minReadLabel}
          </span>
        </p>

        <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,1.2rem+1.9vw,2.75rem)] font-medium leading-[1.06] tracking-[-0.035em] text-ink transition-colors duration-300 group-hover/card:text-hot">
          <Link href={`/insights/${insight.slug}`} className="after:absolute after:inset-0 after:z-10 after:content-['']">
            {insight.title}
          </Link>
        </h2>
        <p className="mt-5 text-dim md:text-[1.05rem]">{insight.excerpt}</p>

        <div className="mt-auto flex items-end justify-between gap-6 pt-10">
          {author ? <AuthorByline author={author} /> : <span />}
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-em group-hover/card:bg-em group-hover/card:text-bg"
          >
            <ArrowSwap trigger="card" />
          </span>
        </div>
      </div>
    </article>
  );
}
