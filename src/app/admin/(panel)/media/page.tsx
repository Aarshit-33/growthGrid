import type { Metadata } from "next";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { NoAccess } from "@/components/admin/no-access";
import { requireSession } from "@/lib/admin/auth";
import { listMedia } from "@/lib/admin/media";
import { can } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";

export const metadata: Metadata = { title: "Media library" };

/**
 * Media library: every image in /public and where the content uses it.
 * Anyone who edits content can upload; deleting (unused images under
 * public/images only) needs the delete permission, and the server checks again.
 */
export default async function MediaPage() {
  const { config, user } = await requireSession();
  if (!can(user.role, "content")) {
    return <NoAccess base={config.base} role={user.role} permission="content" screen="Media library" />;
  }
  const items = await listMedia(await readSnapshot());
  return <MediaLibrary base={config.base} initial={items} canDelete={can(user.role, "delete")} />;
}
