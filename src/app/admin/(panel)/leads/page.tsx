import type { Metadata } from "next";
import { LeadsInbox } from "@/components/admin/leads-inbox";
import { NoAccess } from "@/components/admin/no-access";
import { requireSession } from "@/lib/admin/auth";
import { listLeads } from "@/lib/admin/leads";
import { can } from "@/lib/admin/roles";
import { isDatabaseConfigured } from "@/lib/db/uri";
import { readSnapshot } from "@/lib/admin/store";
import type { LeadRow } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Leads" };

type Props = { searchParams: Promise<{ open?: string | string[] }> };

/**
 * Leads: every contact-form enquiry, from the same store the form writes to
 * (MongoDB when MONGODB_URI is set, else .data/leads.ndjson). They hold
 * personal data, so the screen needs the leads permission, and the server
 * actions check it again. `?open=<id>` opens one enquiry (the Overview links).
 */
export default async function LeadsPage({ searchParams }: Props) {
  const { config, user } = await requireSession();
  if (!can(user.role, "leads")) {
    return <NoAccess base={config.base} role={user.role} permission="leads" screen="Leads" />;
  }
  const store = isDatabaseConfigured() ? "mongo" : "file";
  const { open } = await searchParams;

  let initial: LeadRow[] = [];
  let error: string | null = null;
  const [leads, snapshot] = await Promise.all([listLeads().catch((reason: unknown) => (reason instanceof Error ? reason : new Error(String(reason)))), readSnapshot()]);
  if (leads instanceof Error) {
    console.error("[admin] Couldn't read the enquiries:", leads);
    error =
      store === "mongo"
        ? "Couldn't reach MongoDB to read the enquiries. Check MONGODB_URI and that the database is up, then refresh."
        : "Couldn't read .data/leads.ndjson on this server. Check the file is readable, then refresh.";
  } else {
    initial = leads;
  }

  return (
    <LeadsInbox
      initial={initial}
      error={error}
      store={store}
      siteName={(snapshot.settings as { name?: string } | undefined)?.name ?? "the studio"}
      initialOpen={typeof open === "string" ? open : null}
    />
  );
}
