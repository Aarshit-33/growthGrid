/**
 * Validates every JSON content file against its Zod schema, then checks
 * cross-references (services ↔ projects ↔ technologies ↔ testimonials ↔
 * authors), internal links, image assets and SEO hygiene.
 *
 *   npm run validate:content
 *   npm run validate:content -- --skip-assets   # ignore missing images
 *
 * Runs automatically before `npm run build`.
 */
import { validateContent } from "../src/lib/content/validate";

const skipAssets = process.argv.includes("--skip-assets");
const report = validateContent({ checkAssets: !skipAssets });

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
