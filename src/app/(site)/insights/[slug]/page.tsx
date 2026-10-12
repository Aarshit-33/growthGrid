import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { InsightCard } from "@/components/cards/cards";
import { Blocks, extractToc } from "@/components/content/blocks";
import { AuthorByline, AuthorCard } from "@/components/insights/author";
import { ReadingProgress } from "@/components/insights/reading-progress";
import { ShareLinks, type ShareTarget } from "@/components/insights/share-links";
import { DocumentLayout } from "@/components/legal/document-layout";
import { CtaSection } from "@/components/sections/cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { getInsightBySlug, getInsights, getPage, getSettings, getTeamMember } from "@/lib/data";
import type { InsightWithMeta } from "@/lib/schemas";
import { buildMetadata } from "@/lib/seo/metadata";
import { articleSchema } from "@/lib/seo/schema";
import { SPEAKABLE } from "@/lib/seo/speakable";
import { absoluteUrl, formatDate, localeTag } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

/* Slugs not known at build time render on demand (a article added in the
   Studio goes live without a redeploy); unknown ones still 404 via notFound(). */
export const dynamicParams = true;

export async function generateStaticParams() {
  const insights = await getInsights();
  return insights.map((insight) => ({ slug: insight.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, insight] = await Promise.all([getSettings(), getInsightBySlug(slug)]);
  if (!insight) return {};
  const author = await getTeamMember(insight.author);
  return buildMetadata({
    settings,
    seo: insight.seo,
    path: `/insights/${insight.slug}`,
    type: "article",
    publishedTime: insight.publishedAt,
    modifiedTime: insight.updatedAt,
    authors: author ? [author.name] : undefined,
    tags: insight.tags,
  });
}

/** Up to `limit` other articles: same topic first, then the newest. */
function relatedTo(current: InsightWithMeta, all: InsightWithMeta[], limit = 3) {
  const others = all.filter((insight) => insight.slug !== current.slug);
  return [
    ...others.filter((insight) => insight.category.key === current.category.key),
    ...others.filter((insight) => insight.category.key !== current.category.key),
  ].slice(0, limit);
}

const Dot = () => <span aria-hidden="true" className="size-1 rounded-full bg-faint" />;

export default async function InsightPage({ params }: Props) {
  const { slug } = await params;
  const insight = await getInsightBySlug(slug);
  if (!insight) notFound();

  const [settings, page, all, author] = await Promise.all([
    getSettings(),
    getPage("insights"),
    getInsights(),
    getTeamMember(insight.author),
  ]);
  const { detail } = page;
  const path = `/insights/${insight.slug}`;
  const url = absoluteUrl(path, settings.url);
  const authorHref = author ? `/about#${author.slug}` : undefined;
  const related = relatedTo(insight, all);
  const locale = localeTag(settings.locale);
  const toc = extractToc(insight.body)
    .filter((entry) => entry.level === 2)
    .map((entry) => ({ id: entry.id, label: entry.text }));

  // The platform's name: Insights page › Detail › Share on.
  const platformLabel = (platform: ShareTarget["platform"]) => detail.shareOn[platform];
  const share = {
    label: detail.share,
    copyLabel: detail.copyLink,
    copiedLabel: detail.copied,
    url,
    title: insight.title,
    via: settings.seo.twitterHandle?.replace(/^@/, ""),
    targets: (["x", "linkedin"] as const).map((platform) => ({ platform, label: platformLabel(platform) })),
  };

  return (
    <>
      <ReadingProgress targetId="article-body" />

      <article>
        <PageHero
          eyebrow={insight.category.label}
          headline={insight.title}
          lede={insight.excerpt}
          breadcrumbs={[
            { label: settings.ui.home, href: "/" },
            { label: page.hero.eyebrow, href: "/insights" },
            { label: insight.title, href: path },
          ]}
        >
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            {author && <AuthorByline author={author} href={authorHref} />}
            {author && <span aria-hidden="true" className="hidden h-9 w-px bg-line-strong sm:block" />}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
              <time dateTime={insight.publishedAt}>{formatDate(insight.publishedAt, locale)}</time>
              {insight.updatedAt && (
                <>
                  <Dot />
                  <span>
                    {detail.updated}{" "}
                    <time dateTime={insight.updatedAt} className="text-dim">
                      {formatDate(insight.updatedAt, locale)}
                    </time>
                  </span>
                </>
              )}
              <Dot />
              <span>
                {insight.readingTime} {detail.minRead}
              </span>
            </p>
          </div>
        </PageHero>

        <div className="container-x">
          <div className="relative aspect-[16/10] overflow-hidden rounded-panel border border-line bg-surface-2 shadow-panel sm:aspect-[16/9] lg:aspect-[2.2/1]">
            <Image
              src={insight.cover.src}
              alt={insight.cover.alt}
              fill
              preload
              sizes="(min-width: 1536px) 1440px, 94vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_60%,rgb(4_7_10/0.45))]"
            />
          </div>
        </div>

        <DocumentLayout
          toc={toc}
          tocLabel={detail.contents}
          rail={<ShareLinks id="share-rail" {...share} />}
          className="pb-[var(--section-y)] pt-14 md:pt-20"
        >
          <div className="max-w-[68ch]">
            <div id="article-body">
              <Blocks blocks={insight.body} labels={settings.ui} />

              <aside
                aria-labelledby="takeaway-label"
                className="relative isolate mt-14 overflow-hidden rounded-card border border-em/30 bg-em/[0.045] p-6 sm:p-8"
              >
                <div
                  aria-hidden="true"
                  className="blueprint fade-radial pointer-events-none absolute inset-0 -z-10 opacity-50 [--grid-size:1.25rem]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-6 left-0 w-0.5 rounded-full bg-em shadow-[0_0_14px_var(--color-em)] sm:inset-y-8"
                />
                <p id="takeaway-label" className="label-mono flex items-center gap-2 text-em">
                  <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-em" />
                  {detail.takeaway}
                </p>
                {/* The article's answer in a sentence: read out by voice assistants (speakable). */}
                <p
                  id={SPEAKABLE.takeaway}
                  className="mt-4 text-balance font-display text-[clamp(1.2rem,1rem+0.8vw,1.55rem)] font-medium leading-snug tracking-[-0.02em] text-ink"
                >
                  {insight.takeaway}
                </p>
              </aside>
            </div>

            {insight.tags.length > 0 && (
              <ul className="mt-10 flex flex-wrap gap-2">
                {insight.tags.map((tag) => (
                  <li key={tag}>
                    <Tag>{tag}</Tag>
                  </li>
                ))}
              </ul>
            )}

            <ShareLinks id="share-end" {...share} className="mt-10 border-t border-line pt-8 lg:hidden" />

            {author && authorHref && (
              <AuthorCard author={author} label={detail.writtenBy} href={authorHref} className="mt-12" />
            )}
          </div>
        </DocumentLayout>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="section-y border-t border-line">
          <div className="container-x">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 id="related-heading" className="text-h2 text-ink">
                {detail.related}
              </h2>
              <ButtonLink href="/insights" variant="secondary">
                {page.hero.eyebrow}
              </ButtonLink>
            </div>
            <ul className="mt-12 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
              {related.map((item, i) => (
                <li key={item.slug} data-reveal="" style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}>
                  <InsightCard insight={item} minReadLabel={detail.minRead} locale={locale} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <CtaSection cta={page.cta} className="border-t border-line" />

      <JsonLd data={articleSchema(insight, author, settings)} />
    </>
  );
}
