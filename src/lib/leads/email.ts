import "server-only";
import type { SendMailOptions } from "nodemailer";
import { z } from "zod";
import { adminHref, getAdminConfig } from "@/lib/admin/config";
import { getSettings } from "@/lib/data";
import type { NewLead } from "@/lib/leads/store";

/* ─────────────────────────────────────────────────────────────
   Email alert for every new enquiry, sent over SMTP (nodemailer),
   so any mailbox can send it: Gmail with an App Password today,
   hello@growthgrid.studio on Zoho or Google Workspace later, or a
   sending service such as Resend. Only the env changes:

   LEAD_EMAIL_TO    Who gets the alerts (commas for more than one).
                    Unset: no emails.
   SMTP_HOST        e.g. smtp.gmail.com
   SMTP_PORT        465 (SSL, the default) or 587 (STARTTLS).
   SMTP_USER        The mailbox it signs in as.
   SMTP_PASS        Its password; for Gmail, an App Password.
   LEAD_EMAIL_FROM  Optional sender; defaults to SMTP_USER.

   The contact route calls this in after(), so the visitor never
   waits for the mail server, and it never throws. Reply-To is the
   visitor, so "Reply" in any mail app answers them. Log lines
   never include the enquiry. Setup steps: .env.example.
   ───────────────────────────────────────────────────────────── */

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
/** nodemailer's codes for network problems: worth one more try. */
const NETWORK_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"]);

export interface LeadMailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** LEAD_EMAIL_FROM as written ("Name <address>" or an address), or SMTP_USER. */
  from: string;
  to: string[];
}

const emailAddress = z.email();

/**
 * The env as a mail setup. `config` is null when alerts are off
 * (LEAD_EMAIL_TO unset) or the setup has a mistake, explained in `problem`.
 */
export function leadMailConfig(env: NodeJS.ProcessEnv = process.env): { config: LeadMailConfig | null; problem?: string } {
  const to = (env.LEAD_EMAIL_TO ?? "").split(/[\s,;]+/).filter(Boolean);
  if (to.length === 0) return { config: null };
  if (to.some((address) => !emailAddress.safeParse(address).success)) {
    return { config: null, problem: "LEAD_EMAIL_TO has an address that isn't valid" };
  }

  const host = env.SMTP_HOST?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop") but wants them without the spaces.
  const gmail = /(^|\.)(gmail|googlemail)\.com$/i.test(host);
  const pass = gmail ? (env.SMTP_PASS ?? "").replace(/\s+/g, "") : (env.SMTP_PASS ?? "");
  const missing = [!host && "SMTP_HOST", !user && "SMTP_USER", !pass && "SMTP_PASS"].filter(Boolean);
  if (missing.length > 0) return { config: null, problem: `set ${missing.join(", ")}` };

  const port = Number(env.SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { config: null, problem: "SMTP_PORT must be a port number, such as 465 or 587" };
  }

  const from = env.LEAD_EMAIL_FROM?.trim() || user;
  if (!from.includes("@")) {
    return { config: null, problem: "set LEAD_EMAIL_FROM, because SMTP_USER isn't an email address" };
  }
  return { config: { host, port, user, pass, from, to } };
}

/* ── The message ──────────────────────────────────────────── */

export interface LeadMailContext {
  /** e.g. "growthGrid": the header and the sender's name. */
  siteName: string;
  /** e.g. "growthgrid.studio", for the footer. */
  siteHost?: string;
  /** Studio › Leads, when the Studio is on. */
  studioUrl?: string;
  /** False: saving failed, so this email is the only copy of the enquiry. */
  saved: boolean;
}

export interface LeadMail {
  subject: string;
  text: string;
  html: string;
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const UNSAVED =
  "This enquiry couldn't be saved to Studio › Leads and the visitor was shown an error, so this email is the only copy. Check MONGODB_URI and the server logs.";

export function buildLeadMail(lead: NewLead, context: LeadMailContext): LeadMail {
  const name = oneLine(lead.name);
  const company = oneLine(lead.company);
  const firstName = name.split(" ")[0] || name;
  const subject = `${context.saved ? "" : "[Not saved] "}New enquiry from ${name}${company ? ` (${company})` : ""}`.slice(0, 160);
  const footer = `Sent by the contact form${context.siteHost ? ` on ${context.siteHost}` : ""}. Reply to this email to answer ${firstName} directly.`;

  const details: [label: string, value: string][] = [
    ["Email", lead.email],
    ["Services", lead.services.join(", ")],
    ["Timeline", lead.timeline],
    ["Page", lead.source ?? ""],
  ];
  const filled = details.filter(([, value]) => value.trim() !== "");

  const text = [
    ...(context.saved ? [] : [`NOT SAVED: ${UNSAVED}`, ""]),
    `New enquiry on ${context.siteName}`,
    "",
    `Name: ${name}`,
    ...(company ? [`Company: ${company}`] : []),
    ...filled.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    lead.message,
    "",
    "--",
    footer,
    ...(context.studioUrl ? [`Studio › Leads: ${context.studioUrl}`] : []),
  ].join("\n");

  const e = escapeHtml;
  const label = "font-size:11px;line-height:1.4;letter-spacing:1.2px;text-transform:uppercase;color:#6b7b88;";
  const rows = filled
    .map(([key, value]) => {
      const shown = key === "Email" ? `<a href="mailto:${e(value)}" style="color:#0a7d55;text-decoration:none;">${e(value)}</a>` : e(value);
      return `<tr><td style="${label}padding:9px 16px 7px 0;width:90px;white-space:nowrap;vertical-align:top;">${key}</td><td style="padding:7px 0;font-size:15px;line-height:1.5;color:#0b1419;vertical-align:top;">${shown}</td></tr>`;
    })
    .join("");
  const button = (href: string, text: string, primary: boolean) =>
    `<a href="${e(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${
      primary ? "background:#3ce49a;color:#04070a;" : "background:#ffffff;color:#0b1419;border:1px solid #d5dde3;"
    }">${e(text)}</a>`;
  const replyHref = `mailto:${lead.email}?subject=${encodeURIComponent(`Re: your enquiry to ${context.siteName}`)}`;
  const preheader = [name, lead.services.join(", "), lead.timeline, oneLine(lead.message).slice(0, 90)].filter(Boolean).join(" · ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f5;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe5ea;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#04070a;padding:18px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:18px;font-weight:700;letter-spacing:-0.4px;color:#f0f4f7;">${e(context.siteName)}</td>
<td align="right"><span style="display:inline-block;padding:5px 12px;border-radius:999px;border:1px solid #1f6b4c;color:#3ce49a;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">New enquiry</span></td>
</tr></table>
</td></tr>
${
  context.saved
    ? ""
    : `<tr><td style="padding:14px 28px;background:#fff4e5;border-bottom:1px solid #ffd8a8;font-size:14px;line-height:1.5;color:#7a4b00;"><strong>Not saved.</strong> ${e(UNSAVED)}</td></tr>`
}
<tr><td style="padding:28px 28px 4px;">
<h1 style="margin:0;font-size:22px;line-height:1.3;color:#0b1419;">${e(name)}</h1>
${company ? `<p style="margin:4px 0 0;font-size:15px;color:#5b6b78;">${e(company)}</p>` : ""}
</td></tr>
<tr><td style="padding:14px 28px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
<tr><td style="padding:14px 28px 4px;">
<div style="${label}">Message</div>
<div style="margin-top:8px;padding:14px 16px;background:#f5f8fa;border-left:3px solid #3ce49a;border-radius:8px;font-size:15px;line-height:1.6;color:#0b1419;">${e(lead.message).replace(/\r?\n/g, "<br>")}</div>
</td></tr>
<tr><td style="padding:20px 28px 12px;">${button(replyHref, `Reply to ${firstName}`, true)}${context.studioUrl ? button(context.studioUrl, "Open Studio › Leads", false) : ""}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #edf1f4;font-size:12px;line-height:1.5;color:#8a9aaa;">${e(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

/* ── Sending ──────────────────────────────────────────────── */

interface MailError {
  name?: string;
  code?: string;
  responseCode?: number;
}

const mailError = (error: unknown): MailError => (typeof error === "object" && error !== null ? (error as MailError) : {});

/** A dropped connection or a "try again later" (4xx) reply. */
function isTemporary(error: unknown): boolean {
  const { code, responseCode } = mailError(error);
  return (code !== undefined && NETWORK_CODES.has(code)) || (responseCode !== undefined && responseCode >= 400 && responseCode < 500);
}

/** Codes and a hint for the log; never the server's own text, which can echo addresses. */
function describe(error: unknown, config: LeadMailConfig): string {
  const { name, code, responseCode } = mailError(error);
  const detail = [code, responseCode].filter(Boolean).join(" ") || name || "unknown error";
  if (code === "EAUTH" || responseCode === 534 || responseCode === 535) {
    return `${config.host} rejected SMTP_USER or SMTP_PASS (${detail}). Gmail needs an App Password, not your normal password.`;
  }
  if (code !== undefined && NETWORK_CODES.has(code)) return `couldn't reach ${config.host}:${config.port} (${detail}).`;
  return `${detail}.`;
}

/**
 * Emails the enquiry to LEAD_EMAIL_TO. Never throws: problems are logged,
 * without the enquiry. `saved: false` marks it as the only copy.
 */
export async function emailLead(lead: NewLead, { saved = true }: { saved?: boolean } = {}): Promise<void> {
  const { config, problem } = leadMailConfig();
  if (!config) {
    if (problem) console.warn(`[lead-email] Not sent: ${problem}. See .env.example.`);
    return;
  }

  try {
    const settings = await getSettings().catch(() => null);
    const siteName = settings?.name ?? "growthGrid";
    const siteUrl = settings?.url;
    const admin = getAdminConfig();
    const mail = buildLeadMail(lead, {
      siteName,
      siteHost: siteUrl ? new URL(siteUrl).host : undefined,
      studioUrl: siteUrl && admin.enabled ? new URL(adminHref(admin.base, "/leads"), siteUrl).href : undefined,
      saved,
    });

    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    const message: SendMailOptions = {
      from: config.from.includes("<") ? config.from : { name: `${siteName} website`, address: config.from },
      to: config.to,
      replyTo: { name: oneLine(lead.name), address: lead.email },
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    };

    try {
      await transport.sendMail(message);
    } catch (error) {
      if (!isTemporary(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      await transport.sendMail(message);
    } finally {
      transport.close();
    }
    console.info(`[lead-email] Enquiry emailed to ${config.to.length === 1 ? "1 address" : `${config.to.length} addresses`}.`);
  } catch (error) {
    console.warn(`[lead-email] Not sent: ${describe(error, config)}`);
  }
}
