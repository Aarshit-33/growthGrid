import type { ReactNode } from "react";
import { SiteChrome } from "@/components/layout/site-chrome";

/** Every public page sits inside the site chrome (header, footer, smooth scroll…). */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
