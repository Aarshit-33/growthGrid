import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, TechnologyCategory } from "@/lib/schemas";
import { TechnologyExplorer } from "./technology-explorer";

/** Technology: the stack as an explorable orbit system. */
export function TechnologySection({
  intro,
  categories,
  index,
}: {
  intro: HomePage["technology"];
  categories: TechnologyCategory[];
  index?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <section id="technology" aria-labelledby="technology-heading" className="section-y relative">
      <div className="container-x">
        <SectionHeading intro={intro} index={index} id="technology-heading" />
        <TechnologyExplorer categories={categories} hint={intro.hint} />
      </div>
    </section>
  );
}
