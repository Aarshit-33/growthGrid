import type { NextConfig } from "next";
import settings from "./content/settings.json";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

/* HTTPS enforcement (production only, so local dev stays on http).
   Browsers ignore HSTS on plain-http responses, and the redirect only
   fires when a proxy/CDN reports the original request was http. */
const isProd = process.env.NODE_ENV === "production";
const hsts = { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" };

/* One hostname. The public URL (NEXT_PUBLIC_SITE_URL, else `url` in
   content/settings.json, the same order the app resolves it) decides whether
   the site lives on the apex or on www; the other one 308s to it. Without
   this both hosts answered 200 with identical pages, so Google saw every URL
   twice and had to pick a canonical by itself. Production only: previews on
   *.vercel.app and the ngrok tunnel aren't on either hostname and are left alone. */
function canonicalHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || settings.url;
  return raw && URL.canParse(raw) ? new URL(raw).host : null;
}
const host = canonicalHost();
const otherHost = host ? (host.startsWith("www.") ? host.slice(4) : `www.${host}`) : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* `BUILD_STANDALONE=1 npm run build` also writes .next/standalone: a
     self-contained server (`node server.js`) for a VPS or any Node host.
     Off by default, so Vercel and `npm start` builds are unchanged. */
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  /* Runtime data (local leads, Studio history) is written next to the app,
     never shipped with it; the app recreates .data when it writes. */
  outputFileTracingExcludes: { "/*": ["./.data/**/*"] },
  /* `npm run tunnel` (ngrok) serves the dev site from these hostnames;
     Next blocks dev assets and HMR for unknown origins otherwise. */
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["@react-three/drei", "lucide-react"],
    /* Studio image uploads go through a server action: 8 MB per file
       (MAX_UPLOAD_BYTES in src/lib/admin/media.ts) plus form overhead.
       The proxy buffers up to 10 MB by default, which matches. */
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: isProd ? [...securityHeaders, hsts] : securityHeaders }];
  },
  /* Browsers ask for /favicon.ico on their own: serve the Branding icon
     (src/app/brand/[asset]/route.ts) there too.
     Images uploaded in the Studio with CONTENT_SOURCE=mongo live in MongoDB
     (GridFS), not /public. As a fallback, /images/* only reaches their
     route (src/app/media/[...path]/route.ts) when no /public file answered,
     so shipped files win and content keeps plain "/images/…" paths. */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [{ source: "/favicon.ico", destination: "/brand/favicon.ico" }],
      fallback: [{ source: "/images/:path*", destination: "/media/images/:path*" }],
    };
  },
  async redirects() {
    if (!isProd) return [];
    return [
      // Non-canonical hostname → canonical, straight to https (one hop, never a chain).
      ...(host && otherHost
        ? [
            {
              source: "/:path*",
              has: [{ type: "host" as const, value: otherHost.replaceAll(".", "\\.") }],
              destination: `https://${host}/:path*`,
              permanent: true,
            },
          ]
        : []),
      {
        source: "/:path*",
        has: [
          { type: "header", key: "x-forwarded-proto", value: "http" },
          { type: "host", value: "(?<host>.+)" },
        ],
        destination: "https://:host/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
