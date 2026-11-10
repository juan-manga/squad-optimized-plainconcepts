// Squad delivery metrics (Squad Optimized — Plain Concepts). Zero dependencies.
//
// Every PR produced by the agent team carries the `squad` label (plus
// `squad:agent:<name>`, `squad:role:<role>`, `squad:model:<model>` and, when the merge
// gate merges it, `squad:auto-merged`). This script pulls those PRs from GitHub
// (GraphQL) and computes delivery metrics: throughput, merge rate, lead time, time to
// first review, "merged by the gate" share, size, AI share of merged PRs, per agent /
// role / model and per week.
//
// Usage (CI or local):
//   node pc-metrics.mjs [--repo owner/name] [--since 30d|YYYY-MM-DD] [--until YYYY-MM-DD]
//                       [--label squad] [--out .squad/metrics] [--json]
// Token: GITHUB_TOKEN / GH_TOKEN, or `gh auth token`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LABELS = {
  squad: { name: 'squad', color: '5319e7', description: 'PR produced by the Squad agent team' },
  autoMerged: { name: 'squad:auto-merged', color: '0e8a16', description: 'Merged by the merge gate with no human review' },
  humanReview: { name: 'human-review', color: 'd93f0b', description: 'Merge gate: human checkpoint hit' },
};
export const AGENT_PREFIX = 'squad:agent:';
export const ROLE_PREFIX = 'squad:role:';
export const MODEL_PREFIX = 'squad:model:';

// ── Parsing ────────────────────────────────────────────────────────────────

const TRAILERS = {
  agent: /^\s*Squad-Agent:[ \t]*(\S[^\n]*?)[ \t]*$/im,
  role: /^\s*Squad-Role:[ \t]*(\S[^\n]*?)[ \t]*$/im,
  model: /^\s*Squad-Model:[ \t]*(\S[^\n]*?)[ \t]*$/im,
};

/** Squad metadata from labels first, then PR body trailers (Squad-Agent / Squad-Role / Squad-Model). */
export function parseSquadMeta(pr) {
  const labels = (pr.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  const fromLabel = (prefix) => labels.find((l) => l.startsWith(prefix))?.slice(prefix.length);
  const fromBody = (re) => re.exec(pr.body ?? '')?.[1];
  return {
    isSquad: labels.includes(LABELS.squad.name),
    agent: fromLabel(AGENT_PREFIX) ?? fromBody(TRAILERS.agent) ?? null,
    role: fromLabel(ROLE_PREFIX) ?? fromBody(TRAILERS.role) ?? null,
    model: fromLabel(MODEL_PREFIX) ?? fromBody(TRAILERS.model) ?? null,
    autoMerged: labels.includes(LABELS.autoMerged.name),
    humanReview: labels.includes(LABELS.humanReview.name),
  };
}

/** Labels a PR should carry, derived from author, branch and body trailers. */
export function labelsForPr({ author = '', branch = '', body = '', botAuthors = ['[bot]', 'copilot', 'squad'] }) {
  const a = author.toLowerCase();
  const meta = parseSquadMeta({ body, labels: [] });
  const isSquad = branch.startsWith('squad/') || botAuthors.some((b) => a.includes(b)) || !!meta.agent || /^\s*Squad-Agent:/im.test(body);
  if (!isSquad) return [];
  const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9.\-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const out = [LABELS.squad.name];
  const agent = meta.agent ?? (branch.startsWith('squad/') ? branch.split('/')[1] : null);
  if (agent) out.push(AGENT_PREFIX + slug(agent));
  if (meta.role) out.push(ROLE_PREFIX + slug(meta.role));
  if (meta.model) out.push(MODEL_PREFIX + slug(meta.model));
  return out;
}

// ── Statistics ─────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const hours = (a, b) => (new Date(b) - new Date(a)) / HOUR;
export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1);
}
const isBot = (login) => !login || /\[bot\]$|^github-actions|^copilot/i.test(login);
export function weekStart(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
/** Plain Concepts AI-usage buckets (10 / 25 / 50 / 75 %). */
export const aiUsageBucket = (pct) => (pct >= 75 ? 5 : pct >= 50 ? 4 : pct >= 25 ? 3 : pct >= 10 ? 2 : 1);

function summarize(prs) {
  const merged = prs.filter((p) => p.mergedAt);
  const closedUnmerged = prs.filter((p) => !p.mergedAt && p.closedAt);
  const lead = merged.map((p) => hours(p.createdAt, p.mergedAt));
  const firstReview = prs.map((p) => p.firstHumanReviewAt && hours(p.createdAt, p.firstHumanReviewAt)).filter((x) => x != null);
  const byGate = merged.filter((p) => p.meta.autoMerged || p.humanReviews === 0);
  const size = merged.map((p) => (p.additions ?? 0) + (p.deletions ?? 0));
  const decided = merged.length + closedUnmerged.length;
  return {
    opened: prs.length,
    merged: merged.length,
    closedUnmerged: closedUnmerged.length,
    open: prs.filter((p) => !p.closedAt).length,
    mergeRate: decided ? +(100 * merged.length / decided).toFixed(1) : null,
    leadTimeHours: { p50: percentile(lead, 0.5), p90: percentile(lead, 0.9) },
    firstReviewHours: { p50: percentile(firstReview, 0.5), p90: percentile(firstReview, 0.9) },
    mergedByGate: byGate.length,
    mergedByGatePct: merged.length ? +(100 * byGate.length / merged.length).toFixed(1) : null,
    humanReviewFlagged: prs.filter((p) => p.meta.humanReview).length,
    medianSize: percentile(size, 0.5),
  };
}

function groupBy(prs, key) {
  const groups = new Map();
  for (const p of prs) {
    const k = key(p) ?? '(unknown)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return Object.fromEntries([...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, summarize(v)]));
}

/**
 * @param raw     PR nodes (GraphQL shape or already normalized)
 * @param context { since, until, repo, totalMergedInPeriod }
 */
export function computeMetrics(raw, context = {}) {
  const prs = raw.map((p) => {
    const reviews = (p.reviews?.nodes ?? p.reviews ?? []).filter((r) => r && !isBot(r.author?.login) && r.author?.login !== p.author?.login);
    return {
      number: p.number, title: p.title, url: p.url, author: p.author?.login ?? null,
      createdAt: p.createdAt, mergedAt: p.mergedAt ?? null, closedAt: p.closedAt ?? null,
      additions: p.additions ?? 0, deletions: p.deletions ?? 0,
      humanReviews: reviews.length,
      firstHumanReviewAt: reviews.map((r) => r.submittedAt).filter(Boolean).sort()[0] ?? null,
      meta: parseSquadMeta({ body: p.body, labels: p.labels?.nodes ?? p.labels ?? [] }),
    };
  });
  const overall = summarize(prs);
  const totalMerged = context.totalMergedInPeriod;
  const aiSharePct = totalMerged ? +(100 * overall.merged / totalMerged).toFixed(1) : null;
  return {
    repo: context.repo ?? null,
    since: context.since ?? null,
    until: context.until ?? null,
    generatedAt: new Date().toISOString(),
    overall,
    aiShare: { squadMerged: overall.merged, totalMerged: totalMerged ?? null, pct: aiSharePct, bucket: aiSharePct == null ? null : aiUsageBucket(aiSharePct) },
    byAgent: groupBy(prs, (p) => p.meta.agent),
    byRole: groupBy(prs, (p) => p.meta.role),
    byModel: groupBy(prs, (p) => p.meta.model),
    byWeek: Object.fromEntries(Object.entries(groupBy(prs, (p) => weekStart(p.createdAt))).sort(([a], [b]) => a.localeCompare(b))),
    prs,
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────

const fmt = (v, unit = '') => (v == null ? '—' : `${v}${unit}`);
function table(groups, title) {
  const rows = Object.entries(groups);
  if (!rows.length || (rows.length === 1 && rows[0][0] === '(unknown)')) return '';
  return [
    `### ${title}`, '',
    '| | PRs | Merged | Merge rate | Lead time p50 | By gate |',
    '|---|---|---|---|---|---|',
    ...rows.map(([k, s]) => `| ${k} | ${s.opened} | ${s.merged} | ${fmt(s.mergeRate, '%')} | ${fmt(s.leadTimeHours.p50, ' h')} | ${fmt(s.mergedByGatePct, '%')} |`),
    '',
  ].join('\n');
}

export function renderMarkdown(m) {
  const o = m.overall;
  return [
    `# Squad delivery metrics${m.repo ? ` — ${m.repo}` : ''}`, '',
    `> Period: ${m.since ?? '…'} → ${m.until ?? 'now'} · PRs labelled \`squad\` · generated by \`squad metrics\``, '',
    '| Metric | Value |', '|---|---|',
    `| PRs opened | ${o.opened} |`,
    `| Merged / closed unmerged / open | ${o.merged} / ${o.closedUnmerged} / ${o.open} |`,
    `| Merge rate | ${fmt(o.mergeRate, '%')} |`,
    `| Lead time (open → merge) p50 / p90 | ${fmt(o.leadTimeHours.p50, ' h')} / ${fmt(o.leadTimeHours.p90, ' h')} |`,
    `| Time to first human review p50 / p90 | ${fmt(o.firstReviewHours.p50, ' h')} / ${fmt(o.firstReviewHours.p90, ' h')} |`,
    `| **Merged by the gate** (no human review) | ${o.mergedByGate} (${fmt(o.mergedByGatePct, '%')}) |`,
    `| Flagged \`human-review\` by the merge gate | ${o.humanReviewFlagged} |`,
    `| Median PR size (lines) | ${fmt(o.medianSize)} |`,
    `| AI share of merged PRs | ${fmt(m.aiShare.pct, '%')}${m.aiShare.bucket ? ` (usage ${m.aiShare.bucket}/5)` : ''} |`,
    '',
    table(m.byAgent, 'By agent'),
    table(m.byRole, 'By role'),
    table(m.byModel, 'By model'),
    table(m.byWeek, 'By week (opened)'),
  ].filter((x) => x !== '').join('\n') + '\n';
}

export function toCsv(m) {
  const head = 'number,title,author,agent,role,model,created_at,merged_at,closed_at,additions,deletions,human_reviews,auto_merged,url';
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [head, ...m.prs.map((p) => [p.number, p.title, p.author, p.meta.agent, p.meta.role, p.meta.model, p.createdAt, p.mergedAt, p.closedAt, p.additions, p.deletions, p.humanReviews, p.meta.autoMerged, p.url].map(esc).join(','))].join('\n') + '\n';
}

// ── GitHub access ──────────────────────────────────────────────────────────

export function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

export function resolveRepo(explicit) {
  if (explicit) return explicit;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[:/]([^/]+\/[^/.]+)/.exec(url)?.[1] ?? null;
  } catch { return null; }
}

export function parseSince(value, now = new Date()) {
  if (!value) value = '30d';
  const rel = /^(\d+)d$/.exec(value);
  if (rel) return new Date(now.getTime() - Number(rel[1]) * 86_400_000).toISOString().slice(0, 10);
  return value;
}

const PR_FIELDS = `number title url body createdAt mergedAt closedAt additions deletions
  author { login } labels(first: 30) { nodes { name } }
  reviews(first: 30) { nodes { author { login } state submittedAt } }`;

async function graphql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'squad-metrics' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors ?? json.message ?? res.status)}`);
  return json.data;
}

export async function fetchSquadPrs({ token, repo, since, until, label = 'squad' }) {
  const range = until ? `${since}..${until}` : `>=${since}`;
  const q = `repo:${repo} is:pr label:"${label}" created:${range}`;
  const nodes = [];
  let cursor = null;
  do {
    const data = await graphql(token, `query($q: String!, $cursor: String) {
      search(query: $q, type: ISSUE, first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { ... on PullRequest { ${PR_FIELDS} } }
      } }`, { q, cursor });
    nodes.push(...data.search.nodes.filter(Boolean));
    cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (cursor && nodes.length < 1000);
  const total = await graphql(token, 'query($q: String!) { search(query: $q, type: ISSUE, first: 1) { issueCount } }',
    { q: `repo:${repo} is:pr is:merged merged:${range}` });
  return { nodes, totalMergedInPeriod: total.search.issueCount };
}

// ── CLI ────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const val = (n) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
  return { repo: val('--repo'), since: val('--since'), until: val('--until'), label: val('--label') ?? 'squad', out: val('--out') ?? '.squad/metrics', json: argv.includes('--json') };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const repo = resolveRepo(args.repo);
  const token = resolveToken();
  if (!repo) throw new Error('Cannot determine the repository: pass --repo owner/name.');
  if (!token) throw new Error('No GitHub token: set GITHUB_TOKEN / GH_TOKEN or run `gh auth login`.');
  const since = parseSince(args.since);
  const { nodes, totalMergedInPeriod } = await fetchSquadPrs({ token, repo, since, until: args.until, label: args.label });
  const metrics = computeMetrics(nodes, { repo, since, until: args.until ?? null, totalMergedInPeriod });
  mkdirSync(args.out, { recursive: true });
  const md = renderMarkdown(metrics);
  writeFileSync(join(args.out, 'report.md'), md);
  writeFileSync(join(args.out, 'metrics.json'), JSON.stringify({ ...metrics, prs: undefined }, null, 2) + '\n');
  writeFileSync(join(args.out, 'prs.csv'), toCsv(metrics));
  process.stdout.write(args.json ? JSON.stringify({ ...metrics, prs: undefined }, null, 2) + '\n' : md);
  return metrics;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}
