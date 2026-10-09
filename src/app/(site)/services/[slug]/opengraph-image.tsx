import { getPage, getServiceBySlug, getSettings } from "@/lib/data";
import { ogImageMetadata, renderOgImage } from "@/lib/seo/og";
import { headingText } from "@/lib/utils/text";

type Params = { slug: string };

export async function generateImageMetadata({ params }: { params: Params }) {
  const service = await getServiceBySlug(params.slug);
  return ogImageMetadata(service ? `${service.title}: ${headingText(service.headline)}` : "");
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [settings, page, service] = await Promise.all([getSettings(), getPage("services"), getServiceBySlug(slug)]);
  if (!service) return renderOgImage({ eyebrow: page.hero.eyebrow, title: page.hero.headline, settings });
  return renderOgImage({
    eyebrow: `${page.hero.eyebrow} · ${service.title}`,
    title: service.headline,
    meta: service.tagline,
    settings,
  });
}
