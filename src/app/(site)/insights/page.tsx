import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { InsightCard } from "@/components/cards/cards";
import { FeaturedInsight } from "@/components/insights/featured-insight";
import { FilteredInsights, InsightsFilter, TopicFilter } from "@/components/insights/insights-filter";
import { CtaSection } from "@/components/sections/cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { getInsights, getPage, getSettings, getTeamMember } from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { collectionPageSchema } from "@/lib/seo/schema";
import { localeTag } from "@/lib/utils";
import { headingText } from "@/lib/utils/text";

const PATH = "/insights";
const ALL = "all";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("insights")]);
  return buildMetadata({ settings, seo: page.seo, path: PATH });
}

export default async function InsightsPage() {
  const [settings, page, insights] = await Promise.all([getSettings(), getPage("insights"), getInsights()]);
  const featured = insights.find((insight) => insight.featured) ?? insights[0];
  const rest = insights.filter((insight) => insight !== featured);
  const featuredAuthor = featured ? await getTeamMember(featured.author) : undefined;
  const locale = localeTag(settings.locale);

  // Topics in order of first appearance (insights are newest first).
  const topics = [...new Map(insights.map((insight) => [insight.category.key, insight.category.label]))].map(
    ([key, label]) => ({ key, label }),
  );
  const counts: Record<string, number> = { [ALL]: insights.length };
  for (const insight of insights) counts[insight.category.key] = (counts[insight.category.key] ?? 0) + 1;

  const items = [
    ...(featured
      ? [
          {
            key: featured.slug,
            topic: featured.category.key,
            wide: true,
            node: (
              <FeaturedInsight
                insight={featured}
                author={featuredAuthor}
                featuredLabel={page.featuredLabel}
                minReadLabel={page.detail.minRead}
                locale={locale}
              />
            ),
          },
        ]
      : []),
    ...rest.map((insight, i) => ({
      key: insight.slug,
      topic: insight.category.key,
      node: (
        <div data-reveal="" style={{ "--reveal-delay": `${(i % 3) * 90}ms` } as CSSProperties}>
          <InsightCard insight={insight} minReadLabel={page.detail.minRead} locale={locale} headingLevel={2} />
        </div>
      ),
    })),
  ];

  return (
    <>
      <InsightsFilter topics={topics.map((topic) => topic.key)}>
        <PageHero
          eyebrow={page.hero.eyebrow}
          headline={page.hero.headline}
          lede={page.hero.lede}
          breadcrumbs={[
            { label: settings.ui.home, href: "/" },
            { label: page.hero.eyebrow, href: PATH },
          ]}
        >
          {topics.length > 1 && (
            <TopicFilter
              label={page.filters.label}
              topics={[{ key: ALL, label: page.filters.all }, ...topics]}
              counts={counts}
              results={page.filters.results}
              locale={locale}
            />
          )}
        </PageHero>

        <div className="container-x pb-[var(--section-y)]">
          <FilteredInsights items={items} />
        </div>
      </InsightsFilter>

      <CtaSection cta={page.cta} className="border-t border-line" />

      <JsonLd
        data={collectionPageSchema(
          {
            name: headingText(page.hero.headline),
            description: page.seo.description,
            path: PATH,
            items: insights.map((insight) => ({ name: insight.title, path: `${PATH}/${insight.slug}` })),
          },
          settings,
        )}
      />
    </>
  );
}
