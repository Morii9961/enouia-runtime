// Development-only comparison. The Runtime package never imports Moriium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const legacyRoot = process.argv[2];
if (!legacyRoot) {
  throw new Error('Usage: node scripts/compare-legacy-activity.mjs <Moriium checkout>');
}

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../tests/fixtures/activity/${name}`, import.meta.url), 'utf8',
));
const legacyModule = async (path) => import(pathToFileURL(resolve(legacyRoot, path)).href);
const [{ importGitHub, importUsage, mergeActivityDays }, { importCodexUsage }, { validateActivity }] =
  await Promise.all([
    legacyModule('scripts/lib/activity-import.ts'),
    legacyModule('scripts/lib/codex-usage.ts'),
    legacyModule('src/lib/activity.ts'),
  ]);

const [githubReport, codexReport, claudeReports, oracle] = await Promise.all([
  fixture('github-calendar-v1.json'),
  fixture('codex-usage-v1.json'),
  fixture('claude-stores-v1.json'),
  fixture('legacy-source-snapshots-v1.json'),
]);
const attemptedAt = oracle.attemptedAt;
const claudeDays = new Map();
for (const report of claudeReports) {
  for (const day of importUsage(report, 'claude', attemptedAt).days) {
    claudeDays.set(day.date, (claudeDays.get(day.date) ?? 0) + day.value);
  }
}
const baseline = validateActivity({
  version: 1,
  sources: {
    github: importGitHub(githubReport, attemptedAt),
    codex: importCodexUsage(codexReport, attemptedAt),
    claude: {
      updatedAt: attemptedAt,
      timezone: 'Asia/Shanghai',
      metric: 'tokens',
      days: [...claudeDays].map(([date, value]) => ({ date, value })),
    },
  },
});
assert.deepStrictEqual(baseline, oracle.baseline);

const correction = oracle.claudeDownwardCorrection;
const legacyDays = mergeActivityDays(
  [{ date: correction.date, value: correction.previous }],
  [{ date: correction.date, value: correction.incoming }],
  correction.date,
  true,
);
assert.deepStrictEqual(legacyDays, [{ date: correction.date, value: correction.legacy }]);

const badTotalReport = structuredClone(claudeReports[0]);
badTotalReport.totals.totalTokens += 1;
assert.equal(importUsage(badTotalReport, 'claude', attemptedAt).days[0].value, 26);

console.log('Legacy baseline: three source snapshots match committed oracle.');
console.log('Legacy Claude downward correction: prior higher value retained.');
console.log('Legacy Claude report total mismatch: accepted by old importer.');
