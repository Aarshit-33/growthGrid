import { ProcessTimeline } from "@/components/sections/process-timeline";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, ProcessStep } from "@/lib/schemas";
import { ProcessRail } from "./process-rail";

/**
 * The Growth Grid process. On every screen size the section pins and the
 * scroll climbs the staircase stage by stage, then releases. Without
 * JavaScript the pin can't run, so the full vertical timeline shows
 * instead (it also keeps every stage in the HTML for crawlers).
 * The section title lives inside the pinned rail, so it shows once and
 * stays on screen while the rail is fixed.
 */
const NO_JS_CSS = "#process [data-process-rail]{display:none}#process [data-process-timeline]{display:block}";

export function ProcessSection({
  intro,
  steps,
  index,
}: {
  intro: HomePage["process"];
  steps: ProcessStep[];
  index?: string;
}) {
  if (steps.length === 0) return null;
  const eyebrow = index ? `[${index}] ${intro.eyebrow}` : intro.eyebrow;
  return (
    <section id="process" aria-labelledby="process-heading" className="relative">
      <noscript>
        <style>{NO_JS_CSS}</style>
      </noscript>
      {/* No-JS fallback only (hidden while the rail runs), so it carries its own title. */}
      <div className="container-x hidden py-[var(--section-y)]" data-process-timeline="">
        <SectionHeading intro={intro} index={index} />
        <div className="mt-14">
          <ProcessTimeline steps={steps} />
        </div>
      </div>
      <div className="container-x" data-process-rail="">
        <ProcessRail steps={steps} label={eyebrow} intro={intro} index={index} headingId="process-heading" />
      </div>
    </section>
  );
}
