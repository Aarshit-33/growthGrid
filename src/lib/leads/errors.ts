import type { PageContent } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   Contact-form validation copy. The shared `leadInputSchema` keeps
   developer-facing English messages; visitors never see those.
   Every visible message is looked up here from contact.json, keyed
   by field + Zod issue code, so the client form and the API route
   always say exactly the same thing. Safe to import on the client.
   ───────────────────────────────────────────────────────────── */

export type LeadErrorMessages = PageContent<"contact">["form"]["errors"];

export function leadErrorMessage(field: string, code: string | undefined, messages: LeadErrorMessages): string {
  switch (field) {
    case "name":
      return code === "too_big" ? messages.nameMax : messages.nameMin;
    case "email":
      return messages.email;
    case "company":
      return messages.companyMax;
    case "message":
      return code === "too_big" ? messages.messageMax : messages.messageMin;
    default:
      return messages.invalid;
  }
}

/** Flatten Zod issues to `{ field: message }` (first issue per field wins). */
export function leadFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
  messages: LeadErrorMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || field in errors) continue;
    errors[field] = leadErrorMessage(field, issue.code, messages);
  }
  return errors;
}
