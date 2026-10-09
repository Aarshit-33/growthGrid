import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock3, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandMark } from "@/components/layout/logo";
import { LoginForm } from "@/components/admin/login-form";
import { getSession, passwordOnly, requireAdmin } from "@/lib/admin/auth";
import { adminHref, safeNextPath } from "@/lib/admin/config";
import { brandMark, resolveBrand } from "@/lib/brand";
import { getSettings } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const config = await requireAdmin();
  const { next: raw } = await searchParams;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  if (await getSession(config)) redirect(adminHref(config.base, next));

  const settings = await getSettings();
  const mark = brandMark(resolveBrand(settings));
  const mode = passwordOnly(config) ? "password" : "email";
  // Users in .env.local that can't sign in, and why (development only: never shown on a live site).
  const skipped = process.env.NODE_ENV === "production" ? [] : config.warnings;

  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden px-5 py-16">
      {/* Backdrop: the brand grid, fading out from an emerald glow. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="blueprint fade-radial absolute inset-0 opacity-80 [--grid-size:3.5rem]" />
        <div className="admin-glow absolute left-1/2 top-[40%] size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(60_228_154/0.17),rgb(60_228_154/0.04)_42%,transparent_66%)]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
      </div>

      <div className="w-full max-w-[25rem]">
        <header className="mb-8 flex animate-rise-in flex-col items-center text-center">
          <div className="relative mb-7">
            <span className="absolute -inset-3 rounded-[1.6rem] bg-em/10 blur-xl" aria-hidden="true" />
            <div
              className={cn(
                "relative grid h-16 place-items-center rounded-2xl border border-line-strong bg-surface shadow-glow",
                mark?.wide ? "px-5" : "w-16",
              )}
            >
              <BrandMark mark={mark} className="size-8 text-ink" animated />
            </div>
          </div>
          <p className="label-mono inline-flex items-center gap-2 text-[0.66rem] text-em">
            <LockKeyhole className="size-3" aria-hidden="true" />
            {settings.name} · Studio
          </p>
          <h1 className="mt-3 font-display text-[2.1rem] font-medium leading-none tracking-[-0.04em] text-ink">Welcome back</h1>
          <p className="mt-3 max-w-[19rem] text-[0.92rem] leading-relaxed text-muted">
            {mode === "email" ? "Sign in with your studio email and password." : "Enter the studio password to edit what the site shows."}
          </p>
        </header>

        <div className="glass edge-glow animate-rise-in rounded-panel p-6 shadow-panel [animation-delay:90ms] sm:p-7">
          <LoginForm next={next} mode={mode} />
        </div>

        {skipped.length > 0 && (
          <div role="note" className="mt-5 animate-rise-in rounded-2xl border border-warn/35 bg-warn/[0.06] px-4 py-3.5 text-[0.8rem] leading-relaxed text-dim">
            <p className="flex items-center gap-2 font-medium text-warn">
              <TriangleAlert className="size-3.5" aria-hidden="true" /> Some users in .env.local can&apos;t sign in
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {skipped.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className="mt-2 text-[0.74rem] text-faint">Only shown while developing. Fix the block, save the file, then reload.</p>
          </div>
        )}

        <ul className="mt-7 flex animate-rise-in flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.72rem] text-faint [animation-delay:180ms]">
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-em" aria-hidden="true" /> Signed, httpOnly session
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-em" aria-hidden="true" /> Stays signed in for 12 hours
          </li>
        </ul>
      </div>
    </main>
  );
}
