// Spec & docs gate (Squad Optimized — Plain Concepts).
// App-code changes must touch a spec / OpenSpec change / decision record, and the PR must
// update docs or carry "Docs-impact: none - <reason>".
import { changedFiles, readConfig, isTestFile } from './pc-lib.mjs';

const cfg = readConfig();
const files = changedFiles();
const starts = (f, list) => list.some((p) => f === p || f.startsWith(p));
const appChanges = files.filter((f) => starts(f, cfg.appPaths) && !isTestFile(f));
const specChanges = files.filter((f) => starts(f, cfg.specPaths));
const docsChanges = files.filter((f) => starts(f, cfg.docsPaths));
const body = process.env.PR_BODY || '';
const docsImpactNone = /^\s*Docs-impact:\s*none\s*-\s*\S+/im.test(body);

const errors = [];
if (appChanges.length && !specChanges.length) {
  errors.push(`App code changed (${appChanges.length} files) but no spec, OpenSpec change or decision record was touched (${cfg.specPaths.join(', ')}).`);
}
if (appChanges.length && !docsChanges.length && !docsImpactNone) {
  errors.push('App code changed without a docs update. Update docs or add "Docs-impact: none - <reason>" to the PR description.');
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log(`Spec gate passed (app: ${appChanges.length}, specs: ${specChanges.length}, docs: ${docsChanges.length}${docsImpactNone ? ', docs-impact: none' : ''}).`);
