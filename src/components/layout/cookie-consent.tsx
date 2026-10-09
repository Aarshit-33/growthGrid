"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Settings } from "@/lib/schemas";
import { useIntroCovering } from "./intro-loader";

/* ─────────────────────────────────────────────────────────────
   Cookie banner + Google Analytics 4. Every first-time visitor
   sees it, in one of two forms:
     · analytics on (a GA4 ID is set): it asks. Nothing is
       requested from Google until the visitor accepts: gtag.js is
       only injected after an explicit "Accept". Declining (now or
       later from the footer's "Cookie settings") revokes consent
       and clears any _ga cookies;
     · analytics off: the site sets no cookies, so it says just
       that, with one button. Turning analytics on later asks those
       visitors again: that "Accept" wasn't consent to analytics.
   The answer is kept in localStorage, so the banner stays away
   once answered. Non-modal: it never traps focus or blocks the
   page. It waits for the intro loader to lift.
   ───────────────────────────────────────────────────────────── */

/** The stored answer: analytics granted or denied, or the analytics-off notice accepted. */
type Choice = "granted" | "denied" | "essential";
type Snapshot = Choice | "unset" | "pending";
type ConsentCopy = Settings["consent"];

const STORAGE_KEY = "gg-consent";
const OPEN_EVENT = "gg:consent-open";

/** Analytics-off copy for settings saved before it existed (content/settings.json has its own). */
const NOTICE_FALLBACK = {
  essentialMessage:
    "We don't use tracking or advertising cookies. Only a few essential settings are kept in your browser, like this choice, so the site works properly.",
  acknowledge: "Accept",
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/* ── Tiny external store over localStorage ─────────────────── */
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readChoice(): Snapshot {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" || value === "essential" ? value : "unset";
  } catch {
    return "unset";
  }
}

function writeChoice(choice: Choice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* Private mode: the choice lasts for this page view only. */
  }
  listeners.forEach((listener) => listener());
}

function clearAnalyticsCookies() {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || !name.startsWith("_ga")) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** Reopens the banner (used by the footer "Cookie settings" button). */
export function openConsent() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function ConsentSettingsButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={openConsent} className="text-muted transition-colors hover:text-hot">
      {label}
    </button>
  );
}

export function CookieConsent({ gaId, copy }: { gaId: string | null; copy: ConsentCopy }) {
  const stored = useSyncExternalStore<Snapshot>(subscribe, readChoice, () => "pending");
  const [reopened, setReopened] = useState(false);
  // Held back while the intro loader covers the page: it rises in once that has lifted.
  const covered = useIntroCovering();
  const analytics = gaId !== null;

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const choose = (choice: Choice) => {
    if (choice === "granted") {
      window.gtag?.("consent", "update", { analytics_storage: "granted" });
    } else {
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      clearAnalyticsCookies();
    }
    writeChoice(choice);
    setReopened(false);
  };

  // Analytics on: asked until the visitor decides on analytics (accepting the
  // analytics-off notice doesn't count). Off: any answer will do.
  const answered = analytics ? stored === "granted" || stored === "denied" : stored !== "unset";
  const visible = stored !== "pending" && !covered && (!answered || reopened);

  return (
    <>
      {gaId && stored === "granted" && (
        <>
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
        </>
      )}

      {visible && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          aria-describedby="consent-message"
          className="fixed inset-x-3 bottom-3 z-[80] animate-rise-in motion-reduce:animate-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-md"
        >
          <div className="relative overflow-hidden rounded-[1.25rem] border border-line-strong bg-surface p-5 shadow-panel sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-em/15 blur-3xl"
            />
            <div className="relative flex items-center gap-2.5">
              <span aria-hidden="true" className="size-2 animate-pulse-dot rounded-full bg-em" />
              <h2 id="consent-title" className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
                {copy.title}
              </h2>
            </div>
            <p id="consent-message" className="relative mt-3 text-[0.925rem] leading-relaxed text-dim">
              {analytics ? copy.message : copy.essentialMessage || NOTICE_FALLBACK.essentialMessage}{" "}
              <Link href="/privacy" className="text-em underline-offset-4 transition-colors hover:text-hot hover:underline">
                {copy.policyLabel}
              </Link>
            </p>
            <div className="relative mt-5 flex flex-wrap gap-3">
              {analytics ? (
                <>
                  <button
                    type="button"
                    id="consent-accept"
                    onClick={() => choose("granted")}
                    className={buttonClasses("primary", "md", "px-5")}
                  >
                    {copy.accept}
                  </button>
                  <button
                    type="button"
                    id="consent-decline"
                    onClick={() => choose("denied")}
                    className={buttonClasses("secondary", "md", "px-5")}
                  >
                    {copy.decline}
                  </button>
                </>
              ) : (
                // Nothing optional to refuse: one button closes the notice.
                <button
                  type="button"
                  id="consent-accept"
                  onClick={() => choose("essential")}
                  className={buttonClasses("primary", "md", "px-5")}
                >
                  {copy.acknowledge || NOTICE_FALLBACK.acknowledge}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
