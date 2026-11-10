/**
 * Squad Optimized — Plain Concepts: PR labels and delivery metrics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — plain ESM gate script without type declarations
import * as M from '../.squad-templates/pc/scripts/pc-metrics.mjs';
import { generateGates } from '../packages/squad-cli/src/cli/core/pc/gates.js';
import { generateMetricsWorkflows, labelSet } from '../packages/squad-cli/src/cli/core/pc/metrics.js';
import { assessAidlc } from '../packages/squad-cli/src/cli/core/pc/aidlc.js';
import { clearStackCache } from '../packages/squad-cli/src/cli/core/pc/stack.js';

const pr = (n: number, o: Record<string, unknown> = {}) => ({
  number: n, title: `PR ${n}`, url: `https://x/${n}`, body: '', author: { login: 'squad[bot]' },
  createdAt: '2026-11-02T10:00:00Z', mergedAt: null, closedAt: null, additions: 10, deletions: 2,
  labels: { nodes: [{ name: 'squad' }] }, reviews: { nodes: [] }, ...o,
});

describe('labels', () => {
  it('labels squad branches, bot authors and trailer PRs', () => {
    expect(M.labelsForPr({ author: 'alice', branch: 'feature/x', body: '' })).toEqual([]);
    expect(M.labelsForPr({ author: 'alice', branch: 'squad/neo/add-login', body: '' })).toEqual(['squad', 'squad:agent:neo']);
    expect(M.labelsForPr({ author: 'copilot-swe-agent[bot]', branch: 'x', body: 'Fix\n\nSquad-Agent: Trinity\nSquad-Role: frontend\nSquad-Model: claude-sonnet-5.5' }))
      .toEqual(['squad', 'squad:agent:trinity', 'squad:role:frontend', 'squad:model:claude-sonnet-5.5']);
  });

  it('parses metadata from labels before trailers', () => {
    const meta = M.parseSquadMeta({ body: 'Squad-Agent: other', labels: [{ name: 'squad' }, { name: 'squad:agent:neo' }, { name: 'squad:auto-merged' }] });
    expect(meta).toMatchObject({ isSquad: true, agent: 'neo', autoMerged: true, humanReview: false });
  });

  it('label set includes base labels and one per role category', async () => {
    const names = (await labelSet()).map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['squad', 'squad:auto-merged', 'human-review', 'squad:role:lead', 'squad:role:tester']));
    expect(names).not.toContain('squad:role:default');
  });
});

describe('statistics', () => {
  it('percentiles, buckets, weeks and windows', () => {
    expect(M.percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(M.percentile([], 0.5)).toBeNull();
    expect([5, 10, 30, 60, 80].map(M.aiUsageBucket)).toEqual([1, 2, 3, 4, 5]);
    expect(M.weekStart('2026-11-05T12:00:00Z')).toBe('2026-11-02');
    expect(M.parseSince('7d', new Date('2026-11-10T00:00:00Z'))).toBe('2026-11-03');
    expect(M.parseSince('2026-01-01')).toBe('2026-01-01');
  });

  it('computes delivery metrics per agent, role, model and week', () => {
    const prs = [
      pr(1, { mergedAt: '2026-11-02T14:00:00Z', closedAt: '2026-11-02T14:00:00Z', labels: { nodes: [{ name: 'squad' }, { name: 'squad:agent:neo' }, { name: 'squad:role:lead' }, { name: 'squad:auto-merged' }] } }),
      pr(2, {
        mergedAt: '2026-11-03T10:00:00Z', closedAt: '2026-11-03T10:00:00Z', body: 'Squad-Agent: trinity\nSquad-Model: claude-sonnet-5.5',
        reviews: { nodes: [{ author: { login: 'alice' }, state: 'APPROVED', submittedAt: '2026-11-02T12:00:00Z' }, { author: { login: 'github-actions[bot]' }, state: 'COMMENTED', submittedAt: '2026-11-02T11:00:00Z' }] },
      }),
      pr(3, { closedAt: '2026-11-04T10:00:00Z', labels: { nodes: [{ name: 'squad' }, { name: 'human-review' }] } }),
      pr(4, { createdAt: '2026-11-09T10:00:00Z' }),
    ];
    const m = M.computeMetrics(prs, { repo: 'o/r', since: '2026-11-01', totalMergedInPeriod: 4 });
    expect(m.overall).toMatchObject({ opened: 4, merged: 2, closedUnmerged: 1, open: 1, mergeRate: 66.7, mergedByGate: 1, mergedByGatePct: 50, humanReviewFlagged: 1 });
    expect(m.overall.leadTimeHours.p50).toBe(14); // 4 h and 24 h
    expect(m.overall.firstReviewHours.p50).toBe(2); // bot review ignored
    expect(m.aiShare).toEqual({ squadMerged: 2, totalMerged: 4, pct: 50, bucket: 4 });
    expect(Object.keys(m.byAgent)).toEqual(expect.arrayContaining(['neo', 'trinity', '(unknown)']));
    expect(m.byModel['claude-sonnet-5.5'].merged).toBe(1);
    expect(Object.keys(m.byWeek)).toEqual(['2026-11-02', '2026-11-09']);

    const md = M.renderMarkdown(m);
    expect(md).toContain('# Squad delivery metrics — o/r');
    expect(md).toContain('| **Merged by the gate** (no human review) | 1 (50%) |');
    expect(md).toContain('### By agent');
    const csv = M.toCsv(m).trim().split('\n');
    expect(csv).toHaveLength(5);
    expect(csv[0]).toMatch(/^number,title,author,agent/);
  });
});

describe('GitHub fetch + CLI main', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-met-')); });
  afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('paginates the GraphQL search, counts all merged PRs and writes reports', async () => {
    const pages = [
      { data: { search: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [pr(1, { mergedAt: '2026-11-02T12:00:00Z', closedAt: '2026-11-02T12:00:00Z' })] } } },
      { data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(2)] } } },
      { data: { search: { issueCount: 10 } } },
    ];
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => pages.shift() };
    }));
    process.env.GITHUB_TOKEN = 'test-token';
    try {
      const out = path.join(dir, 'm');
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const m: any = await M.main(['--repo', 'o/r', '--since', '2026-11-01', '--out', out]);
      write.mockRestore();
      expect(calls[0].variables.q).toBe('repo:o/r is:pr label:"squad" created:>=2026-11-01');
      expect(calls[1].variables.cursor).toBe('c1');
      expect(calls[2].variables.q).toBe('repo:o/r is:pr is:merged merged:>=2026-11-01');
      expect(m.overall.opened).toBe(2);
      expect(m.aiShare.pct).toBe(10);
      expect(fs.readdirSync(out).sort()).toEqual(['metrics.json', 'prs.csv', 'report.md']);
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });
});

describe('workflows', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-wf-'));
    clearStackCache();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '5' } }));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('gates add weekly quality, labels and metrics workflows plus stryker config', () => {
    const r = generateGates(dir);
    expect(r.written).toEqual(expect.arrayContaining([
      '.github/workflows/pc-weekly-quality.yml', '.github/workflows/pc-squad-labels.yml', '.github/workflows/pc-metrics.yml',
      '.github/scripts/pc-metrics.mjs', '.github/scripts/pc-squad-labels.mjs', 'stryker.config.json',
    ]));
    const weekly = fs.readFileSync(path.join(dir, '.github/workflows/pc-weekly-quality.yml'), 'utf8');
    expect(weekly).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(weekly).toContain('@stryker-mutator/vitest-runner');
    expect(weekly).toContain('lizard src/');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'stryker.config.json'), 'utf8')).testRunner).toBe('vitest');
    const ids = assessAidlc(dir).checks.filter((c) => c.pass).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['mutation', 'dast', 'complexity', 'metrics']));
  });

  it('metrics setup writes only the labeling + metrics pieces', () => {
    const r = generateMetricsWorkflows(dir);
    expect(r.written.sort()).toEqual([
      '.github/scripts/pc-lib.mjs', '.github/scripts/pc-metrics.mjs', '.github/scripts/pc-squad-labels.mjs',
      '.github/workflows/pc-metrics.yml', '.github/workflows/pc-squad-labels.yml',
    ]);
  });
});
