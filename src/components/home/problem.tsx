import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, Problem } from "@/lib/schemas";
import { ProblemExplorer } from "./problem-explorer";

/** The problem: the walls growing businesses hit, and a system that heals as you scroll. */
export function ProblemSection({
  intro,
  problems,
  index,
}: {
  intro: HomePage["problem"];
  problems: Problem[];
  index?: string;
}) {
  if (problems.length === 0) return null;
  return (
    <section id="problem" aria-labelledby="problem-heading" className="section-y relative">
      {/* scene-text: the cards sit over the fracture backdrop. */}
      <div className="container-x scene-text">
        <ProblemExplorer problems={problems} monitor={intro.monitor}>
          <SectionHeading intro={intro} index={index} id="problem-heading" />
        </ProblemExplorer>
      </div>
    </section>
  );
}
