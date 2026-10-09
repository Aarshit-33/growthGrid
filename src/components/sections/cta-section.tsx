import { BrandCase } from "@/components/ui/brand-case";
import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { SplitHeading } from "@/components/ui/split-heading";
import { Availability } from "@/components/ui/tag";
import { getSettings } from "@/lib/data";
import type { CtaBlock } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Closing call-to-action panel used at the bottom of every page. */
export async function CtaSection({ cta, className }: { cta: CtaBlock; className?: string }) {
  const settings = await getSettings();
  return (
    <section aria-labelledby="cta-heading" className={cn("section-y relative", className)}>
      <div className="container-x">
        <div className="relative isolate overflow-hidden rounded-panel border border-line bg-surface px-6 py-20 text-center shadow-panel sm:px-10 md:py-28 lg:py-32">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="blueprint fade-radial absolute inset-0 opacity-80 [--grid-size:3.5rem]" />
            <div className="absolute -bottom-1/2 left-1/2 aspect-square w-[min(70rem,160vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(60_228_154/0.22),rgb(60_228_154/0.06)_40%,transparent_68%)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(60_228_154/0.7),transparent)]" />
            <span className="crosshair left-5 top-5" />
            <span className="crosshair right-5 top-5" />
            <span className="crosshair bottom-5 left-5" />
            <span className="crosshair bottom-5 right-5" />
          </div>

          <p className="eyebrow justify-center" data-reveal="fade">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            <BrandCase text={cta.eyebrow} />
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
          </p>
          <SplitHeading
            id="cta-heading"
            text={cta.heading}
            className="text-display mx-auto mt-7 max-w-5xl"
          />
          <p className="text-lede mx-auto mt-8 max-w-xl" data-reveal="">
            {cta.lede}
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row" data-reveal="">
            <Magnetic>
              <ButtonLink href={cta.primary.href} size="lg">
                {cta.primary.label}
              </ButtonLink>
            </Magnetic>
            {cta.secondary && (
              <ButtonLink href={cta.secondary.href} variant="secondary" size="lg">
                {cta.secondary.label}
              </ButtonLink>
            )}
          </div>
          <div className="mt-12 flex flex-col items-center gap-3" data-reveal="fade">
            <Availability availability={settings.availability} />
            <p className="text-sm text-muted">{settings.contact.responseTime}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
