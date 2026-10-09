import type { Metadata } from "next";
import { DocEditor } from "@/components/admin/doc-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { NoAccess } from "@/components/admin/no-access";
import { requireSession } from "@/lib/admin/auth";
import { settingsForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { can } from "@/lib/admin/roles";
import { fileLabel, readSnapshot, versionOf } from "@/lib/admin/store";

export const metadata: Metadata = { title: "Site settings" };

export default async function SettingsPage() {
  const { config, user } = await requireSession();
  if (!can(user.role, "settings")) return <NoAccess base={config.base} role={user.role} permission="settings" screen="Site settings" />;
  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory({ kind: "settings" }, config.base)]);

  return (
    <DocEditor
      base={config.base}
      target={{ kind: "settings" }}
      title="Site settings"
      eyebrow="Site"
      file={`content/${fileLabel({ kind: "settings" })}`}
      form={settingsForm(snapshot)}
      initial={snapshot.settings as Raw}
      version={versionOf(snapshot.settings)}
      publicHref="/"
      history={history}
      refreshOnSave
    />
  );
}
