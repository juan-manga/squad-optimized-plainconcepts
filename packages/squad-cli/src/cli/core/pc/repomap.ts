/**
 * Built-in repo map (Aider-style, zero dependencies).
 *
 * Writes `.squad/context/repomap.md`: a token-budgeted outline of the codebase
 * (files + top-level symbols), ranked by how often each file's symbols are
 * referenced elsewhere. Agents read this one file instead of globbing and
 * opening dozens of files to orient themselves — the single biggest token and
 * latency saver for every spawn.
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectStack } from './stack.js';

const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  ts: [
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|abstract\s+class)\s+([A-Za-z_$][\w$]*)/,
  ],
  py: [/^(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^class\s+([A-Za-z_]\w*)/],
  cs: [/^\s*(?:public|internal)\s+(?:static\s+|sealed\s+|abstract\s+|partial\s+|record\s+)*(?:class|interface|record|enum|struct)\s+([A-Za-z_]\w*)/,
       /^\s{4,8}public\s+(?:static\s+|async\s+|virtual\s+|override\s+)*[\w<>\[\],?\s]+\s+([A-Z]\w*)\s*\(/],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/, /^type\s+([A-Z]\w*)/],
  java: [/^\s*public\s+(?:static\s+|final\s+|abstract\s+)*(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/],
  rs: [/^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_]\w*)/],
};

function patternsFor(file: string): RegExp[] {
  const ext = path.extname(file).toLowerCase();
  if (['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return SYMBOL_PATTERNS.ts!;
  if (ext === '.py') return SYMBOL_PATTERNS.py!;
  if (ext === '.cs') return SYMBOL_PATTERNS.cs!;
  if (ext === '.go') return SYMBOL_PATTERNS.go!;
  if (ext === '.java' || ext === '.kt') return SYMBOL_PATTERNS.java!;
  if (ext === '.rs') return SYMBOL_PATTERNS.rs!;
  return [];
}

type RepoMapCache = Record<string, { size: number; mtime: number; syms: string[]; words: string[] }>;

/** Stats of the last build (files mapped, files reused from cache). */
export let lastRepoMapStats = { files: 0, reused: 0 };

export interface RepoMapResult {
  path: string;
  files: number;
  symbols: number;
  approxTokens: number;
}

/** Rough token estimate (≈4 chars/token) — good enough for budgeting. */
export const approxTokens = (s: string): number => Math.ceil(s.length / 4);

export function buildRepoMap(root: string, opts: { maxTokens?: number } = {}): string {
  const maxTokens = opts.maxTokens ?? 4000;
  const stack = detectStack(root);
  const isTest = (f: string) => /(^|\/)(tests?|__tests__|spec|fixtures?)\//i.test(f) || /\.(test|spec)\./i.test(f);
  const files = stack.sourceFiles.filter((f) => !isTest(f) && !/\.d\.ts$/.test(f)).slice(0, 3000);

  // Incremental: unchanged files (same size + mtime) reuse cached symbols and identifiers.
  const cachePath = path.join(root, '.squad', 'context', 'repomap.cache.json');
  let cache: RepoMapCache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* cold start */ }
  const nextCache: RepoMapCache = {};
  let reused = 0;

  const defs = new Map<string, string[]>();
  const words = new Map<string, string[]>();
  const wordRe = /[A-Za-z_$][\w$]{3,}/g;
  for (const f of files) {
    let stat: fs.Stats;
    try { stat = fs.statSync(path.join(root, f)); } catch { continue; }
    if (stat.size > 300_000) continue;
    const hit = cache[f];
    if (hit && hit.size === stat.size && hit.mtime === stat.mtimeMs) {
      defs.set(f, hit.syms);
      words.set(f, hit.words);
      nextCache[f] = hit;
      reused++;
      continue;
    }
    let text: string;
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    const pats = patternsFor(f);
    const syms: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      for (const p of pats) {
        const m = p.exec(line);
        if (m?.[1] && !syms.includes(m[1])) syms.push(m[1]);
      }
      if (syms.length >= 25) break;
    }
    const uniq = [...new Set(text.match(wordRe) ?? [])].slice(0, 2000);
    defs.set(f, syms);
    words.set(f, uniq);
    nextCache[f] = { size: stat.size, mtime: stat.mtimeMs, syms, words: uniq };
  }
  lastRepoMapStats = { files: defs.size, reused };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(nextCache));
  } catch { /* cache is optional */ }

  // Rank: how many *other* files mention a file's symbols (cheap PageRank proxy).
  const symbolOwner = new Map<string, string>();
  for (const [f, syms] of defs) for (const s of syms) if (s.length > 3 && !symbolOwner.has(s)) symbolOwner.set(s, f);
  const score = new Map<string, number>([...defs.keys()].map((f) => [f, 0]));
  for (const [f, ws] of words) {
    for (const w of ws) {
      const owner = symbolOwner.get(w);
      if (owner && owner !== f) score.set(owner, (score.get(owner) ?? 0) + 1);
    }
  }
  const ranked = [...defs.keys()].sort((a, b) => (score.get(b)! - score.get(a)!) || a.localeCompare(b));

  const header = [
    '# Repo map',
    '',
    // No timestamp: identical code → byte-identical map, so prompt caches keep hitting.
    `> Generated by \`squad optimize repomap\`. Token budget: ~${maxTokens}.`,
    '> Read this before searching the codebase. Files are ranked by how much the rest of the code depends on them.',
    '> Regenerate after large refactors: `squad optimize repomap`.',
    '',
    `**Languages:** ${stack.languages.join(', ') || 'unknown'}  `,
    `**Frameworks:** ${stack.frameworks.join(', ') || '—'}  `,
    `**Top-level dirs:** ${stack.topDirs.map((d) => `\`${d}/\``).join(' ') || '—'}`,
    '',
    '## Files (most depended-on first)',
    '',
  ].join('\n');

  let body = '';
  let omitted = 0;
  for (const f of ranked) {
    const syms = defs.get(f)!;
    const line = syms.length ? `- \`${f}\` — ${syms.slice(0, 12).join(', ')}${syms.length > 12 ? ', …' : ''}\n` : `- \`${f}\`\n`;
    if (approxTokens(header + body + line) > maxTokens) { omitted++; continue; }
    body += line;
  }
  const footer = omitted ? `\n_${omitted} lower-ranked files omitted to stay within budget._\n` : '';
  return header + body + footer;
}

export function writeRepoMap(root: string, opts: { maxTokens?: number } = {}): RepoMapResult {
  const content = buildRepoMap(root, opts);
  const out = path.join(root, '.squad', 'context', 'repomap.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content);
  return {
    path: path.relative(root, out).replace(/\\/g, '/'),
    files: (content.match(/^- `/gm) ?? []).length,
    symbols: (content.match(/, /g) ?? []).length,
    approxTokens: approxTokens(content),
  };
}
