import { after, NextResponse, type NextRequest } from "next/server";
import { getPage } from "@/lib/data";
import { emailLead } from "@/lib/leads/email";
import { leadFieldErrors } from "@/lib/leads/errors";
import { rateLimit } from "@/lib/leads/rate-limit";
import { saveLead, type NewLead } from "@/lib/leads/store";
import { leadInputSchema } from "@/lib/schemas/lead";

/* ─────────────────────────────────────────────────────────────
   POST /api/contact
   JSON (the enhanced form) → JSON responses:
     200 { ok: true }
     400 { ok: false, errors: { field: message } }
     413 / 415 / 400 { ok: false, error }
     429 { ok: false, error: "rate_limited" } + Retry-After
     500 { ok: false, error: "server_error" }
   Native form posts (no JavaScript) → 303 back to /contact with a
   #fragment the page reveals via :target.
   Each enquiry is also emailed to LEAD_EMAIL_TO (lib/leads/email.ts)
   once the response is sent, even when saving it failed.
   PII is never logged.
   ───────────────────────────────────────────────────────────── */

const MAX_BODY_BYTES = 32 * 1024;
const SENT_URL = "/contact#enquiry-sent";
const FAILED_URL = "/contact#enquiry-failed";

type Body = Record<string, unknown>;

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "anonymous";
}

function isFormPost(request: NextRequest): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
}

async function readBody(request: NextRequest, form: boolean): Promise<Body | null> {
  try {
    if (form) {
      const data = await request.formData();
      const text = (key: string) => {
        const value = data.get(key);
        return typeof value === "string" ? value : "";
      };
      return {
        name: text("name"),
        email: text("email"),
        company: text("company"),
        services: data.getAll("services").filter((v): v is string => typeof v === "string"),
        timeline: text("timeline"),
        message: text("message"),
        website: text("website"),
      };
    }
    const json: unknown = await request.json();
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Body) : null;
  } catch {
    return null;
  }
}

/** Where the enquiry came from (path + query only, never the full URL). */
function sourceOf(request: NextRequest): string | undefined {
  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`.slice(0, 300);
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const form = isFormPost(request);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const type = request.headers.get("content-type") ?? "";
  if (!form && !type.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return form ? redirectTo(FAILED_URL) : NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const limit = rateLimit(clientKey(request));
  if (!limit.ok) {
    if (form) return redirectTo(FAILED_URL);
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await readBody(request, form);
  if (!body) {
    return form ? redirectTo(FAILED_URL) : NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  // Honeypot: bots that fill the hidden field get a convincing success and
  // nothing is stored. Checked before validation so the field is never named.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return form ? redirectTo(SENT_URL) : NextResponse.json({ ok: true });
  }

  const parsed = leadInputSchema.safeParse({
    company: "",
    services: [],
    timeline: "",
    ...body,
    website: "",
  });

  if (!parsed.success) {
    if (form) return redirectTo(FAILED_URL);
    const page = await getPage("contact");
    return NextResponse.json(
      { ok: false, errors: leadFieldErrors(parsed.error.issues, page.form.errors) },
      { status: 400 },
    );
  }

  const { name, email, company, services, timeline, message } = parsed.data;
  const lead: NewLead = {
    name,
    email,
    company,
    services,
    timeline,
    message,
    source: sourceOf(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 400) || undefined,
  };

  try {
    await saveLead(lead);
  } catch (error) {
    console.error("[api/contact] could not store lead:", error instanceof Error ? error.name : "UnknownError");
    // The email is then the only copy of the enquiry, so it still goes out (marked as not saved).
    after(() => emailLead(lead, { saved: false }));
    return form ? redirectTo(FAILED_URL) : NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  // After the response: the visitor never waits for the mail server.
  after(() => emailLead(lead));
  return form ? redirectTo(SENT_URL) : NextResponse.json({ ok: true });
}
