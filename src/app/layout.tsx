import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { motionGateScript } from "@/components/layout/intro-gate";
import { brandAssetUrl, resolveBrand } from "@/lib/brand";
import { getSettings } from "@/lib/data";
import type { Brand, Settings } from "@/lib/schemas";
import { fontVariables } from "./fonts";
import "./globals.css";

const MOTION_GATE = motionGateScript();

/** Icon links: the built-in .ico + SVG + touch icon, or PNGs rendered from the Branding icon. All served by /brand/[asset]. */
function brandIcons(brand: Brand): Metadata["icons"] {
  const apple = [{ url: brandAssetUrl(brand, "apple-icon.png"), sizes: "180x180", type: "image/png" }];
  if (!brand.app.icon) {
    return {
      icon: [
        { url: brandAssetUrl(brand, "favicon.ico"), sizes: "any" },
        { url: brandAssetUrl(brand, "icon.svg"), type: "image/svg+xml" },
      ],
      apple,
    };
  }
  return {
    icon: [
      { url: brandAssetUrl(brand, "favicon.ico"), sizes: "16x16 32x32 48x48" },
      { url: brandAssetUrl(brand, "icon-32.png"), sizes: "32x32", type: "image/png" },
      { url: brandAssetUrl(brand, "icon-192.png"), sizes: "192x192", type: "image/png" },
    ],
    apple,
  };
}

/** Search Console / Bing Webmaster Tools ownership tags (Site settings › SEO). */
function verification({ seo }: Settings): Metadata["verification"] {
  const result: NonNullable<Metadata["verification"]> = {};
  if (seo.googleVerification) result.google = seo.googleVerification;
  if (seo.bingVerification) result.other = { "msvalidate.01": seo.bingVerification };
  return Object.keys(result).length ? result : undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    metadataBase: new URL(settings.url),
    title: { default: settings.seo.defaultTitle, template: settings.seo.titleTemplate },
    description: settings.seo.description,
    applicationName: settings.name,
    authors: [{ name: settings.legalName, url: settings.url }],
    creator: settings.legalName,
    publisher: settings.legalName,
    category: settings.seo.category,
    formatDetection: { email: false, address: false, telephone: false },
    openGraph: {
      type: "website",
      siteName: settings.name,
      locale: settings.locale,
      url: settings.url,
      title: settings.seo.defaultTitle,
      description: settings.seo.description,
    },
    twitter: {
      card: "summary_large_image",
      site: settings.seo.twitterHandle,
      creator: settings.seo.twitterHandle,
    },
    robots: settings.seo.discourageSearchEngines
      ? // Site settings › SEO › Discourage search engines (staging, pre-launch).
        { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
        },
    icons: brandIcons(resolveBrand(settings)),
    verification: verification(settings),
    // Site settings › SEO › Block AI training crawlers: alongside the robots.txt rules,
    // every page carries the W3C TDMRep opt-out from text-and-data mining.
    ...(settings.seo.blockAiTraining ? { other: { "tdm-reservation": "1" } } : {}),
  };
}

/** The browser toolbar colour comes from Branding. */
export async function generateViewport(): Promise<Viewport> {
  const settings = await getSettings();
  return {
    themeColor: resolveBrand(settings).app.themeColor,
    colorScheme: "dark",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

/**
 * The document shell shared by the public site and the admin. The public
 * chrome (header, footer, smooth scroll…) is added by `(site)/layout.tsx`
 * via `SiteChrome`, so /admin renders without it.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();

  return (
    // suppressHydrationWarning: the intro gate (components/layout/intro-gate.ts)
    // sets data-intro / data-gfx here before React hydrates. One level deep only.
    <html lang={settings.locale.replace("_", "-")} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Motion gate: opts real browsers into entrance animations (components/layout/intro-gate.ts).
            First in <head>, so it has run before anything paints. */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_GATE }} />
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PTLWJ48Z');`,
          }}
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-PTLWJ48Z"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
