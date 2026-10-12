import "server-only";
import type { SendMailOptions } from "nodemailer";
import { z } from "zod";
import { adminHref, getAdminConfig } from "@/lib/admin/config";
import { getPage, getSettings } from "@/lib/data";
import type { NewLead } from "@/lib/leads/store";
import type { ContactPage, Settings } from "@/lib/schemas";
import { interpolate, localeLanguage } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Email alert for every new enquiry, sent over SMTP (nodemailer),
   so any mailbox can send it: Gmail with an App Password today,
   hello@growthgrid.studio on Zoho or Google Workspace later, or a
   sending service such as Resend. Only the env changes:

   The site owners always receive alerts at hello@growthgrid.studio and
   aarshitjolapara11@gmail.com. LEAD_EMAIL_TO adds optional recipients.
   SMTP_HOST        e.g. smtp.gmail.com
   SMTP_PORT        465 (SSL, the default) or 587 (STARTTLS).
   SMTP_USER        The mailbox it signs in as.
   SMTP_PASS        Its password; for Gmail, an App Password.
   LEAD_EMAIL_FROM  Optional sender; defaults to SMTP_USER.

   The contact route normally calls this in after(); if storage fails,
   it waits for delivery before confirming the submission. Reply-To is
   the visitor, so "Reply" in any mail app answers them. Log lines never
   include the enquiry. Setup steps: .env.example.
   ───────────────────────────────────────────────────────────── */

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
const DEFAULT_RECIPIENTS = ["hello@growthgrid.studio", "aarshitjolapara11@gmail.com"];
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
 * The env as a mail setup. `config` is null when SMTP isn't configured or
 * the setup has a mistake, explained in `problem`.
 */
export function leadMailConfig(env: NodeJS.ProcessEnv = process.env): { config: LeadMailConfig | null; problem?: string } {
  const additionalRecipients = (env.LEAD_EMAIL_TO ?? "").split(/[\s,;]+/).filter(Boolean);
  if (additionalRecipients.some((address) => !emailAddress.safeParse(address).success)) {
    return { config: null, problem: "LEAD_EMAIL_TO has an address that isn't valid" };
  }
  const to = [...new Set([...DEFAULT_RECIPIENTS, ...additionalRecipients])];

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

/** Contact page › Emails: every word of both emails (placeholders: see the schema). */
export type LeadMailCopy = ContactPage["emails"];

export interface LeadMailContext {
  /** e.g. "growthGrid": the header, {site} and the sender's name. */
  siteName: string;
  /** e.g. "growthgrid.studio": {host}, in the footer. */
  siteHost: string;
  /** `<html lang>`, from Site settings › Locale (e.g. "en"). */
  lang: string;
  /** Studio › Leads, when the Studio is on. */
  studioUrl?: string;
  /** False: saving failed, so this email is the only stored copy of the enquiry. */
  saved: boolean;
}

export interface LeadMail {
  subject: string;
  text: string;
  html: string;
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The visitor's name, first name and company, plus the site's name and host, for the copy's placeholders. */
function placeholders(lead: NewLead, site: { siteName: string; siteHost?: string }) {
  const name = oneLine(lead.name);
  return {
    name,
    firstName: name.split(" ")[0] || name,
    company: oneLine(lead.company),
    site: site.siteName,
    host: site.siteHost ?? "",
  };
}

export function buildLeadMail(lead: NewLead, copy: LeadMailCopy["alert"], context: LeadMailContext): LeadMail {
  const values = placeholders(lead, context);
  const { name, company } = values;
  const fill = (template: string) => interpolate(template, values);
  const subject = `${context.saved ? "" : `${copy.notSavedPrefix} `}${fill(company ? copy.subjectWithCompany : copy.subject)}`.slice(0, 160);
  const footer = fill(copy.footer);
  const notSaved = `${copy.notSavedTitle} ${copy.notSaved}`;

  const details: [label: string, value: string, email?: boolean][] = [
    [copy.emailLabel, lead.email, true],
    [copy.servicesLabel, lead.services.join(", ")],
    [copy.timelineLabel, lead.timeline],
    [copy.pageLabel, lead.source ?? ""],
  ];
  const filled = details.filter(([, value]) => value.trim() !== "");

  const text = [
    ...(context.saved ? [] : [notSaved, ""]),
    fill(copy.heading),
    "",
    `${copy.nameLabel}: ${name}`,
    ...(company ? [`${copy.companyLabel}: ${company}`] : []),
    ...filled.map(([label, value]) => `${label}: ${value}`),
    "",
    `${copy.messageLabel}:`,
    lead.message,
    "",
    "--",
    footer,
    ...(context.studioUrl ? [`${copy.leadsLabel}: ${context.studioUrl}`] : []),
  ].join("\n");

  const e = escapeHtml;
  const label = "font-size:11px;line-height:1.4;letter-spacing:1.2px;text-transform:uppercase;color:#6b7b88;";
  const rows = filled
    .map(([key, value, email]) => {
      const shown = email ? `<a href="mailto:${e(value)}" style="color:#0a7d55;text-decoration:none;">${e(value)}</a>` : e(value);
      return `<tr><td style="${label}padding:9px 16px 7px 0;width:90px;white-space:nowrap;vertical-align:top;">${e(key)}</td><td style="padding:7px 0;font-size:15px;line-height:1.5;color:#0b1419;vertical-align:top;">${shown}</td></tr>`;
    })
    .join("");
  const button = (href: string, text: string, primary: boolean) =>
    `<a href="${e(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${
      primary ? "background:#3ce49a;color:#04070a;" : "background:#ffffff;color:#0b1419;border:1px solid #d5dde3;"
    }">${e(text)}</a>`;
  const replyHref = `mailto:${lead.email}?subject=${encodeURIComponent(fill(copy.replySubject))}`;
  const preheader = [name, lead.services.join(", "), lead.timeline, oneLine(lead.message).slice(0, 90)].filter(Boolean).join(" · ");

  const html = `<!doctype html>
<html lang="${e(context.lang)}">
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
<td align="right"><span style="display:inline-block;padding:5px 12px;border-radius:999px;border:1px solid #1f6b4c;color:#3ce49a;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">${e(copy.badge)}</span></td>
</tr></table>
</td></tr>
${
  context.saved
    ? ""
    : `<tr><td style="padding:14px 28px;background:#fff4e5;border-bottom:1px solid #ffd8a8;font-size:14px;line-height:1.5;color:#7a4b00;"><strong>${e(copy.notSavedTitle)}</strong> ${e(copy.notSaved)}</td></tr>`
}
<tr><td style="padding:28px 28px 4px;">
<h1 style="margin:0;font-size:22px;line-height:1.3;color:#0b1419;">${e(name)}</h1>
${company ? `<p style="margin:4px 0 0;font-size:15px;color:#5b6b78;">${e(company)}</p>` : ""}
</td></tr>
<tr><td style="padding:14px 28px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
<tr><td style="padding:14px 28px 4px;">
<div style="${label}">${e(copy.messageLabel)}</div>
<div style="margin-top:8px;padding:14px 16px;background:#f5f8fa;border-left:3px solid #3ce49a;border-radius:8px;font-size:15px;line-height:1.6;color:#0b1419;">${e(lead.message).replace(/\r?\n/g, "<br>")}</div>
</td></tr>
<tr><td style="padding:20px 28px 12px;">${button(replyHref, fill(copy.replyLabel), true)}${context.studioUrl ? button(context.studioUrl, copy.openLeadsLabel, false) : ""}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #edf1f4;font-size:12px;line-height:1.5;color:#8a9aaa;">${e(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildLeadConfirmationMail(
  lead: NewLead,
  copy: LeadMailCopy["confirmation"],
  context: Pick<LeadMailContext, "siteName" | "lang">,
): LeadMail {
  const fill = (template: string) => interpolate(template, placeholders(lead, context));
  const subject = fill(copy.subject);
  const text = [fill(copy.greeting), "", fill(copy.body), "", fill(copy.signOff), context.siteName].join("\n");
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${e(context.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:32px 12px;background:#eef2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dfe5ea;border-radius:14px;">
<tr><td style="background:#04070a;padding:18px 28px;font-size:18px;font-weight:700;color:#f0f4f7;">${e(context.siteName)}</td></tr>
<tr><td style="padding:28px;color:#0b1419;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${e(fill(copy.heading))}</h1>
<p style="margin:0;">${e(fill(copy.message))}</p>
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

async function sendWithRetry(transport: ReturnType<typeof import("nodemailer")["createTransport"]>, message: SendMailOptions) {
  try {
    await transport.sendMail(message);
  } catch (error) {
    if (!isTemporary(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    await transport.sendMail(message);
  }
}

/**
 * Emails the enquiry to the studio and sends a receipt to the visitor.
 * Never throws: problems are logged without the enquiry. `saved: false`
 * marks the studio email as the only stored copy.
 */
export async function emailLead(lead: NewLead, { saved = true }: { saved?: boolean } = {}): Promise<boolean> {
  const { config, problem } = leadMailConfig();
  if (!config) {
    if (problem) console.warn(`[lead-email] Not sent: ${problem}. See .env.example.`);
    return false;
  }

  // Both emails are written in the admin (Contact page › Emails). Without that content nothing is sent and
  // emailLead reports failure, so an enquiry that also couldn't be saved asks the visitor to try again.
  let settings: Settings;
  let copy: LeadMailCopy;
  try {
    [settings, { emails: copy }] = await Promise.all([getSettings(), getPage("contact")]);
  } catch (error) {
    console.warn(`[lead-email] Not sent: couldn't load the site settings or contact page content (${error instanceof Error ? error.name : "unknown error"}).`);
    return false;
  }

  try {
    const siteName = settings.name;
    const lang = localeLanguage(settings.locale);
    const admin = getAdminConfig();
    const mail = buildLeadMail(lead, copy.alert, {
      siteName,
      siteHost: new URL(settings.url).host,
      lang,
      studioUrl: admin.enabled ? new URL(adminHref(admin.base, "/leads"), settings.url).href : undefined,
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
      from: config.from.includes("<") ? config.from : { name: interpolate(copy.alert.senderName, { site: siteName }), address: config.from },
      to: config.to,
      replyTo: { name: oneLine(lead.name), address: lead.email },
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    };

    try {
      try {
        await sendWithRetry(transport, message);
      } catch (error) {
        console.warn(`[lead-email] Not sent: ${describe(error, config)}`);
        return false;
      }

      console.info(`[lead-email] Enquiry emailed to ${config.to.length === 1 ? "1 address" : `${config.to.length} addresses`}.`);
      try {
        const confirmation = buildLeadConfirmationMail(lead, copy.confirmation, { siteName, lang });
        await sendWithRetry(transport, {
          from: message.from,
          to: lead.email,
          subject: confirmation.subject,
          text: confirmation.text,
          html: confirmation.html,
        });
        console.info("[lead-email] Confirmation emailed to the submitter.");
      } catch (error) {
        console.warn(`[lead-email] Confirmation not sent: ${describe(error, config)}`);
      }
      return true;
    } finally {
      transport.close();
    }
  } catch (error) {
    console.warn(`[lead-email] Not sent: ${describe(error, config)}`);
    return false;
  }
}
