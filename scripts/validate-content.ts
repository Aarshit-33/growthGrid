/**
 * Validates every JSON content file against its Zod schema, then checks
 * cross-references (services ↔ projects ↔ technologies ↔ testimonials ↔
 * authors), internal links, image assets and SEO hygiene.
 *
 *   npm run validate:content
 *   npm run validate:content -- --skip-assets   # ignore missing images
 *
 * Runs automatically before `npm run build`.
 *
 * With CONTENT_SOURCE=mongo, images uploaded in the Studio live in the media
 * database: they count too (a missing image is only a warning when the
 * database can't be reached).
 */
import { validateContent } from "../src/lib/content/validate";
import { disconnectFromDatabase } from "../src/lib/db/mongoose";
import { prepareMediaIndex } from "../src/lib/media/gridfs";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* optional */
  }
}

const skipAssets = process.argv.includes("--skip-assets");

async function main() {
  const media = skipAssets ? undefined : await prepareMediaIndex();
  await disconnectFromDatabase();
  const report = validateContent({ checkAssets: !skipAssets, media });

  const summary = Object.entries(report.counts)
    .map(([name, count]) => `${name}: ${count}`)
    .join(" · ");

  if (report.warnings.length > 0) {
    console.warn(`\n⚠  ${report.warnings.length} warning(s)`);
    for (const warning of report.warnings) console.warn(`  - ${warning}`);
  }

  if (report.errors.length > 0) {
    console.error(`\n✖  Content validation failed with ${report.errors.length} error(s):\n`);
    for (const error of report.errors) console.error(`  - ${error}`);
    console.error("");
    process.exit(1);
  }

  console.log(`\n✔  Content is valid${summary ? `  (${summary})` : ""}${skipAssets ? "  [assets skipped]" : ""}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
