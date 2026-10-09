import type { CSSProperties } from "react";
import { HeroPoster } from "@/components/home/hero-poster";
import { SceneSlot } from "@/components/three/slot";
import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { SplitHeading } from "@/components/ui/split-heading";
import { Availability } from "@/components/ui/tag";
import type { HomePage, Settings } from "@/lib/schemas";
import { SPEAKABLE } from "@/lib/seo/speakable";

/** Static stand-in for the Growth Field: a receding blueprint floor with a
 *  soft emerald horizon. Shown before WebGL is ready and wherever it isn't;
 *  once WebGL is ruled out (no GPU, data saver, a failed stage) the field
 *  itself is painted over it as a still (HeroPoster). */
function HeroFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="blueprint absolute inset-x-[-40%] bottom-[-8%] h-[68%] origin-bottom opacity-80 [transform:perspective(520px)_rotateX(64deg)] fade-y"
        style={{ "--grid-size": "3.25rem" } as CSSProperties}
      />
      <div className="absolute left-1/2 top-[58%] size-[70vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(60_228_154/0.16),transparent_58%)]" />
      <HeroPoster />
    </div>
  );
}

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

/**
 * Hero: the one h1 on the page over the living Growth Field. Everything
 * above the fold animates with pure CSS (no JS on the LCP path); the 3D
 * field arrives later, on idle, and fades in over its fallback.
 */
export function HeroSection({
  hero,
  availability,
}: {
  hero: HomePage["hero"];
  availability: Settings["availability"];
}) {
  return (
    <section
      id="hero"
      aria-labelledby={SPEAKABLE.heroTitle}
      // Desktop: top/bottom breathing room scales with the viewport height, so
      // the whole hero fits one screen on short laptop displays as well.
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden lg:[--hero-foot:clamp(1.25rem,3svh,2rem)] lg:[--hero-top:clamp(1rem,5svh_-_0.5rem,3.5rem)]"
    >
      <div className="absolute inset-0 -z-10">
        <SceneSlot scene={{ id: "hero" }} fallback={<HeroFallback />} />
        {/* Legibility veils: top-down on mobile, left-to-right on desktop. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(4_7_10/0.86)_0%,rgb(4_7_10/0.66)_42%,rgb(4_7_10/0.5)_70%,rgb(4_7_10/0.95)_100%)] lg:bg-[linear-gradient(90deg,rgb(4_7_10/0.92)_0%,rgb(4_7_10/0.76)_38%,rgb(4_7_10/0.4)_62%,rgb(4_7_10/0.12)_85%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-48 bg-[linear-gradient(to_bottom,transparent,var(--color-bg))] lg:block"
        />
      </div>

      {/* Frame corners: the grid's registration marks. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
        <span className="crosshair left-[var(--gutter)] top-[calc(var(--header-h)+var(--hero-top)/2_-_5.5px)]" />
        <span className="crosshair right-[var(--gutter)] top-[calc(var(--header-h)+var(--hero-top)/2_-_5.5px)]" />
        <span className="crosshair bottom-[var(--hero-foot)] left-[var(--gutter)]" />
        <span className="crosshair bottom-[var(--hero-foot)] right-[var(--gutter)]" />
      </div>

      {/* @container: the headline's type and measure are sized from this column's width. */}
      <div className="@container container-x scene-text relative flex flex-1 flex-col justify-center pb-14 pt-[calc(var(--header-h)+3.5rem)] lg:pb-[clamp(1.5rem,5svh,5rem)] lg:pt-[calc(var(--header-h)+var(--hero-top))]">
        <div className="load-fade" style={delay(80)}>
          <Availability availability={availability} />
        </div>
        <p className="eyebrow load-fade mt-8 lg:mt-[clamp(1rem,3svh,2rem)]" style={delay(160)}>
          <span aria-hidden="true" className="h-px w-8 bg-em/50" />
          {hero.eyebrow}
        </p>
        {/* Headline and description share one measure: this block shrink-wraps
            the headline's box and the description fills it (contain-inline-size
            stops its own text from widening the block). From sm up the description
            takes 93% of it, since the headline's ragged lines stop short of the box.
            min-w keeps the description readable if the headline is ever cut to a few
            words; max-w-full stops one very long word pushing both past the column. */}
        <div className="w-fit max-w-full min-w-[min(100%,24rem)]">
          {/* Phones: the type follows the column (12cqi, down to 2rem), so long
              lines fit without spilling into the gutter, even at 320px.
              Desktop: --display-fit also caps the type by height; at 26svh − 7.25rem
              its three lines plus the rest of the stack fit one screen.
              Wide screens (xl): the type follows the column's width (6cqi), so
              the headline sets in two long lines (~80% of the column) instead of
              three narrow ones; the 85cqi box leaves room for font differences
              (cqi, not %, because the block above sizes itself from this box). */}
          <SplitHeading
            as="h1"
            id={SPEAKABLE.heroTitle}
            mode="load"
            delay={220}
            text={hero.headline}
            className="text-display mt-6 max-w-[13.5ch] text-ink [--display-fit:12cqi] [--display-min:2rem] lg:mt-[clamp(0.75rem,2.4svh,1.5rem)] lg:[--display-fit:calc(26svh_-_7.25rem)] xl:max-w-[85cqi] xl:[--display-fit:min(26svh_-_7.25rem,6cqi)]"
          />
          {/* The h1 and this lede are what voice assistants read out (speakable). */}
          <p
            id={SPEAKABLE.heroSummary}
            className="text-lede load-fade mt-8 contain-inline-size sm:max-w-[93%] lg:mt-[clamp(1rem,3svh,2rem)]"
            style={delay(620)}
          >
            {hero.lede}
          </p>
        </div>
        <div
          className="load-fade mt-10 flex flex-wrap items-center gap-3 lg:mt-[clamp(1.25rem,4svh,2.5rem)]"
          style={delay(760)}
        >
          <Magnetic>
            <ButtonLink href={hero.primaryCta.href} size="lg" external={hero.primaryCta.external}>
              {hero.primaryCta.label}
            </ButtonLink>
          </Magnetic>
          <ButtonLink
            href={hero.secondaryCta.href}
            variant="secondary"
            size="lg"
            external={hero.secondaryCta.external}
          >
            {hero.secondaryCta.label}
          </ButtonLink>
        </div>
      </div>

      <div className="container-x relative flex items-end justify-between pb-8 lg:pb-[var(--hero-foot)]">
        <a
          href="#proof"
          className="load-fade group inline-flex items-center gap-3 label-mono transition-colors hover:text-ink"
          style={delay(1000)}
        >
          <span aria-hidden="true" className="relative h-10 w-px overflow-hidden bg-line-strong">
            <span className="absolute inset-x-0 top-0 h-1/2 animate-scan bg-em" />
          </span>
          {hero.scrollCue}
        </a>
      </div>
    </section>
  );
}
