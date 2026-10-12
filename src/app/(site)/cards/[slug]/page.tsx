import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft, Globe, Mail, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CardActions } from "@/components/cards/card-actions";
import { CardScanTracker } from "@/components/cards/card-tracker";
import { CardViewer } from "@/components/cards/card-viewer";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SplitHeading } from "@/components/ui/split-heading";
import { getCardPeople, getCardPerson, getCardsContent } from "@/lib/cards/data";
import { cardPath } from "@/lib/cards/person";
import { cardView } from "@/lib/cards/view";
import { buildMetadata } from "@/lib/seo/metadata";
import { SPEAKABLE } from "@/lib/seo/speakable";
import { absoluteUrl, interpolate } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

/* A card added in the Studio goes live without a redeploy; unknown slugs 404. */
export const dynamicParams = true;

export async function generateStaticParams() {
  const people = await getCardPeople();
  return people.map((person) => ({ slug: person.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [person, { page, settings }] = await Promise.all([getCardPerson(slug), getCardsContent()]);
  if (!person) return {};
  const values = { name: person.name, role: person.role, site: settings.name };
  return buildMetadata({
    settings,
    path: cardPath(slug),
    seo: {
      title: interpolate(page.member.seoTitle, values),
      description: interpolate(page.member.seoDescription, values),
      noIndex: page.seo.noIndex,
    },
  });
}

/**
 * One person's card, made for phones first: who it is, the card (flip it),
 * then everything you'd do with it: save the contact, share the link,
 * download the artwork, or call, email and visit straight from the page.
 */
export default async function CardPage({ params }: Props) {
  const { slug } = await params;
  const [person, { page, settings }] = await Promise.all([getCardPerson(slug), getCardsContent()]);
  if (!person) notFound();

  const { labels } = page;
  const view = cardView(person, page, settings);
  const url = absoluteUrl(cardPath(slug), settings.url);

  const details: { icon: LucideIcon; label: string; value: string; href: string; external?: boolean }[] = [
    ...(person.phone ? [{ icon: Phone, label: labels.phone, value: person.phone.display, href: `tel:${person.phone.tel}` }] : []),
    ...(person.email ? [{ icon: Mail, label: labels.emailLabel, value: person.email, href: `mailto:${person.email}` }] : []),
    { icon: Globe, label: labels.website, value: person.website.display, href: person.website.href, external: true },
  ];

  return (
    <>
      <section className="relative overflow-hidden pb-[var(--section-y)] pt-[calc(var(--header-h)+1.75rem)] md:pt-[calc(var(--header-h)+3.5rem)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:4rem]" />
          <div className="absolute -top-56 left-1/2 h-[34rem] w-[60rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-em/[0.09] blur-3xl" />
        </div>

        <div className="container-x relative">
          <Breadcrumbs
            items={[
              { label: settings.ui.home, href: "/" },
              { label: page.breadcrumb, href: "/cards" },
              { label: person.name, href: cardPath(slug) },
            ]}
          />

          <div className="mt-8 grid grid-cols-1 gap-10 md:mt-12 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-10">
            {/* Who: first on phones, beside the card on wide screens. */}
            <header className="lg:order-2 lg:col-span-5 lg:self-end">
              <p className="eyebrow load-fade" style={{ "--delay": "60ms" } as CSSProperties}>
                <span aria-hidden="true" className="h-px w-8 bg-em/50" />
                {page.member.eyebrow}
              </p>
              <SplitHeading as="h1" id={SPEAKABLE.title} mode="load" text={person.name} className="text-h2 mt-5" delay={120} />
              <p id={SPEAKABLE.summary} className="text-lede load-fade mt-4" style={{ "--delay": "320ms" } as CSSProperties}>
                {person.role} · {person.org}
              </p>
            </header>

            <div className="load-fade lg:order-1 lg:col-span-7 lg:row-span-2 lg:self-center" style={{ "--delay": "200ms" } as CSSProperties}>
              <CardViewer
                front={view.front}
                back={view.back}
                radius={view.radius}
                flipLabel={labels.flip}
                alt={view.alt}
                sideLabels={{ front: labels.front, back: labels.back }}
                hint={labels.flipHint}
              />
            </div>

            <div className="load-fade space-y-8 lg:order-3 lg:col-span-5 lg:self-start" style={{ "--delay": "420ms" } as CSSProperties}>
              <CardActions slug={slug} url={url} title={view.share.title} text={view.share.text} files={view.files} labels={labels} />

              <section aria-labelledby="card-details" className="card p-5 sm:p-6">
                <h2 id="card-details" className="label-mono">
                  {labels.details}
                </h2>
                <ul className="mt-3 divide-y divide-line">
                  {details.map(({ icon: Icon, label, value, href, external }) => (
                    <li key={label}>
                      <a
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="group/row flex items-center gap-4 py-3.5 transition-colors"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-em/30 bg-em/[0.08] text-em transition-colors duration-300 group-hover/row:bg-em group-hover/row:text-bg">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">{label}</span>
                          <span className="block truncate font-display text-[1.05rem] font-medium tracking-[-0.01em] text-ink transition-colors duration-300 group-hover/row:text-hot">
                            {value}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              <Link
                href="/cards"
                className="inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted transition-colors hover:text-em"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {labels.all}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CardScanTracker slug={slug} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: person.name,
          jobTitle: person.role,
          url,
          ...(person.email ? { email: `mailto:${person.email}` } : {}),
          ...(person.phone ? { telephone: person.phone.tel } : {}),
          worksFor: { "@type": "Organization", name: settings.name, url: settings.url },
        }}
      />
    </>
  );
}
