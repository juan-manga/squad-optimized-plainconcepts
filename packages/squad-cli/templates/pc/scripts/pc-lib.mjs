// Shared helpers for Plain Concepts gate scripts (Squad Optimized). Zero dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Changed files between BASE_SHA and HEAD_SHA (or HEAD). */
export function changedFiles() {
  const base = process.env.BASE_SHA || 'origin/HEAD';
  const head = process.env.HEAD_SHA || 'HEAD';
  return git('diff', '--name-only', `${base}...${head}`).split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Added lines per file: Map<file, string[]> */
export function addedLines() {
  const base = process.env.BASE_SHA || 'origin/HEAD';
  const head = process.env.HEAD_SHA || 'HEAD';
  const diff = git('diff', '--unified=0', '--no-color', `${base}...${head}`);
  const out = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
      if (file && !out.has(file)) out.set(file, []);
    } else if (file && line.startsWith('+') && !line.startsWith('+++')) {
      out.get(file).push(line.slice(1));
    }
  }
  return out;
}

export function numstat() {
  const base = process.env.BASE_SHA || 'origin/HEAD';
  const head = process.env.HEAD_SHA || 'HEAD';
  let added = 0;
  let removed = 0;
  for (const line of git('diff', '--numstat', `${base}...${head}`).split('\n')) {
    const [a, r] = line.split('\t');
    if (/^\d+$/.test(a)) added += Number(a);
    if (/^\d+$/.test(r)) removed += Number(r);
  }
  return { added, removed, total: added + removed };
}

export function readConfig() {
  const defaults = {
    appPaths: ['src/', 'app/', 'lib/', 'packages/', 'apps/', 'services/'],
    specPaths: ['openspec/', 'docs/decisions/', 'docs/adr/', '.squad/decisions', 'features/'],
    docsPaths: ['docs/', 'README.md', 'ARCHITECTURE.md', 'AGENTS.md'],
    coverage: { lines: 0 },
    diff: { maxCommentRatio: 0.1, maxTestToCodeRatio: 1, maxTestsPerKloc: 40 },
    mergeGate: { maxChangedLines: 10000, botAuthors: ['[bot]', 'copilot', 'squad'] },
  };
  if (!existsSync('quality.config.json')) return defaults;
  const cfg = JSON.parse(readFileSync('quality.config.json', 'utf8'));
  return { ...defaults, ...cfg, coverage: { ...defaults.coverage, ...cfg.coverage }, diff: { ...defaults.diff, ...cfg.diff }, mergeGate: { ...defaults.mergeGate, ...cfg.mergeGate } };
}

export const isTestFile = (f) => /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f) || /Tests?\.cs$/.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
export const isCodeFile = (f) => /\.(ts|tsx|js|jsx|mjs|cjs|cs|py|go|java|kt|rs|rb|php|swift)$/.test(f);
