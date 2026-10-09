/**
 * Seed MongoDB from the JSON files in /content.
 *
 *   npm run seed -- --check   # no database: run every document through the
 *                             # Mongoose models and verify a lossless round-trip
 *   npm run seed              # upsert all content (JSON wins for matching keys)
 *   npm run seed -- --prune   # …and delete documents no longer in JSON
 *
 * Requires MONGODB_URI (and optionally MONGODB_DB) in .env.local / .env.
 * Leads are never touched.
 */
import { isDeepStrictEqual } from "node:util";
import type { Model } from "mongoose";
import type { ZodType } from "zod";
import { rawCollections, rawPages, rawSettings } from "../src/lib/content/raw";
import { collectionNames, collectionRegistry } from "../src/lib/content/registry";
import { validateContent } from "../src/lib/content/validate";
import { connectToDatabase, disconnectFromDatabase } from "../src/lib/db/mongoose";
import { collectionModels, pageModels, SettingsModel, SETTINGS_KEY } from "../src/lib/models";
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

interface Job {
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
      label: "settings",
      model: SettingsModel as unknown as Model<unknown>,
      filter: { key: SETTINGS_KEY },
      doc: { ...(rawSettings as Record<string, unknown>), key: SETTINGS_KEY },
      zod: settingsSchema,
    },
  ];
  for (const key of Object.keys(pageSchemas) as PageKey[]) {
    jobs.push({
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

async function main() {
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

  const conn = await connectToDatabase();
  console.log(`→  Connected to "${conn.connection.db?.databaseName}". Seeding…`);

  const touched = new Map<Model<unknown>, Set<string>>();
  for (const [job, doc] of prepared) {
    await job.model.replaceOne(job.filter, doc, { upsert: true, runValidators: true });
    const [field, value] = Object.entries(job.filter)[0];
    const ids = touched.get(job.model) ?? new Set<string>();
    ids.add(`${field}:${value}`);
    touched.set(job.model, ids);
  }
  console.log(`✔  Upserted ${prepared.length} documents.`);

  if (prune) {
    let removed = 0;
    for (const name of collectionNames) {
      const { key } = collectionRegistry[name];
      const keep = (rawCollections[name] as Record<string, unknown>[]).map((i) => String(i[key]));
      const result = await collectionModels[name].deleteMany({ [key]: { $nin: keep } });
      removed += result.deletedCount ?? 0;
    }
    console.log(`✔  Pruned ${removed} stale document(s).`);
  }

  await disconnectFromDatabase();
  console.log("✔  Done. Set CONTENT_SOURCE=mongo to serve content from the database.");
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
