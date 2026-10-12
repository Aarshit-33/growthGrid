import type { Metadata } from "next";
import { Blocks, extractToc } from "@/components/content/blocks";
import { DocumentLayout } from "@/components/legal/document-layout";
import { PageHero } from "@/components/sections/page-hero";
import { getPage, getSettings } from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { formatDate, localeTag } from "@/lib/utils";

type LegalKey = "privacy" | "terms";

const path = (key: LegalKey) => `/${key}`;

export async function legalMetadata(key: LegalKey): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage(key)]);
  return buildMetadata({ settings, seo: page.seo, path: path(key) });
}

/**
 * Privacy and terms share one calm, highly legible layout: a quiet hero
 * with the last-updated date, then the document with a contents rail.
 */
export async function LegalDocument({ pageKey }: { pageKey: LegalKey }) {
  const [settings, page] = await Promise.all([getSettings(), getPage(pageKey)]);
  const toc = extractToc(page.body)
    .filter((entry) => entry.level === 2)
    .map((entry) => ({ id: entry.id, label: entry.text }));
  const crumbs = [
    { label: settings.ui.home, href: "/" },
    { label: page.title, href: path(pageKey) },
  ];

  return (
    <article>
      <PageHero eyebrow={page.eyebrow} headline={page.title} breadcrumbs={crumbs}>
        <p className="label-mono">
          {page.updatedLabel}{" "}
          <time dateTime={page.updatedAt} className="text-dim">
            {formatDate(page.updatedAt, localeTag(settings.locale))}
          </time>
        </p>
      </PageHero>

      <DocumentLayout toc={toc} tocLabel={page.contentsLabel} className="pb-[var(--section-y)]">
        <div className="max-w-[68ch] border-t border-line pt-10 md:pt-12">
          <Blocks blocks={page.body} labels={settings.ui} />
        </div>
      </DocumentLayout>
    </article>
  );
}
