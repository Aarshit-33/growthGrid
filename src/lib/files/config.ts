import { ADMIN_ROUTE, RESERVED_SEGMENTS } from "@/lib/admin/config";

/* ─────────────────────────────────────────────────────────────
   File library: a private page listing everything in /public,
   with previews, copyable links and downloads (one file, one
   folder, or everything as a .zip). Read from the environment:

   FILES_PATH   Its private address: one URL segment of 12-64
                letters, digits or dashes, e.g. "files-7c1e93a0b4d2".
                The address appears nowhere in the code, the page
                is never linked or indexed, and its real route
                folder (src/app/files) is a 404 by name. Anyone
                who has the address can open it, so keep it
                unguessable. Unset or invalid: the page doesn't
                exist, every URL is the site's ordinary 404.

   Also imported by src/proxy.ts, so keep it free of Node-only and
   server-only imports.
   ───────────────────────────────────────────────────────────── */

/** Where the page lives in src/app (it only ever answers at FILES_PATH). */
export const FILES_ROUTE = "/files";
/** The address is the page's only lock, so it must be too long to guess. */
export const MIN_FILES_PATH_LENGTH = 12;
/** Request header src/proxy.ts adds when it lets a request in through FILES_PATH (see cameThroughGate). */
export const FILES_GATE_HEADER = "x-gg-files-gate";

export interface FilesConfig {
  /** False without a valid FILES_PATH: every file-library URL 404s. */
  enabled: boolean;
  /** Public address, e.g. "/files-7c1e93a0b4d2" ("" when off). */
  base: string;
  /** Why a set FILES_PATH was rejected (logged once on the server). */
  problem?: string;
}

const segment = (raw: string | undefined) => (raw ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();

export function getFilesConfig(): FilesConfig {
  const value = segment(process.env.FILES_PATH);
  if (!value) return { enabled: false, base: "" };

  const off = (problem: string): FilesConfig => ({ enabled: false, base: "", problem });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value) || value.length < MIN_FILES_PATH_LENGTH || value.length > 64) {
    return off(`FILES_PATH must be one URL segment of ${MIN_FILES_PATH_LENGTH}-64 letters, digits or dashes`);
  }
  // The value itself is never echoed: it's a secret address.
  const taken = new Set([...RESERVED_SEGMENTS, ADMIN_ROUTE.slice(1), FILES_ROUTE.slice(1), segment(process.env.ADMIN_PATH)]);
  if (taken.has(value)) return off("FILES_PATH would hide another page, pick a different address");

  return { enabled: true, base: `/${value}` };
}

/**
 * True only for requests src/proxy.ts let in through the private address: it
 * stamps them with FILES_GATE_HEADER set to the address itself, which nobody
 * outside knows. The page and its .zip route check this as well, so even if
 * a request ever reached src/app/files another way, it would still 404.
 */
export function cameThroughGate(config: FilesConfig, headers: Pick<Headers, "get">) {
  return config.enabled && headers.get(FILES_GATE_HEADER) === config.base;
}

const logged = globalThis as typeof globalThis & { __ggFilesWarned?: string };

/** Says in the server console (once, not on every request) why a set FILES_PATH still 404s. */
export function logFilesProblem(config: FilesConfig) {
  if (!config.problem || logged.__ggFilesWarned === config.problem) return;
  logged.__ggFilesWarned = config.problem;
  console.warn(`[files] The file library is off, so its address is a 404: ${config.problem}. See .env.example.`);
}
