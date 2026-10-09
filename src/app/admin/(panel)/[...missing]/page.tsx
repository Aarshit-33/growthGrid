import { notFound } from "next/navigation";
import { requireSession } from "@/lib/admin/auth";

/** Any other studio address: the studio's own 404, inside the frame (not the public site's). */
export default async function MissingStudioPage() {
  await requireSession();
  notFound();
}
