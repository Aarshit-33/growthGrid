import type { NextConfig } from "next";

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
