import type { Metadata } from "next";
import { HomeLayoutEditor } from "@/components/admin/home-layout-editor";
import { NoAccess } from "@/components/admin/no-access";
import { requireSession } from "@/lib/admin/auth";
import { homeSectionItems } from "@/lib/admin/lists";
import { homeSectionStatus } from "@/lib/admin/overview";
import { can } from "@/lib/admin/roles";
import { docLocation, layoutVersion, readSnapshot } from "@/lib/admin/store";
import { NUMBERED_HOME_SECTIONS, PINNED_LAST_SECTION, resolveHomeSections } from "@/lib/content/home-sections";
import type { HomeSectionConfig } from "@/lib/schemas";

export const metadata: Metadata = { title: "Homepage layout" };

interface HomeDoc {
  sections?: HomeSectionConfig[];
  [key: string]: unknown;
}

type Copy = { headline?: unknown; heading?: unknown } | undefined;

/** Copy with *highlights* and line breaks, as one plain line. */
const plain = (text: unknown) => (typeof text === "string" ? text.replace(/\*/g, "").replace(/\s*\n\s*/g, " ").trim() || undefined : undefined);

export default async function HomepageLayoutPage() {
  const { config, user } = await requireSession();
  if (!can(user.role, "layout")) return <NoAccess base={config.base} role={user.role} permission="layout" screen="Homepage layout" />;
  const snapshot = await readSnapshot();
  const home = (snapshot.pages.home ?? {}) as HomeDoc;
  const copy = (key: string) => home[key] as Copy;

  return (
    <HomeLayoutEditor
      base={config.base}
      sections={resolveHomeSections(home.sections)}
      defaults={resolveHomeSections(undefined)}
      numbered={[...NUMBERED_HOME_SECTIONS]}
      pinnedLast={PINNED_LAST_SECTION}
      status={homeSectionStatus(snapshot)}
      items={homeSectionItems(snapshot)}
      headlines={{ hero: plain(copy("hero")?.headline), last: plain(copy(PINNED_LAST_SECTION)?.heading) }}
      version={layoutVersion(snapshot.pages.home)}
      file={docLocation({ kind: "page", key: "home" })}
    />
  );
}
