// Decide which `squad*` labels a PR gets (Squad Optimized — Plain Concepts).
// Inputs (env): PR_AUTHOR, PR_BRANCH, PR_BODY. Output: `labels=a,b,c` for $GITHUB_OUTPUT.
import { labelsForPr } from './pc-metrics.mjs';
import { readConfig } from './pc-lib.mjs';

const labels = labelsForPr({
  author: process.env.PR_AUTHOR ?? '',
  branch: process.env.PR_BRANCH ?? '',
  body: process.env.PR_BODY ?? '',
  botAuthors: readConfig().mergeGate.botAuthors,
});
console.log(`labels=${labels.join(',')}`);
