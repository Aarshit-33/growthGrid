import type { CSSProperties } from "react";
import { Check, Timer } from "lucide-react";
import { ArrowLink, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { SplitHeading } from "@/components/ui/split-heading";
import type { Aftercare, SectionIntro } from "@/lib/schemas";
import { cn, interpolate } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   After launch: the warranty, handover and care plans that follow
   every project. One offer (services page content), two framings:
   the full home section and a short block on every service page.
   Pure server markup and CSS, so it reads the same with or without
   JavaScript, WebGL or a GPU. Copy may use {days}.
   ───────────────────────────────────────────────────────────── */

const delay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

/** The free bug-fix window, with a launch → day N → care plan timeline. */
function WarrantyCard({
  warranty,
  compact = false,
  className,
}: {
  warranty: Aftercare["warranty"];
  compact?: boolean;
  className?: string;
}) {
  const days = warranty.days;
  const [start, end, after] = warranty.timeline.map((stop) => interpolate(stop, { days }));

  return (
    <div
      data-reveal=""
      className={cn(
        "card card-hover edge-glow group/warranty relative flex flex-col overflow-hidden",
        "bg-[linear-gradient(160deg,rgb(60_228_154/0.1),transparent_58%),var(--color-surface)]",
        compact ? "p-6 sm:p-7" : "p-7 sm:p-9",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-em/[0.14] blur-3xl"
      />
      <p className="label-mono relative flex items-center gap-2 text-em">
        <Icon name="shield-check" className="size-4" />
        {warranty.label}
      </p>

      <p className={cn("relative flex items-baseline gap-3", compact ? "mt-6" : "mt-8")}>
        <span
          className={cn(
            "ink-gradient font-display font-medium leading-[0.8] tracking-[-0.06em]",
            compact ? "text-[clamp(3.75rem,3rem+3vw,5rem)]" : "text-[clamp(4.5rem,3rem+6vw,8rem)]",
          )}
        >
          {days}
        </span>
        <span className="label-mono text-dim">{warranty.unit}</span>
      </p>

      <h3 className={cn("relative text-ink", compact ? "text-h4 mt-6" : "text-h3 mt-8")}>
        {interpolate(warranty.title, { days })}
      </h3>
      <p className={cn("relative mt-3 text-dim", compact && "text-[0.95rem]")}>{warranty.text}</p>

      {/* Launch → end of warranty (covered, fills in once the card is
          revealed; static without JS / with reduced motion) → care plan
          (optional, dashed). */}
      <div className={cn("relative mt-auto", compact ? "pt-8" : "pt-10")}>
        <div aria-hidden="true" className="relative mx-1.5 h-px">
          <span className="absolute inset-y-0 left-0 w-1/2 bg-line-strong" />
          <span className="absolute inset-y-0 left-0 w-1/2 origin-left bg-[linear-gradient(90deg,var(--color-em),rgb(60_228_154/0.55))] [--grow-duration:1.4s] [--grow-ease:var(--ease-out-expo)] group-data-inview/warranty:animate-grow-x" />
          <span className="absolute inset-y-0 left-1/2 right-0 bg-[repeating-linear-gradient(90deg,var(--color-line-strong)_0_5px,transparent_5px_10px)]" />
          <span className="absolute left-0 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-em bg-bg shadow-[0_0_12px_rgb(60_228_154/0.7)]" />
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-em bg-em shadow-[0_0_12px_rgb(60_228_154/0.7)]" />
          <span className="absolute right-0 top-1/2 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border border-line-strong bg-bg" />
        </div>
        <ol className="label-mono relative mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
          <li className="text-ink">{start}</li>
          <li className="text-em">{end}</li>
          <li className="text-right text-faint">{after}</li>
        </ol>
      </div>
    </div>
  );
}

/** What every handover includes: docs, training, code ownership. */
function HandoverList({
  handover,
  compact = false,
  className,
}: {
  handover: Aftercare["handover"];
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("card flex flex-col overflow-hidden", className)}>
      <h3 className={cn("label-mono border-b border-line", compact ? "px-6 py-4 sm:px-7" : "px-7 py-5 sm:px-9")}>
        {handover.label}
      </h3>
      <ul className="flex flex-1 flex-col divide-y divide-line">
        {handover.items.map((item, i) => (
          <li
            key={item.title}
            data-reveal=""
            style={delay(80 + i * 90)}
            className={cn(
              "group/item flex flex-1 items-start gap-5 transition-colors duration-500 hover:bg-white/[0.02]",
              compact ? "px-6 py-5 sm:px-7" : "px-7 py-6 sm:px-9 sm:py-7",
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-em/30 bg-em/[0.07] text-em transition-[box-shadow,border-color] duration-500 group-hover/item:border-em/60 group-hover/item:shadow-[0_0_20px_-4px_rgb(60_228_154/0.55)]">
              <Icon name={item.icon} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className={cn("block font-display font-medium tracking-[-0.02em] text-ink", compact ? "text-lg" : "text-xl")}>
                {item.title}
              </span>
              <span className={cn("mt-1.5 block text-dim", compact ? "text-sm" : "text-[0.95rem]")}>{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Quote-only care plans; the featured one is lifted with an emerald edge. */
function CarePlans({
  plans,
  compact = false,
  className,
}: {
  plans: Aftercare["plans"];
  compact?: boolean;
  className?: string;
}) {
  return (
    // Compact (service page main column): cards stack on phones, become
    // two-column rows while the column is narrow, and sit side by side
    // only once there's room (xl).
    <ul className={cn("grid gap-4", compact ? "xl:grid-cols-3" : "lg:grid-cols-3", className)}>
      {plans.items.map((plan, i) => {
        const featured = plan.featured === true;

        const head = (
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-xl border",
                featured ? "border-em/50 bg-em/[0.12] text-hot" : "border-line-strong bg-white/[0.03] text-em",
              )}
            >
              <Icon name={plan.icon} className="size-5" />
            </span>
            {featured && (
              <span className="label-mono inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-em/40 bg-em/10 px-3 py-1.5 text-em">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-em animate-pulse-dot" />
                {plans.featuredLabel}
              </span>
            )}
          </div>
        );
        const response = (
          <div className="rounded-xl border border-line bg-white/[0.02] px-4 py-3.5">
            <p className="label-mono">{plans.responseLabel}</p>
            <p className="mt-1.5 flex items-start gap-2 font-medium leading-snug text-ink">
              <Timer aria-hidden="true" strokeWidth={1.8} className="mt-0.5 size-4 shrink-0 text-em" />
              {plan.response}
            </p>
          </div>
        );
        const bestFor = (
          <dl>
            <dt className="label-mono">{plans.bestForLabel}</dt>
            <dd className="mt-1.5 text-sm text-dim">{plan.bestFor}</dd>
          </dl>
        );
        const cta = (
          <ButtonLink
            href={plan.cta.href}
            external={plan.cta.external}
            variant={featured ? "primary" : "secondary"}
            aria-label={`${plan.cta.label}: ${plan.name}`}
            className="w-full justify-between"
          >
            {plan.cta.label}
          </ButtonLink>
        );

        return (
          <li
            key={plan.name}
            data-reveal=""
            style={delay(i * 90)}
            className={cn(
              "card card-hover relative flex flex-col",
              compact ? "p-6" : "p-7 sm:p-8",
              featured && "edge-glow bg-[linear-gradient(165deg,rgb(60_228_154/0.09),transparent_55%),var(--color-surface)]",
            )}
          >
            {compact ? (
              <div className="flex flex-1 flex-col gap-6 sm:max-xl:grid sm:max-xl:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:max-xl:gap-x-8">
                <div className="min-w-0">
                  {head}
                  <h4 className="text-h4 mt-6 text-ink">{plan.name}</h4>
                  <p className="mt-2 text-[0.95rem] text-dim">{plan.summary}</p>
                  <div className="mt-5 border-t border-line pt-4">{bestFor}</div>
                </div>
                <div className="mt-auto flex flex-col gap-4 sm:max-xl:mt-0 sm:max-xl:justify-between">
                  {response}
                  {cta}
                </div>
              </div>
            ) : (
              <>
                {head}
                <h4 className="text-h3 mt-7 text-ink">{plan.name}</h4>
                <p className="mt-2 text-dim">{plan.summary}</p>
                <div className="mt-6">{response}</div>
                <ul className="mb-8 mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[0.95rem] text-dim">
                      <Check aria-hidden="true" strokeWidth={2.2} className="mt-1 size-4 shrink-0 text-em" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {/* Pinned to the bottom so the CTAs line up across the row. */}
                <div className="mt-auto border-t border-line pt-5">{bestFor}</div>
                <div className="mt-6">{cta}</div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Home: the full after-launch section. */
export function AftercareSection({
  intro,
  offer,
  index,
}: {
  intro: SectionIntro;
  offer: Aftercare;
  index?: string;
}) {
  const days = offer.warranty.days;
  const lede = intro.lede ? interpolate(intro.lede, { days }) : undefined;

  return (
    <section id="aftercare" aria-labelledby="aftercare-heading" className="section-y relative">
      <div className="container-x">
        <SectionHeading intro={{ ...intro, lede }} index={index} id="aftercare-heading" />

        <div className="mt-14 grid gap-4 lg:mt-20 lg:grid-cols-12">
          <WarrantyCard warranty={offer.warranty} className="lg:col-span-5" />
          <HandoverList handover={offer.handover} className="lg:col-span-7" />
        </div>

        <div className="mt-16 lg:mt-24">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="max-w-2xl">
              <h3 className="eyebrow" data-reveal="fade">
                <span aria-hidden="true" className="h-px w-8 bg-em/50" />
                {offer.plans.label}
              </h3>
              {offer.plans.lede && (
                <p className="text-lede mt-5" data-reveal="" style={delay(80)}>
                  {interpolate(offer.plans.lede, { days })}
                </p>
              )}
            </div>
            {offer.plans.note && (
              <p className="max-w-sm text-sm text-muted lg:text-right" data-reveal="" style={delay(140)}>
                {interpolate(offer.plans.note, { days })}
              </p>
            )}
          </div>
          <CarePlans plans={offer.plans} className="mt-10" />
        </div>
      </div>
    </section>
  );
}

/** Service pages: a short after-launch block for the main column. */
export function AftercareBlock({ offer, id = "aftercare" }: { offer: Aftercare; id?: string }) {
  const days = offer.warranty.days;
  const headingId = `${id}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-28">
      <p className="eyebrow" data-reveal="fade">
        <span aria-hidden="true" className="h-px w-8 bg-em/50" />
        {offer.eyebrow}
      </p>
      <SplitHeading as="h2" id={headingId} text={offer.heading} className="text-h2 mt-6 text-ink" />
      {offer.lede && (
        <p className="text-lede mt-6 max-w-2xl" data-reveal="" style={delay(100)}>
          {interpolate(offer.lede, { days })}
        </p>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-12">
        <WarrantyCard warranty={offer.warranty} compact className="md:col-span-5" />
        <HandoverList handover={offer.handover} compact className="md:col-span-7" />
      </div>

      <h3 className="label-mono mt-12">{offer.plans.label}</h3>
      <CarePlans plans={offer.plans} compact className="mt-5" />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {offer.plans.note && <p className="text-sm text-muted">{interpolate(offer.plans.note, { days })}</p>}
        <ArrowLink href={offer.moreLink.href} external={offer.moreLink.external} className="shrink-0">
          {offer.moreLink.label}
        </ArrowLink>
      </div>
    </section>
  );
}
