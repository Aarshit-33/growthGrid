import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CardActions } from "@/components/cards/card-actions";
import { FlipCard } from "@/components/cards/flip-card";
import { PageHero } from "@/components/sections/page-hero";
import { ArrowSwap } from "@/components/ui/button";
import { getCardPeople, getCardsContent } from "@/lib/cards/data";
import { cardPath } from "@/lib/cards/person";
import { cardView } from "@/lib/cards/view";
import { buildMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { page, settings } = await getCardsContent();
  return buildMetadata({ settings, seo: page.seo, path: "/cards" });
}

/** Every team member's card: flip it here, open it for the full set of actions. */
export default async function CardsPage() {
  const [{ page, settings }, people] = await Promise.all([getCardsContent(), getCardPeople()]);
  const { labels } = page;
  const views = people.map((person) => cardView(person, page, settings));

  return (
    <>
      <PageHero
        eyebrow={page.hero.eyebrow}
        headline={page.hero.headline}
        lede={page.hero.lede}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.breadcrumb, href: "/cards" },
        ]}
        className="pb-10 md:pb-16"
      />

      <section aria-label={page.breadcrumb} className="relative pb-[var(--section-y)]">
        <div className="container-x">
          {views.length === 0 ? (
            <p className="card p-8 text-center text-dim">{labels.empty}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
              {views.map((view, i) => {
                const href = cardPath(view.person.slug);
                return (
                  <li
                    key={view.person.slug}
                    data-reveal=""
                    style={{ "--reveal-delay": `${Math.min(i, 5) * 70}ms` } as CSSProperties}
                    className="card card-hover edge-glow group/card flex min-w-0 flex-col p-3 sm:p-4"
                  >
                    <FlipCard
                      front={view.front}
                      back={view.back}
                      radius={view.radius}
                      flipLabel={labels.flip}
                      alt={view.alt}
                      hoverFlip
                      className="z-10"
                    />
                    <div className="flex flex-1 items-end justify-between gap-4 px-2 pb-1 pt-5">
                      <div className="min-w-0">
                        <h2 className="text-h4 truncate text-ink">
                          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                            {view.person.name}
                          </Link>
                        </h2>
                        <p className="mt-1 truncate text-[0.88rem] text-muted">{view.person.role}</p>
                      </div>
                      {/* Above the card-wide link, so these stay clickable. */}
                      <CardActions
                        variant="compact"
                        className="relative z-10 shrink-0"
                        slug={view.person.slug}
                        url={absoluteUrl(href, settings.url)}
                        title={view.share.title}
                        text={view.share.text}
                        files={view.files}
                        labels={labels}
                      />
                    </div>
                    <span className="mx-2 mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted transition-colors duration-300 group-hover/card:text-em">
                      {labels.open}
                      <ArrowSwap trigger="card" className="size-3.5" />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
