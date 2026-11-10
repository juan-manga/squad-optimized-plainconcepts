// Coverage floor (Squad Optimized — Plain Concepts).
// Reads lcov.info or Cobertura XML and enforces quality.config.json → coverage.lines.
// Floors only ratchet up: never lower a floor to go green.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from './pc-lib.mjs';

const floor = readConfig().coverage.lines ?? 0;
const found = [];
const walk = (dir, depth = 0) => {
  if (depth > 6) return;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'obj'].includes(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, depth + 1);
    else if (name === 'lcov.info' || /cobertura.*\.xml$|coverage\.xml$/i.test(name)) found.push(p);
  }
};
walk('.');

let covered = 0;
let total = 0;
for (const f of found) {
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('lcov.info')) {
    for (const m of text.matchAll(/^LH:(\d+)/gm)) covered += Number(m[1]);
    for (const m of text.matchAll(/^LF:(\d+)/gm)) total += Number(m[1]);
  } else {
    const c = /lines-covered="(\d+)"/.exec(text);
    const v = /lines-valid="(\d+)"/.exec(text);
    if (c && v) { covered += Number(c[1]); total += Number(v[1]); }
  }
}

if (!found.length || total === 0) {
  console.log(floor > 0 ? '::error::No coverage report found (lcov.info / cobertura xml).' : 'No coverage report found; floor is 0 — set coverage.lines in quality.config.json.');
  process.exit(floor > 0 ? 1 : 0);
}
const pct = (100 * covered) / total;
console.log(`Line coverage: ${pct.toFixed(2)}% (floor ${floor}%) from ${found.length} report(s).`);
if (pct + 1e-9 < floor) {
  console.error(`::error::Coverage ${pct.toFixed(2)}% is below the floor ${floor}%.`);
  process.exit(1);
}
if (pct - floor >= 5) console.log(`::notice::Coverage is ${(pct - floor).toFixed(1)} points above the floor — ratchet coverage.lines up to ${Math.floor(pct)}.`);
