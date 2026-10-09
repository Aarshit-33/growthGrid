import { StatsGrid } from "@/components/sections/stats-grid";
import { Marquee } from "@/components/ui/marquee";
import type { HomePage, Stat } from "@/lib/schemas";

/**
 * Proof band: the industries we build for (an endless, pausable marquee)
 * and the headline numbers, counting up as they scroll into view.
 */
export function ProofSection({ proof, stats }: { proof: HomePage["proof"]; stats: Stat[] }) {
  return (
    <section id="proof" aria-labelledby="proof-heading" className="relative bg-bg">
      <div className="border-y border-line">
        <div className="container-x flex flex-col gap-6 py-8 lg:flex-row lg:items-center lg:gap-12 lg:py-10">
          <h2 id="proof-heading" className="label-mono shrink-0 lg:w-48">
            {proof.eyebrow}
          </h2>
          <Marquee
            duration={38}
            className="min-w-0 flex-1"
            items={proof.industries.map((industry) => (
              <span
                key={industry}
                className="font-display text-[clamp(1.35rem,1.1rem+1vw,2rem)] font-medium tracking-[-0.03em] text-dim"
              >
                {industry}
              </span>
            ))}
            separator={<span className="mx-7 text-[0.7em] text-em/70 lg:mx-10">✦</span>}
          />
        </div>
      </div>
      {stats.length > 0 && (
        <div className="container-x py-14 lg:py-20">
          <StatsGrid stats={stats} />
        </div>
      )}
    </section>
  );
}
