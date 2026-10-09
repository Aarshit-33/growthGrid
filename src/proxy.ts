import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROUTE, adminHref, getAdminConfig, logAdminProblems } from "@/lib/admin/config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { FILES_GATE_HEADER, FILES_ROUTE, getFilesConfig, logFilesProblem } from "@/lib/files/config";

/* ─────────────────────────────────────────────────────────────
   Proxy: the admin's front door.

   • With ADMIN_PATH set, the admin answers only at that private
     address (rewritten to the /admin routes), and /admin itself
     renders the site's ordinary 404.
   • Visitors without a valid session are sent to the login screen.
   • Admin responses are marked noindex and never cached.

   This is only the first gate: admin pages and server actions
   verify the session again on the server.

   It's also the file library's door (lib/files/config.ts): the
   library answers only at its private FILES_PATH address
   (rewritten to /files), and /files itself is always the
   site's ordinary 404, with or without FILES_PATH. Requests let
   in are stamped, and the library serves nothing without it.
   ───────────────────────────────────────────────────────────── */

const isUnder = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The site's normal 404, exactly as for any unknown URL. */
const notFound = (request: NextRequest) => NextResponse.rewrite(new URL("/_gg-not-found", request.url));

/** For the admin and the file library: never indexed, never cached. */
function privateHeaders(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // File library: its real route folder is never reachable by name…
  if (isUnder(pathname, FILES_ROUTE)) return notFound(request);
  const files = getFilesConfig();
  logFilesProblem(files);
  // …only through the private address, which never appears in the code.
  if (files.enabled && isUnder(pathname, files.base)) {
    const sub = pathname.slice(files.base.length);
    // The stamp travels upstream only (a request header), never to the browser.
    const headers = new Headers(request.headers);
    headers.set(FILES_GATE_HEADER, files.base);
    const target = new URL(`${FILES_ROUTE}${sub === "/" ? "" : sub}${search}`, request.url);
    return privateHeaders(NextResponse.rewrite(target, { request: { headers } }));
  }

  const config = getAdminConfig();
  const hidden = config.base !== ADMIN_ROUTE;

  // With a private address, the real route folder is never reachable by name.
  if (hidden && isUnder(pathname, ADMIN_ROUTE)) return notFound(request);
  if (!isUnder(pathname, config.base)) return NextResponse.next();
  // Say in the terminal why (once): with a private address the 404 below happens before any admin page could.
  logAdminProblems(config);
  // Admin switched off (env missing/invalid): the admin layout renders the 404.
  if (!config.enabled) return hidden ? notFound(request) : NextResponse.next();

  const sub = pathname.slice(config.base.length) || "/";
  // Server actions check the session themselves and answer with an error, not a page redirect.
  const isAction = request.method === "POST" && request.headers.has("next-action");

  if (sub !== "/login" && !isAction) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config);
    if (!session) {
      const login = new URL(adminHref(config.base, "/login"), request.url);
      if (sub !== "/") login.searchParams.set("next", sub);
      return privateHeaders(NextResponse.redirect(login));
    }
  }

  return privateHeaders(
    hidden
      ? NextResponse.rewrite(new URL(`${ADMIN_ROUTE}${sub === "/" ? "" : sub}${search}`, request.url))
      : NextResponse.next(),
  );
}

export const config = {
  // Pages only: skip API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
