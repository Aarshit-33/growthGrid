/**
 * Upload the JSON files in /content to MongoDB (the one-time initial upload).
 *
 *   npm run seed -- --check   # no database: run every document through the
 *                             # Mongoose models and verify a lossless round-trip
 *   npm run seed              # upsert all content (JSON wins for matching keys)
 *   npm run seed -- --prune   # …and delete collection items no longer in JSON
 *   npm run seed -- --force   # seed even though the Studio has already edited
 *                             # the database (overwrites those edits)
 *
 * Connects with the same settings as the app (src/lib/db/uri.ts): MONGODB_URI,
 * optionally with <db_username>/<db_password> filled from MONGODB_USERNAME /
 * MONGODB_PASSWORD, and MONGODB_DB. Reads .env.local, then .env (real
 * environment variables win over both).
 *
 * Seeds settings, every page and every collection. Leads, Studio History and
 * uploaded media are never touched. After the switch, MongoDB is the source of
 * truth: use the Studio, and its "Sync content" button to create anything
 * missing without overwriting.
 */
import { isDeepStrictEqual } from "node:util";
import type { Model } from "mongoose";
import type { ZodType } from "zod";
import { rawCollections, rawPages, rawSettings } from "../src/lib/content/raw";
import { collectionNames, collectionRegistry, type CollectionName } from "../src/lib/content/registry";
import { validateContent } from "../src/lib/content/validate";
import { checkCollectionNames } from "../src/lib/db/content-store";
import { connectToDatabase, disconnectFromDatabase } from "../src/lib/db/mongoose";
import { describeMongoTarget, mongoConfigProblem, redactCredentials } from "../src/lib/db/uri";
import { collectionModels, pageModels, SettingsModel, SETTINGS_KEY } from "../src/lib/models";
import { HISTORY_COLLECTION } from "../src/lib/models/names";
import { pageSchemas, settingsSchema, type PageKey } from "../src/lib/schemas";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* optional */
  }
}

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check") || args.has("--dry-run");
const prune = args.has("--prune");
const force = args.has("--force");

/** "settings", "pages", or a collection name: one line each in the summary. */
type Group = "settings" | "pages" | CollectionName;

interface Job {
  group: Group;
  label: string;
  model: Model<unknown>;
  filter: Record<string, string>;
  doc: Record<string, unknown>;
  zod: ZodType;
}

/** Sort keys and drop undefined so structurally-equal values compare equal. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  return value;
}

function buildJobs(): Job[] {
  const jobs: Job[] = [
    {
      group: "settings",
      label: "settings",
      model: SettingsModel as unknown as Model<unknown>,
      filter: { key: SETTINGS_KEY },
      doc: { ...(rawSettings as Record<string, unknown>), key: SETTINGS_KEY },
      zod: settingsSchema,
    },
  ];
  for (const key of Object.keys(pageSchemas) as PageKey[]) {
    jobs.push({
      group: "pages",
      label: `pages › ${key}`,
      model: pageModels[key],
      filter: { key },
      doc: rawPages[key] as Record<string, unknown>,
      zod: pageSchemas[key] as ZodType,
    });
  }
  for (const name of collectionNames) {
    const { key, schema } = collectionRegistry[name];
    for (const item of rawCollections[name] as Record<string, unknown>[]) {
      jobs.push({
        group: name,
        label: `${name} › ${String(item[key])}`,
        model: collectionModels[name],
        filter: { [key]: String(item[key]) },
        doc: item,
        zod: schema,
      });
    }
  }
  return jobs;
}

/** Validate through Mongoose (incl. the Zod hook) and prove nothing is lost. */
async function check(job: Job): Promise<Record<string, unknown>> {
  const hydrated = new job.model(job.doc);
  await hydrated.validate();
  const stored = hydrated.toObject({ versionKey: false, virtuals: false }) as Record<string, unknown>;
  const roundTrip = job.zod.parse(stored);
  const expected = job.zod.parse(job.doc);
  if (!isDeepStrictEqual(normalize(roundTrip), normalize(expected))) {
    throw new Error(
      `${job.label}: data changed after passing through the Mongoose model.\n` +
        `  expected: ${JSON.stringify(normalize(expected)).slice(0, 400)}\n` +
        `  received: ${JSON.stringify(normalize(roundTrip)).slice(0, 400)}`,
    );
  }
  delete stored._id;
  return stored;
}

interface Tally {
  created: number;
  updated: number;
  unchanged: number;
  pruned: number;
}

function printSummary(tallies: Map<Group, Tally>) {
  const rows = [...tallies.entries()].map(([group, t]) => [group, t.created, t.updated, t.unchanged, t.pruned] as const);
  const width = Math.max(10, ...rows.map(([group]) => group.length));
  const line = (cells: readonly (string | number)[]) =>
    `   ${String(cells[0]).padEnd(width)}  ${cells.slice(1).map((c) => String(c).padStart(9)).join("")}`;
  console.log(line(["", "created", "updated", "unchanged", "pruned"]));
  rows.forEach((row) => console.log(line(row)));
  const total = rows.reduce((sum, row) => [0, 1, 2, 3, 4].map((i) => (i === 0 ? 0 : sum[i] + Number(row[i]))), [0, 0, 0, 0, 0]);
  console.log(line(["total", total[1], total[2], total[3], total[4]]));
}

async function main() {
  checkCollectionNames();
  const report = validateContent({ checkAssets: false });
  if (report.errors.length > 0) {
    console.error("✖  Content is invalid — fix it before seeding:\n");
    report.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const jobs = buildJobs();
  const prepared: [Job, Record<string, unknown>][] = [];
  const failures: string[] = [];
  for (const job of jobs) {
    try {
      prepared.push([job, await check(job)]);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    console.error(`✖  ${failures.length} document(s) failed the Mongoose check:\n`);
    failures.forEach((f) => console.error(`  - ${f}\n`));
    process.exit(1);
  }
  console.log(`✔  ${prepared.length} documents pass the Mongoose models with a lossless round-trip.`);

  if (checkOnly) return;

  const problem = mongoConfigProblem();
  if (problem) {
    console.error(`✖  MongoDB isn't configured: ${problem}\n   Set it in .env.local (see .env.example), then run this again.`);
    process.exit(1);
  }

  const conn = await connectToDatabase();
  const db = conn.connection.db!;
  console.log(`→  Connected to ${describeMongoTarget()}.`);

  // Once the Studio has saved to this database, it's the source of truth.
  const edits = await db.collection(HISTORY_COLLECTION).countDocuments({}, { limit: 1 });
  if (edits > 0 && !force) {
    console.error(
      "✖  The Studio has already changed content in this database (see Studio › History).\n" +
        "   Seeding would overwrite those edits with the JSON files. Use the Studio's\n" +
        "   \"Sync content\" button to create only missing content, or re-run with --force\n" +
        "   to overwrite anyway (download a backup from Sync first).",
    );
    await disconnectFromDatabase();
    process.exit(1);
  }

  console.log(`→  Seeding${prune ? " (with --prune)" : ""}…`);
  const tallies = new Map<Group, Tally>();
  const tally = (group: Group) => {
    const t = tallies.get(group) ?? { created: 0, updated: 0, unchanged: 0, pruned: 0 };
    tallies.set(group, t);
    return t;
  };
  for (const [job, doc] of prepared) {
    const result = await job.model.replaceOne(job.filter, doc, { upsert: true, runValidators: true });
    const t = tally(job.group);
    if (result.upsertedCount > 0) t.created++;
    else if (result.modifiedCount > 0) t.updated++;
    else t.unchanged++;
  }
  // Collections with no items in JSON still get a summary row.
  for (const name of collectionNames) tally(name);

  if (prune) {
    for (const name of collectionNames) {
      const { key } = collectionRegistry[name];
      const keep = (rawCollections[name] as Record<string, unknown>[]).map((i) => String(i[key]));
      const result = await collectionModels[name].deleteMany({ [key]: { $nin: keep } });
      tally(name).pruned += result.deletedCount ?? 0;
    }
  }

  printSummary(tallies);
  await disconnectFromDatabase();
  console.log(
    `✔  Done: ${prepared.length} documents in ${describeMongoTarget()}. Leads, History and media were not touched.\n` +
      "   Next: set CONTENT_SOURCE=mongo (locally and on Vercel), then manage content in the Studio.",
  );
}

main().catch(async (error) => {
  console.error(`✖  ${redactCredentials(error instanceof Error ? error.message : String(error))}`);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
