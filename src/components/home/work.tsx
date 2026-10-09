import type { HomePage, Project, WorkPage } from "@/lib/schemas";
import { WorkDeck } from "./work-deck";

/**
 * Selected work: featured case studies as pinned, full-screen slides. The
 * section title lives inside the pinned deck, so it shows once and stays on
 * screen while the deck is fixed.
 */
export function WorkSection({
  intro,
  projects,
  labels,
  index,
}: {
  intro: HomePage["work"];
  projects: Project[];
  labels: WorkPage["detail"];
  index?: string;
}) {
  if (projects.length === 0) return null;
  return (
    <section id="work" aria-labelledby="work-heading" className="relative">
      <WorkDeck
        projects={projects}
        labels={labels}
        cta={intro.cta}
        intro={intro}
        index={index}
        headingId="work-heading"
        prevLabel={intro.prevLabel}
        nextLabel={intro.nextLabel}
      />
    </section>
  );
}
