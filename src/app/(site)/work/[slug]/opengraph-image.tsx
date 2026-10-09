import { getPage, getProjectBySlug, getSettings } from "@/lib/data";
import { ogImageMetadata, renderOgImage } from "@/lib/seo/og";

type Params = { slug: string };

export async function generateImageMetadata({ params }: { params: Params }) {
  const project = await getProjectBySlug(params.slug);
  return ogImageMetadata(project ? `${project.title} — ${project.outcome}` : "");
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [settings, page, project] = await Promise.all([getSettings(), getPage("work"), getProjectBySlug(slug)]);
  if (!project) return renderOgImage({ eyebrow: page.hero.eyebrow, title: page.hero.headline, settings });
  return renderOgImage({
    eyebrow: `${page.breadcrumb} · ${project.client.industry}`,
    title: project.title,
    meta: project.outcome,
    settings,
  });
}
