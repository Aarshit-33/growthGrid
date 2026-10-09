import type { Audience, HomePage } from "@/lib/schemas";
import { AudienceTabs } from "./audience-tabs";

/**
 * Who we work with: one tab per stage of the journey. Like the process
 * section, the tabs pin and the scroll steps through the stages. The
 * section title lives inside the pinned block, so it shows once and stays
 * on screen while the block is fixed.
 */
export function AudiencesSection({
  intro,
  audiences,
  index,
}: {
  intro: HomePage["audiences"];
  audiences: Audience[];
  index?: string;
}) {
  if (audiences.length === 0) return null;
  return (
    <section id="audiences" aria-labelledby="audiences-heading" className="relative">
      <div className="container-x">
        {/* No data-reveal here: a transformed ancestor would break the pin's fixed positioning. */}
        <AudienceTabs
          audiences={audiences}
          label={intro.eyebrow}
          eyebrow={index ? `[${index}] ${intro.eyebrow}` : intro.eyebrow}
          intro={intro}
          index={index}
          headingId="audiences-heading"
        />
      </div>
    </section>
  );
}
