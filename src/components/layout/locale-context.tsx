"use client";

import { createContext, use, type ReactNode } from "react";

/* The site's language (Site settings › Locale, as a BCP 47 tag such as
   "en-US") for client components that format numbers, dates and times
   and can't read settings themselves. Provided by the site chrome. */

const LocaleContext = createContext<string | null>(null);

export function LocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** The site's BCP 47 locale tag. Only valid below the site chrome's LocaleProvider. */
export function useLocale(): string {
  const locale = use(LocaleContext);
  if (!locale) throw new Error("useLocale() needs a <LocaleProvider> (the site chrome provides one).");
  return locale;
}
