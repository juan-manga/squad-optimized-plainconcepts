// AIDLC trend check (Squad Optimized — Plain Concepts).
// Compares .squad/aidlc/assessment.json in the PR with the base branch. Fails if the level
// drops or a previously passing check now fails. Prints a Markdown summary.
import { existsSync, readFileSync } from 'node:fs';
import { git } from './pc-lib.mjs';

const FILE = '.squad/aidlc/assessment.json';
const head = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
let base = null;
try { base = JSON.parse(git('show', `${process.env.BASE_SHA || 'origin/HEAD'}:${FILE}`)); } catch { /* none on base */ }

if (!head) {
  console.log('### AIDLC\n\nNo `.squad/aidlc/assessment.json` in this PR — run `squad aidlc` and commit it.');
  process.exit(0);
}
const lines = [`### AIDLC level: **${head.level}**${base ? ` (base: ${base.level})` : ''}`, ''];
const basePass = new Set((base?.checks ?? []).filter((c) => c.pass).map((c) => c.id));
const regressions = head.checks.filter((c) => !c.pass && basePass.has(c.id));
const gains = head.checks.filter((c) => c.pass && base && !basePass.has(c.id));
for (const c of gains) lines.push(`- ✅ new: ${c.label}`);
for (const c of regressions) lines.push(`- ❌ regressed: ${c.label}`);
if (!gains.length && !regressions.length) lines.push('- No change in practices.');
console.log(lines.join('\n'));
if (base && (head.level < base.level || regressions.length)) {
  console.error(`::error::AIDLC regressed (${base.level} → ${head.level}; ${regressions.length} practice(s) lost).`);
  process.exit(1);
}
