/**
 * `squad metrics` — delivery metrics for PRs produced by the agent team.
 *
 * The engine is the same zero-dependency script the `pc-metrics` workflow runs in CI
 * (`templates/pc/scripts/pc-metrics.mjs`), loaded here so local and CI numbers match.
 *
 *   squad metrics [--since 30d|YYYY-MM-DD] [--until YYYY-MM-DD] [--repo owner/name] [--json]
 *   squad metrics labels [--repo owner/name]   create the squad label set in the repo
 *   squad metrics setup                        write the labeling + metrics workflows
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GREEN, RESET, DIM, YELLOW } from '../output.js';
import { pcTemplatesDir, type GeneratedFiles } from './gates.js';
import { ROLE_CATEGORIES } from '@bradygaster/squad-sdk';

type MetricsModule = {
  LABELS: Record<string, { name: string; color: string; description: string }>;
  ROLE_PREFIX: string;
  main(argv: string[]): Promise<unknown>;
  resolveToken(): string | null;
  resolveRepo(explicit?: string): string | null;
};

export async function loadMetricsEngine(): Promise<MetricsModule> {
  return import(pathToFileURL(path.join(pcTemplatesDir(), 'scripts', 'pc-metrics.mjs')).href) as Promise<MetricsModule>;
}

/** Labels to create: base set + one per role category. Agent/model labels are created on demand by the workflow. */
export async function labelSet(): Promise<Array<{ name: string; color: string; description: string }>> {
  const m = await loadMetricsEngine();
  return [
    ...Object.values(m.LABELS),
    ...ROLE_CATEGORIES.filter((c) => c.id !== 'default').map((c) => ({ name: `${m.ROLE_PREFIX}${c.id}`, color: 'c5def5', description: `Squad PR by a ${c.label} member` })),
  ];
}

export async function ensureLabels(repo: string, token: string): Promise<{ created: string[]; existing: string[] }> {
  const res = { created: [] as string[], existing: [] as string[] };
  for (const l of await labelSet()) {
    const r = await fetch(`https://api.github.com/repos/${repo}/labels`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'squad-metrics' },
      body: JSON.stringify(l),
    });
    if (r.status === 201) res.created.push(l.name);
    else if (r.status === 422) res.existing.push(l.name);
    else throw new Error(`Creating label ${l.name} failed: HTTP ${r.status}`);
  }
  return res;
}

export function generateMetricsWorkflows(root: string, force = false): GeneratedFiles {
  const out: GeneratedFiles = { written: [], skipped: [] };
  const tpl = pcTemplatesDir();
  const files: Array<[string, string, boolean]> = [
    ['workflows/pc-squad-labels.yml', '.github/workflows/pc-squad-labels.yml', force],
    ['workflows/pc-metrics.yml', '.github/workflows/pc-metrics.yml', force],
    ['scripts/pc-metrics.mjs', '.github/scripts/pc-metrics.mjs', true],
    ['scripts/pc-squad-labels.mjs', '.github/scripts/pc-squad-labels.mjs', true],
    ['scripts/pc-lib.mjs', '.github/scripts/pc-lib.mjs', true],
  ];
  for (const [src, dest, overwrite] of files) {
    const abs = path.join(root, dest);
    if (fs.existsSync(abs) && !overwrite) { out.skipped.push(dest); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(path.join(tpl, src), abs);
    out.written.push(dest);
  }
  return out;
}

export async function runMetricsCommand(root: string, args: string[]): Promise<void> {
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'report';
  const engine = await loadMetricsEngine();
  const repoIdx = args.indexOf('--repo');
  const prevCwd = process.cwd();
  process.chdir(root);
  try {
    if (sub === 'setup') {
      const r = generateMetricsWorkflows(root, args.includes('--force'));
      r.written.forEach((f) => console.log(`${GREEN}✓${RESET} ${f}`));
      r.skipped.forEach((f) => console.log(`${DIM}${f} exists — kept${RESET}`));
      console.log('Every PR from a squad/* branch, a bot/agent author or with a "Squad-Agent:" trailer will be labelled `squad`.');
      return;
    }
    if (sub === 'labels') {
      const repo = engine.resolveRepo(repoIdx !== -1 ? args[repoIdx + 1] : undefined);
      const token = engine.resolveToken();
      if (!repo || !token) throw new Error('Need a GitHub repo (--repo owner/name) and a token (GITHUB_TOKEN, GH_TOKEN or `gh auth login`).');
      const r = await ensureLabels(repo, token);
      console.log(`${GREEN}✓${RESET} ${repo}: ${r.created.length} label(s) created, ${r.existing.length} already present`);
      return;
    }
    const rest = sub === 'report' ? args.filter((a) => a !== 'report') : args;
    await engine.main(rest.includes('--out') ? rest : [...rest, '--out', path.join('.squad', 'metrics')]);
    if (!rest.includes('--json')) console.log(`${DIM}Saved .squad/metrics/report.md, metrics.json, prs.csv${RESET}`);
  } catch (err) {
    console.error(`${YELLOW}⚠ ${err instanceof Error ? err.message : err}${RESET}`);
    process.exitCode = 1;
  } finally {
    process.chdir(prevCwd);
  }
}
