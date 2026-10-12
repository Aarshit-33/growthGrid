import { InsightAccordion, type InsightAccordionItem } from "@/components/home/insight-accordion";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, InsightWithMeta } from "@/lib/schemas";
import { formatDate } from "@/lib/utils";

/**
 * Latest field notes as expanding cards: one open with the details, the rest
 * collapsed to their titles (stacked rows on phones, a row of strips from
 * tablets up). Any number of insights fits; see InsightAccordion.
 */
export function InsightsSection({
  intro,
  insights,
  minReadLabel,
  locale,
  index,
}: {
  intro: HomePage["insights"];
  insights: InsightWithMeta[];
  minReadLabel: string;
  /** BCP 47 tag for the dates (localeTag(settings.locale)). */
  locale: string;
  index?: string;
}) {
  if (insights.length === 0) return null;
  // Only what the cards show crosses to the client (never the article bodies).
  const items: InsightAccordionItem[] = insights.map((insight) => ({
    slug: insight.slug,
    title: insight.title,
    excerpt: insight.excerpt,
    category: insight.category.label,
    icon: insight.category.icon ?? "compass",
    cover: insight.cover,
    publishedAt: insight.publishedAt,
    date: formatDate(insight.publishedAt, locale),
    readingTime: insight.readingTime,
  }));
  return (
    <section id="insights" aria-labelledby="insights-heading" className="section-y relative">
      <div className="container-x">
        <SectionHeading intro={intro} index={index} id="insights-heading">
          <ButtonLink href={intro.cta.href} variant="secondary" external={intro.cta.external}>
            {intro.cta.label}
          </ButtonLink>
        </SectionHeading>
      </div>
      <InsightAccordion
        items={items}
        minReadLabel={minReadLabel}
        readLabel={intro.readLabel}
        prevLabel={intro.prevLabel}
        nextLabel={intro.nextLabel}
        className="mt-12 lg:mt-16"
      />
    </section>
  );
}
