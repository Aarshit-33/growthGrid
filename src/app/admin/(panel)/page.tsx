import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleX,
  FilePlus2,
  GitCommitHorizontal,
  HardDrive,
  History,
  ImageUp,
  Inbox,
  Palette,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { EntryRow } from "@/components/admin/history-view";
import { AFTERCARE_ICON, COLLECTION_ICONS, pageIcon } from "@/components/admin/icons";
import { TimeAgo } from "@/components/admin/time-ago";
import { Badge, BtnLink, Dot, PageHeader, Panel, type Tone } from "@/components/admin/ui";
import { Logo } from "@/components/layout/logo";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { listHistory } from "@/lib/admin/history";
import { leadsSummary, type LeadsSummary } from "@/lib/admin/leads";
import { AFTERCARE_META, BRAND_META, COLLECTION_META, COLLECTION_ORDER, HOME_SECTION_META, PAGE_META, PAGE_ORDER } from "@/lib/admin/meta";
import { aftercareStats, collectionStats, homeSectionStatus } from "@/lib/admin/overview";
import { can } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";
import type { LeadStatus } from "@/lib/admin/types";
import { brandAssetUrl, resolveBrand } from "@/lib/brand";
import { resolveHomeSections } from "@/lib/content/home-sections";
import { validateContent } from "@/lib/content/validate";
import { prepareMediaIndex } from "@/lib/media/gridfs";
import type { HomeSectionConfig } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

/** The Leads card never holds up the Overview: a slow or unreachable store shows a note instead. */
function leadsAtAGlance(): Promise<LeadsSummary | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(resolve, 2500, null));
  return Promise.race([leadsSummary(3).catch(() => null), timeout]);
}

export default async function OverviewPage() {
  const { config, user } = await requireSession();
  const canLeads = can(user.role, "leads");
  // media: what's in the media database (CONTENT_SOURCE=mongo), for the image checks below.
  const [snapshot, recent, leads, media] = await Promise.all([
    readSnapshot(),
    listHistory({ limit: 5 }),
    canLeads ? leadsAtAGlance() : null,
    prepareMediaIndex(),
  ]);
  const href = (path: string) => adminHref(config.base, path);
  const canLayout = can(user.role, "layout");
  const canSettings = can(user.role, "settings");
  // Settings brings two cards: Site settings and Branding.
  const quickCards = 1 + Number(canLayout) + 2 * Number(canSettings);

  const stats = collectionStats(snapshot);
  const report = validateContent({ content: snapshot, media });
  const status = homeSectionStatus(snapshot);
  const layout = resolveHomeSections((snapshot.pages.home as { sections?: HomeSectionConfig[] } | undefined)?.sections);
  const showing = layout.filter((section) => section.enabled && !status[section.id].empty);
  const siteName = (snapshot.settings as { name?: string } | undefined)?.name ?? "the site";
  const wordmark = (snapshot.settings as { wordmark?: string } | undefined)?.wordmark || siteName;
  const brand = resolveBrand(snapshot.settings);
  const aftercare = aftercareStats(snapshot);
  const aftercareOnHome = showing.some((section) => section.id === "aftercare");
  const AftercareIcon = AFTERCARE_ICON;

  const groups = [
    { title: "Content", names: COLLECTION_ORDER.filter((name) => COLLECTION_META[name].group === "content") },
    { title: "Studio details", names: COLLECTION_ORDER.filter((name) => COLLECTION_META[name].group === "studio") },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Studio"
        title="Content studio"
        description={
          <>
            Every word, list and switch on <span className="text-ink">{siteName}</span>. Saving writes straight to the site&apos;s
            files, and checks the whole site first so nothing can break.
          </>
        }
        actions={
          <BtnLink href="/" external icon={ArrowUpRight}>
            View site
          </BtnLink>
        }
        className="animate-rise-in"
      />

      {canLeads && <LeadsCard summary={leads} href={href} />}

      {/* Quick actions (only what this role can open) */}
      <div
        className={cn(
          "grid gap-4",
          quickCards === 4 && "sm:grid-cols-2 2xl:grid-cols-4",
          quickCards === 3 && "lg:grid-cols-3",
          quickCards === 2 && "lg:grid-cols-2",
        )}
      >
        {canLayout && (
          <Link
            href={href("/homepage")}
            className="card card-hover group/card animate-rise-in p-5 [animation-delay:60ms] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-em/30 bg-em/[0.08] text-em">
                <PanelsTopLeft className="size-5" aria-hidden="true" />
              </span>
              <ArrowRight className="size-4 text-faint transition-transform duration-300 group-hover/card:translate-x-0.5 group-hover/card:text-em" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">Homepage layout</h2>
            <p className="mt-1 text-[0.86rem] text-muted">
              {showing.length} of {layout.length} sections showing. Reorder them or switch them off.
            </p>
            {/* The page as a strip: one bar per section, lit when it shows. */}
            <div className="mt-5 flex h-7 items-end gap-1" aria-hidden="true">
              <span className="h-full flex-[1.6] rounded-[3px] bg-em/80" title="Hero" />
              {layout.map((section) => {
                const on = section.enabled && !status[section.id].empty;
                return (
                  <span
                    key={section.id}
                    title={HOME_SECTION_META[section.id].label}
                    className={cn("flex-1 rounded-[3px] transition-colors", on ? "h-full bg-em/45 group-hover/card:bg-em/60" : "h-2 bg-white/[0.08]")}
                  />
                );
              })}
            </div>
          </Link>
        )}

        {canSettings && (
          <Link href={href("/settings")} className="card card-hover group/card animate-rise-in p-5 [animation-delay:100ms] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-white/[0.03] text-dim">
                <Settings className="size-5" aria-hidden="true" />
              </span>
              <ArrowRight className="size-4 text-faint transition-transform duration-300 group-hover/card:translate-x-0.5 group-hover/card:text-em" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">Site settings</h2>
            <p className="mt-1 text-[0.86rem] text-muted">Name, contact details, availability, navigation, socials, SEO and analytics.</p>
          </Link>
        )}

        {canSettings && (
          <Link href={href(BRAND_META.path)} className="card card-hover group/card animate-rise-in p-5 [animation-delay:140ms] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-white/[0.03] text-dim">
                <Palette className="size-5" aria-hidden="true" />
              </span>
              <ArrowRight className="size-4 text-faint transition-transform duration-300 group-hover/card:translate-x-0.5 group-hover/card:text-em" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">{BRAND_META.label}</h2>
            <p className="mt-1 text-[0.86rem] text-muted">Logo, favicon, app icon and browser colour.</p>
            {/* What visitors see now: the header logo, and the icon in their browser tab. */}
            <div className="mt-5 flex h-12 items-center gap-3 overflow-hidden rounded-xl border border-line bg-bg/70 px-3.5" aria-hidden="true">
              <Logo wordmark={wordmark} logo={{ ...brand.logo, height: Math.min(brand.logo.height, 26) }} className="min-w-0 [&_img]:max-h-7" />
              {/* eslint-disable-next-line @next/next/no-img-element -- the generated favicon, 16px */}
              <img src={brandAssetUrl(brand, "icon-32.png")} alt="" width={16} height={16} className="ml-auto size-4 shrink-0 rounded-[4px]" />
            </div>
          </Link>
        )}

        <div className="card animate-rise-in p-5 [animation-delay:180ms] sm:p-6">
          <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-white/[0.03] text-dim">
            <FilePlus2 className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">Create</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["projects", "insights", "testimonials", "faqs"] as const).map((name) => (
              <BtnLink key={name} href={href(`/collections/${name}/new`)} size="sm" icon={COLLECTION_ICONS[name]}>
                {COLLECTION_META[name].singular.replace(/^./, (c) => c.toUpperCase())}
              </BtnLink>
            ))}
          </div>
          <Link
            href={href("/media")}
            className="group/media mt-4 inline-flex items-center gap-1.5 text-[0.8rem] text-muted underline-offset-4 transition-colors hover:text-em"
          >
            <ImageUp className="size-3.5" aria-hidden="true" />
            Upload images in the Media library
            <ArrowRight className="size-3 transition-transform duration-300 group-hover/media:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Collections */}
      {groups.map((group, g) => (
        <section key={group.title} aria-labelledby={`group-${g}`}>
          <h2 id={`group-${g}`} className="label-mono mb-3 text-[0.64rem] text-faint">
            {group.title}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.names.flatMap((name, i) => {
              const meta = COLLECTION_META[name];
              const s = stats[name];
              const Icon = COLLECTION_ICONS[name];
              return [
                <li key={name} className="animate-rise-in" style={{ animationDelay: `${120 + i * 40}ms` }}>
                  <Link href={href(`/collections/${name}`)} className="card card-hover group/card flex h-full items-start gap-4 p-4 sm:p-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.03] text-em transition-colors duration-300 group-hover/card:border-em/40">
                      <Icon className="size-[1.1rem]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate text-[0.95rem] font-medium text-ink">{meta.label}</h3>
                        <span className="font-display text-[1.5rem] font-medium leading-none tracking-[-0.04em] text-ink">{s.total}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-[0.8rem] text-faint">{meta.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.onHome !== null && (
                          <Badge tone={s.onHome > 0 ? "em" : "muted"}>
                            {meta.home === "always" ? "All on homepage" : `${s.onHome} on homepage`}
                          </Badge>
                        )}
                        {s.hidden > 0 && <Badge tone="warn">{s.hidden} hidden</Badge>}
                      </div>
                    </div>
                  </Link>
                </li>,
                // The after-launch offer (warranty, handover, care plans) follows the services.
                ...(name === "services"
                  ? [
                      <li key="aftercare" className="animate-rise-in" style={{ animationDelay: `${140 + i * 40}ms` }}>
                        <Link href={href(AFTERCARE_META.path)} className="card card-hover group/card flex h-full items-start gap-4 p-4 sm:p-5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.03] text-em transition-colors duration-300 group-hover/card:border-em/40">
                            <AftercareIcon className="size-[1.1rem]" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <h3 className="truncate text-[0.95rem] font-medium text-ink">{AFTERCARE_META.label}</h3>
                              <span
                                className="font-display text-[1.5rem] font-medium leading-none tracking-[-0.04em] text-ink"
                                title={`${aftercare.plans.length} care plans`}
                              >
                                {aftercare.plans.length}
                                <span className="sr-only"> care plans</span>
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-[0.8rem] text-faint">{AFTERCARE_META.description}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <Badge tone={aftercareOnHome ? "em" : "muted"}>{aftercareOnHome ? "On homepage" : "Off homepage"}</Badge>
                              {aftercare.days !== null && <Badge>{aftercare.days}-day warranty</Badge>}
                            </div>
                          </div>
                        </Link>
                      </li>,
                    ]
                  : []),
              ];
            })}
          </ul>
        </section>
      ))}

      {/* grid-cols-1 = minmax(0,1fr): without it the column grows to its widest line and the page scrolls sideways on phones. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Pages */}
        <Panel title="Pages" description="Headlines, intros and labels for each page." bodyClassName="p-2 sm:p-2">
          <ul className="divide-y divide-line">
            {PAGE_ORDER.map((key) => {
              const page = PAGE_META[key];
              const Icon = pageIcon(key);
              return (
                <li key={key} className="group/row relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.025]">
                  <Icon className="size-4 shrink-0 text-faint transition-colors group-hover/row:text-em" aria-hidden="true" />
                  <Link href={href(`/pages/${key}`)} className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-xl">
                    <span className="block break-words text-[0.88rem] font-medium text-ink">{page.label}</span>
                    <span className="block break-words text-[0.78rem] leading-snug text-faint">{page.description}</span>
                  </Link>
                  {page.href && (
                    <a
                      href={page.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${page.label} on the site`}
                      title="View on site"
                      className="relative z-10 grid size-8 place-items-center rounded-lg text-faint opacity-0 transition-[opacity,color,background-color] hover:bg-white/[0.06] hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  )}
                  <ArrowRight className="size-4 shrink-0 text-faint transition-[color,transform] duration-300 group-hover/row:translate-x-0.5 group-hover/row:text-em" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Recent changes"
            icon={History}
            description="Who changed what, newest first."
            actions={
              <BtnLink href={href("/history")} size="sm" variant="ghost" icon={ArrowRight}>
                History
              </BtnLink>
            }
            bodyClassName={recent.entries.length > 0 ? "p-1.5 sm:p-1.5" : undefined}
          >
            {recent.entries.length > 0 ? (
              <ul className="divide-y divide-line">
                {recent.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} base={config.base} compact />
                ))}
              </ul>
            ) : (
              <p className="text-[0.86rem] leading-relaxed text-muted">No changes yet. Every save shows up here, with who made it.</p>
            )}
          </Panel>

          <HealthPanel errors={report.errors} warnings={report.warnings} />

          <Panel title="How saving works" icon={HardDrive} bodyClassName="space-y-3.5">
            <Step icon={HardDrive}>
              Content lives in <code className="font-mono text-[0.82em] text-dim">/content</code> as JSON. Saving writes those files directly.
            </Step>
            <Step icon={ShieldCheck}>Every save checks the whole site first. A change that would break a page is never written.</Step>
            <Step icon={History}>
              Every change is kept in History with who made it and what it was before. Owners and editors can revoke a change or restore a
              deleted item.
            </Step>
            <Step icon={Zap}>
              With <code className="font-mono text-[0.82em] text-dim">npm run dev</code> running, the site updates the moment you save.
            </Step>
            <Step icon={GitCommitHorizontal}>For the live site, commit the changed files and redeploy.</Step>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const LEAD_TONE: Record<LeadStatus, Tone> = { new: "em", contacted: "info", qualified: "warn", won: "em", lost: "muted", spam: "danger" };

const enquiries = (count: number) => `${count} ${count === 1 ? "enquiry" : "enquiries"}`;

/** The Leads inbox at a glance: how many are waiting for a reply, and the latest few. */
function LeadsCard({ summary, href }: { summary: LeadsSummary | null; href: (path: string) => string }) {
  const fresh = summary?.fresh ?? 0;
  const line = !summary
    ? "Enquiries from the contact form."
    : fresh > 0
      ? `${enquiries(fresh)} waiting for a reply, ${summary.total} in all.`
      : summary.total > 0
        ? `All caught up: nothing new. ${enquiries(summary.total)} in all.`
        : "Enquiries from the contact form land here.";

  return (
    <section aria-labelledby="leads-card" className="card relative animate-rise-in overflow-hidden p-5 [animation-delay:40ms] sm:p-6">
      {fresh > 0 && <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-em/[0.07] blur-3xl" />}
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex items-start gap-4 lg:w-[19rem] lg:shrink-0">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-em/30 bg-em/[0.08] text-em">
            <Inbox className="size-5" aria-hidden="true" />
            {fresh > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-em px-1 font-mono text-[0.62rem] font-semibold tabular-nums text-bg">
                {fresh > 99 ? "99+" : fresh}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h2 id="leads-card" className="font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">
              Leads
            </h2>
            <p className="mt-1 text-[0.86rem] text-muted">{line}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {!summary ? (
            <p className="rounded-xl border border-line px-4 py-3 text-[0.84rem] text-muted">
              Couldn&apos;t load the enquiries just now. Open Leads to try again.
            </p>
          ) : summary.latest.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[0.84rem] text-muted">
              No enquiries yet. When someone sends the contact form, it shows up here, marked new.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white/[0.015]">
              {summary.latest.map((lead) => {
                const about = lead.company || lead.services[0];
                return (
                  <li key={lead.id}>
                    <Link
                      href={href(`/leads?open=${encodeURIComponent(lead.id)}`)}
                      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <Dot tone={LEAD_TONE[lead.status]} pulse={lead.status === "new"} />
                      <span className="min-w-0 flex-1 text-[0.86rem] leading-snug">
                        <span className={cn("block break-words text-ink", lead.status === "new" && "font-medium")}>{lead.name}</span>
                        {about && <span className="block break-words text-[0.78rem] text-faint">{about}</span>}
                      </span>
                      {lead.createdAt && <TimeAgo at={lead.createdAt} className="shrink-0 text-[0.74rem] tabular-nums text-faint" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <BtnLink href={href("/leads")} icon={ArrowRight} variant={fresh > 0 ? "primary" : "secondary"} className="self-start lg:self-center">
          Open leads
        </BtnLink>
      </div>
    </section>
  );
}

function Step({ icon: Icon, children }: { icon: typeof HardDrive; children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-[0.84rem] leading-relaxed text-muted">
      <Icon className="mt-[0.2rem] size-4 shrink-0 text-em" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function HealthPanel({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  const clear = errors.length === 0 && warnings.length === 0;
  return (
    <Panel
      title="Site check"
      icon={Stethoscope}
      description="The same checks the build runs."
      actions={
        errors.length > 0 ? (
          <Badge tone="danger">{errors.length} to fix</Badge>
        ) : (
          <Badge tone="em" icon={CircleCheck}>
            Healthy
          </Badge>
        )
      }
      bodyClassName="space-y-3"
    >
      {clear && (
        <p className="flex items-center gap-2.5 text-[0.86rem] text-muted">
          <CircleCheck className="size-4 text-em" aria-hidden="true" /> All clear. No problems or notes.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="space-y-2">
          {errors.slice(0, 4).map((error, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.05] px-3 py-2.5">
              <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <span className="whitespace-pre-wrap break-words font-mono text-[0.74rem] leading-relaxed text-dim">{error}</span>
            </li>
          ))}
          {errors.length > 4 && <li className="text-[0.78rem] text-faint">…and {errors.length - 4} more</li>}
        </ul>
      )}
      {errors.length === 0 && warnings.length > 0 && (
        <p className="flex items-center gap-2.5 text-[0.86rem] text-muted">
          <CircleCheck className="size-4 text-em" aria-hidden="true" /> Nothing is broken.
        </p>
      )}
      {warnings.length > 0 && (
        <details className="group/notes rounded-xl border border-line bg-white/[0.015]">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 text-[0.84rem] text-dim [&::-webkit-details-marker]:hidden">
            <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />
            {warnings.length} {warnings.length === 1 ? "note" : "notes"} worth a look
            <ArrowRight className="ml-auto size-3.5 text-faint transition-transform duration-300 group-open/notes:rotate-90" aria-hidden="true" />
          </summary>
          <ul className="max-h-72 space-y-2 overflow-y-auto border-t border-line px-3 py-3">
            {warnings.map((warning, i) => (
              <li key={i} className="break-words text-[0.78rem] leading-relaxed text-muted">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
