/* ─────────────────────────────────────────────────────────────
   MongoDB connection settings, from the environment.

   MONGODB_URI is either a complete connection string, or Atlas's
   template with placeholders that are filled from their own vars:

     MONGODB_URI=mongodb+srv://<db_username>:<db_password>@cluster0.example.mongodb.net/?appName=Cluster0
     MONGODB_USERNAME=studio
     MONGODB_PASSWORD=p@ss:word      ← URL-encoded here, keep it raw

   No imports, so the app, the seed script and the leads store can
   all share it. Never log the URI: use describeMongoTarget().
   ───────────────────────────────────────────────────────────── */

type Env = Record<string, string | undefined>;

const PLACEHOLDERS: [placeholder: string, variable: string][] = [
  ["<db_username>", "MONGODB_USERNAME"],
  ["<db_password>", "MONGODB_PASSWORD"],
];

/** Any `<something>` left in the URI: a placeholder nobody filled. */
const LEFTOVER = /<[^<>\s]+>/;

/** The value of an env var, trimmed; undefined when empty. */
function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

/**
 * Why MongoDB can't be used yet, or null when it can. Messages name the
 * variables involved, never their values.
 */
export function mongoConfigProblem(env: Env = process.env): string | null {
  const uri = value(env, "MONGODB_URI");
  if (!uri) return "MONGODB_URI is not set.";
  const missing = PLACEHOLDERS.filter(([placeholder, name]) => uri.includes(placeholder) && !value(env, name)).map(
    ([, name]) => name,
  );
  if (missing.length > 0) return `MONGODB_URI uses a placeholder for ${missing.join(" and ")}, which ${missing.length > 1 ? "are" : "is"} not set.`;
  const filled = fill(uri, env);
  if (LEFTOVER.test(filled)) return "MONGODB_URI still contains a <placeholder>. Put the real value in, or use <db_username> / <db_password> with MONGODB_USERNAME / MONGODB_PASSWORD.";
  if (!/^mongodb(\+srv)?:\/\//.test(filled)) return "MONGODB_URI must start with mongodb:// or mongodb+srv://.";
  return null;
}

function fill(uri: string, env: Env): string {
  let result = uri;
  for (const [placeholder, name] of PLACEHOLDERS) {
    const replacement = value(env, name);
    // Usernames and passwords may hold @ : / ? # %, which must be encoded in a URI.
    if (replacement !== undefined) result = result.split(placeholder).join(encodeURIComponent(replacement));
  }
  return result;
}

/** The connection string to use, or null when MongoDB isn't (fully) configured. */
export function mongoUri(env: Env = process.env): string | null {
  if (mongoConfigProblem(env)) return null;
  return fill(value(env, "MONGODB_URI")!, env);
}

/** True when a usable connection string can be built (placeholders filled). */
export function isDatabaseConfigured(env: Env = process.env): boolean {
  return mongoUri(env) !== null;
}

/** The database to use (MONGODB_DB, default "growthgrid"). */
export function mongoDbName(env: Env = process.env): string {
  return value(env, "MONGODB_DB") ?? "growthgrid";
}

/** "cluster0.example.mongodb.net / growthgrid": where we connect, without credentials. */
export function describeMongoTarget(env: Env = process.env): string {
  const uri = value(env, "MONGODB_URI");
  if (!uri) return "(MONGODB_URI not set)";
  const host = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri)?.[1] ?? "(unparsable MONGODB_URI)";
  return `${host} / ${mongoDbName(env)}`;
}

/** Removes anything that looks like a connection string's credentials from a message. */
export function redactCredentials(message: string): string {
  return message.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]*@/gi, "$1***:***@");
}

/** CONTENT_SOURCE=mongo: the site and the Studio read and write MongoDB. */
export function usesMongoContent(env: Env = process.env): boolean {
  return env.CONTENT_SOURCE?.trim() === "mongo";
}
