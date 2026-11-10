// Merge gate risk classifier (Squad Optimized — Plain Concepts).
// Prints GitHub step outputs: disposition=auto-merge|human-review|skip, reason=...
import { changedFiles, numstat, readConfig } from './pc-lib.mjs';

const cfg = readConfig().mergeGate;
const author = (process.env.PR_AUTHOR || '').toLowerCase();
const labels = (process.env.PR_LABELS || '').toLowerCase().split(',').filter(Boolean);
const out = (disposition, reason) => {
  console.log(`disposition=${disposition}`);
  console.log(`reason=${reason.replace(/\n/g, ' ')}`);
  process.exit(0);
};

const isBot = cfg.botAuthors.some((b) => author.includes(b.toLowerCase())) || labels.includes('squad:auto');
if (!isBot) out('skip', 'human-authored PR: normal review rules apply');

const files = changedFiles();
const stats = numstat();
const checkpoints = [
  [files.some((f) => f.startsWith('.github/')), 'changes under .github/'],
  [files.some((f) => /(^|\/)(\.env|secrets?|.*\.pem|.*\.key)(\.|$|\/)/i.test(f)), 'touches secrets or key material'],
  [stats.total > cfg.maxChangedLines, `more than ${cfg.maxChangedLines} changed lines (${stats.total})`],
  [files.some((f) => /(^|\/)(migrations?|Migrations)\//.test(f)), 'database migration (irreversible)'],
  [labels.some((l) => ['low-confidence', 'human-review', 'security', 'breaking-change'].includes(l)), 'labelled for human review'],
];
const hits = checkpoints.filter(([hit]) => hit).map(([, why]) => why);
if (hits.length) out('human-review', hits.join('; '));
out('auto-merge', `bot PR outside human checkpoints (${files.length} files, ${stats.total} lines)`);
