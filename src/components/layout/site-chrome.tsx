import type { ReactNode } from "react";
import { BrandMarkProvider } from "@/components/layout/brand-context";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { Cursor } from "@/components/layout/cursor";
import { InteractionGuard } from "@/components/layout/interaction-guard";
import { IntroLoader } from "@/components/layout/intro-loader";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SmoothScroll } from "@/components/layout/smooth-scroll";
import { Starfield } from "@/components/layout/starfield";
import { JsonLd } from "@/components/seo/json-ld";
import { GfxProbe } from "@/components/three/gfx";
import { RevealObserver } from "@/components/ui/reveal-observer";
import { gaIdOf } from "@/lib/analytics";
import { brandMark, resolveBrand } from "@/lib/brand";
import { getServices, getSettings, getTechnologies } from "@/lib/data";
import { organizationSchema, professionalServiceSchema, websiteSchema } from "@/lib/seo/schema";

/** Without JS, reveal-on-scroll content must still be visible. */
const NO_JS_CSS =
  "[data-reveal],[data-split] .split-word>span{opacity:1!important;transform:none!important;filter:none!important}";

/**
 * The public site's shell around page content: header, footer, smooth
 * scroll, cursor and interaction guard, starfield, consent banner, the
 * intro loader and site-wide JSON-LD. Used by the `(site)` layout and the
 * global 404; the admin has its own shell.
 */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const [settings, services, technologies] = await Promise.all([getSettings(), getServices(), getTechnologies()]);
  const brand = resolveBrand(settings);
  const gaId = gaIdOf(settings);
  // The topics the studio knows (Organization JSON-LD): its services and its stack.
  const knowsAbout = [
    ...new Set([...services.map((s) => s.title), ...technologies.flatMap((c) => c.technologies.map((t) => t.name))]),
  ];

  return (
    <>
      {/* First in <body>: its gate script decides on the intro before anything paints. */}
      <IntroLoader mark={brandMark(brand)} lockup={brand.logo.stacked} wordmark={settings.wordmark} />
      <Starfield />
      <noscript>
        <style>{NO_JS_CSS}</style>
      </noscript>
      <a href="#main" className="skip-link">
        {settings.ui.skipToContent}
      </a>

      <SiteHeader
        wordmark={settings.wordmark}
        logo={brand.logo}
        primary={settings.navigation.primary}
        cta={settings.navigation.cta}
        email={settings.contact.email}
        socials={settings.socials}
        availability={settings.availability}
        ui={settings.ui}
      />
      <main id="main" tabIndex={-1} className="outline-none">
        <BrandMarkProvider mark={brandMark(brand)}>{children}</BrandMarkProvider>
      </main>
      <SiteFooter />

      <SmoothScroll />
      <GfxProbe />
      <RevealObserver />
      <Cursor />
      <InteractionGuard />
      <div className="grain" aria-hidden="true" />
      {/* Every first-time visitor: asks for analytics consent when GA is on, else notes there are no tracking cookies. */}
      <CookieConsent gaId={gaId} copy={settings.consent} />

      <JsonLd
        data={[
          organizationSchema(settings, knowsAbout),
          websiteSchema(settings),
          professionalServiceSchema(settings, services),
        ]}
      />
    </>
  );
}
