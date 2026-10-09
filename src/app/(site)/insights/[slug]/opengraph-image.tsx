import { getInsightBySlug, getPage, getSettings, getTeamMember } from "@/lib/data";
import { ogImageMetadata, renderOgImage } from "@/lib/seo/og";

type Params = { slug: string };

export async function generateImageMetadata({ params }: { params: Params }) {
  const insight = await getInsightBySlug(params.slug);
  return ogImageMetadata(insight ? insight.title : "");
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [settings, page, insight] = await Promise.all([getSettings(), getPage("insights"), getInsightBySlug(slug)]);
  if (!insight) return renderOgImage({ eyebrow: page.hero.eyebrow, title: page.hero.headline, settings });
  const author = await getTeamMember(insight.author);
  const reading = `${insight.readingTime} ${page.detail.minRead}`;
  return renderOgImage({
    eyebrow: `${page.hero.eyebrow} · ${insight.category.label}`,
    title: insight.title,
    meta: author ? `${author.name} · ${reading}` : reading,
    settings,
  });
}
