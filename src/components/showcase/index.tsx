import type { Showcase as ShowcaseData, WorkPage } from "@/lib/schemas";
import { DashboardShowcase } from "./dashboard";
import { FlowShowcase } from "./flow";
import { TriageShowcase } from "./triage";

/** Control labels the widgets need, sourced from `content/pages/work.json` → `detail`. */
export type ShowcaseLabels = Pick<WorkPage["detail"], "confidence" | "pause" | "replay">;

/** Renders the interactive "live snapshot" for a case study's showcase variant. */
export function Showcase({ showcase, labels }: { showcase: ShowcaseData; labels: ShowcaseLabels }) {
  switch (showcase.type) {
    case "flow":
      return <FlowShowcase data={showcase} pauseLabel={labels.pause} />;
    case "dashboard":
      return <DashboardShowcase data={showcase} />;
    case "triage":
      return (
        <TriageShowcase
          data={showcase}
          confidenceLabel={labels.confidence}
          replayLabel={labels.replay}
        />
      );
  }
}
