import type { HomePage, Principle } from "@/lib/schemas";
import { PrinciplesExplorer } from "./principles-explorer";

/**
 * Why GrowthGrid: four principles, each with its own 3D instrument. Like the
 * process section, the explorer pins and the scroll steps through them. The
 * section title lives inside the pinned block, so it shows once and stays
 * on screen while the block is fixed.
 */
export function PrinciplesSection({
  intro,
  principles,
  index,
}: {
  intro: HomePage["principles"];
  principles: Principle[];
  index?: string;
}) {
  if (principles.length === 0) return null;
  return (
    <section id="principles" aria-labelledby="principles-heading" className="relative">
      <div className="container-x">
        <PrinciplesExplorer principles={principles} intro={intro} index={index} headingId="principles-heading" />
      </div>
    </section>
  );
}
