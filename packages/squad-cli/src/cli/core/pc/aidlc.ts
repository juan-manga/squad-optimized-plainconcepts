/**
 * AIDLC (AI Development Lifecycle) maturity assessment — Squad Optimized, Plain Concepts.
 *
 * A 0–5 scale built on the Plain Concepts Platform method
 * (https://platform.plainconcepts.dev): its engineering levels L1–L3, its
 * twelve practices, the three phases (Discovery → Foundations → Maintenance
 * mode) and the agentic adoption verdicts. Levels are cumulative: a level is
 * reached only when every check of that level and the ones below passes.
 *
 *  0  Ad-hoc        — AI used ad hoc, no shared context.
 *  1  Assisted      — shared instructions for every AI host.
 *  2  Structured    — agent team + skills + specs + tests + CI.
 *  3  Guarded       — PC Engineering L1 (secrets, vulns, SAST) + spec-in-PR + docs.
 *  4  Autonomous    — PC L2 (coverage gate, Gherkin specs, SBOM) + agentic workflows
 *                     + context/token tooling: issue → PR without reading the diff.
 *  5  Self-maintaining — PC L3 (mutation, DAST, complexity) + merge gate + health:
 *                     business files requests, agents ship them (Maintenance mode).
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectStack, type ProjectStack } from './stack.js';

export interface AidlcCheck {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  pass: boolean;
  fix: string;
}

export interface AidlcReport {
  level: number;
  checks: AidlcCheck[];
  next: AidlcCheck[];
}

function exists(root: string, ...rels: string[]): boolean {
  return rels.some((r) => fs.existsSync(path.join(root, r)));
}

function readAll(root: string, files: string[]): string {
  let out = '';
  for (const f of files.slice(0, 200)) {
    try { out += '\n' + fs.readFileSync(path.join(root, f), 'utf8'); } catch { /* ignore */ }
  }
  return out;
}

function dirHasFiles(root: string, rel: string): boolean {
  try { return fs.readdirSync(path.join(root, rel)).length > 0; } catch { return false; }
}

export function assessAidlc(root: string, stackIn?: ProjectStack): AidlcReport {
  const stack = stackIn ?? detectStack(root);
  const ci = readAll(root, stack.ciFiles).toLowerCase();
  const ciHas = (...words: string[]) => words.some((w) => ci.includes(w));
  const featureFiles = hasFeatureFiles(root);

  const checks: AidlcCheck[] = [
    // ── Level 1: Assisted ───────────────────────────────────────────
    { id: 'agents-md', level: 1, label: 'AGENTS.md hub for all AI hosts', pass: exists(root, 'AGENTS.md'),
      fix: 'squad optimize instructions' },
    { id: 'host-instructions', level: 1, label: 'Host instructions (copilot-instructions.md / CLAUDE.md)', pass: exists(root, '.github/copilot-instructions.md', 'CLAUDE.md'),
      fix: 'squad optimize instructions' },
    { id: 'build-test-cmds', level: 1, label: 'Build/test commands discoverable', pass: !!(stack.commands.build || stack.commands.test),
      fix: 'Add build/test scripts (package.json, .sln, pyproject) so agents can verify their work' },
    // ── Level 2: Structured ─────────────────────────────────────────
    { id: 'squad-team', level: 2, label: 'Agent team cast (Squad)', pass: /## Members\s*\r?\n\s*\|[^\n]*\r?\n\s*\|[\s|:-]+\r?\n\s*\|\s*[^|\s]/.test(safeRead(root, '.squad/team.md')),
      fix: 'Run your host with the Squad agent and describe the project so it casts the team' },
    { id: 'skills', level: 2, label: 'Skills installed', pass: dirHasFiles(root, '.agents/skills') || dirHasFiles(root, '.github/skills') || dirHasFiles(root, '.claude/skills'),
      fix: 'squad optimize skills' },
    { id: 'openspec', level: 2, label: 'Spec-driven workflow (OpenSpec)', pass: exists(root, 'openspec/specs', 'openspec/config.yaml', 'openspec/project.md'),
      fix: 'squad optimize tools --openspec' },
    { id: 'tests', level: 2, label: 'Automated tests present', pass: stack.hasTests, fix: 'Add a test project/suite; the Tester agent can bootstrap it' },
    { id: 'ci', level: 2, label: 'CI pipeline', pass: stack.hasCi, fix: 'Add a CI workflow that builds and tests every PR' },
    { id: 'repomap', level: 2, label: 'Context map for agents (repomap/graphify)', pass: exists(root, '.squad/context/repomap.md', 'graphify-out/GRAPH_REPORT.md'),
      fix: 'squad optimize repomap' },
    // ── Level 3: Guarded (PC Engineering L1) ────────────────────────
    { id: 'secrets', level: 3, label: 'Secret scanning in CI (TruffleHog/Gitleaks)', pass: ciHas('trufflehog', 'gitleaks', 'secret-scanning', 'detect-secrets'),
      fix: 'Add TruffleHog to PR CI (Platform practice: Secrets)' },
    { id: 'vulns', level: 3, label: 'Vulnerability scanning (Trivy/Dependabot)', pass: ciHas('trivy', 'dependency-review', 'snyk', 'osv-scanner') || exists(root, '.github/dependabot.yml'),
      fix: 'Add `trivy fs` (CRITICAL/HIGH) to PR CI (Platform practice: Vulnerabilities)' },
    { id: 'sast', level: 3, label: 'SAST (Semgrep/CodeQL)', pass: ciHas('semgrep', 'codeql', 'sonar'),
      fix: 'Add `semgrep --error` to PR CI (Platform practice: SAST)' },
    { id: 'spec-gate', level: 3, label: 'Spec-in-PR gate (app changes touch spec/change/ADR)', pass: ciHas('openspec', 'spec-gate', 'decision record', 'docs-impact'),
      fix: 'Add a CI check failing app-code PRs that do not touch openspec/ or docs/decisions/' },
    { id: 'docs', level: 3, label: 'Architecture + decision records', pass: exists(root, 'ARCHITECTURE.md', 'docs/architecture.md') && exists(root, 'docs/decisions', 'docs/adr', '.squad/decisions.md'),
      fix: 'Generate ARCHITECTURE.md (C4 in Mermaid) and docs/decisions/ ADRs' },
    // ── Level 4: Autonomous delivery (PC Engineering L2) ───────────
    { id: 'coverage', level: 4, label: 'Coverage floor enforced in CI', pass: ciHas('coverage', 'collect:"xplat', 'cobertura', 'lcov') || exists(root, 'quality.config.json'),
      fix: 'Enforce per-module coverage floors (quality.config.json) — floors only ratchet up' },
    { id: 'gherkin', level: 4, label: 'Executable specs (Gherkin bound to OpenSpec)', pass: featureFiles,
      fix: 'Add .feature scenarios (Reqnroll / playwright-bdd / Cucumber) run on every PR' },
    { id: 'sbom', level: 4, label: 'SBOM generated (Syft CycloneDX)', pass: ciHas('syft', 'cyclonedx', 'sbom'),
      fix: 'Generate a CycloneDX SBOM with Syft in CI' },
    { id: 'agentic-workflows', level: 4, label: 'Agentic workflows (triage/implement routes)', pass: stack.ciFiles.some((f) => /squad-|agentic|copilot-setup|\.md$/.test(f)) || exists(root, '.github/workflows/squad-triage.yml'),
      fix: 'npx @plainconceptsplatform/workflows add --template quality-gates (or keep Squad workflows enabled)' },
    { id: 'token-tooling', level: 4, label: 'Token optimisation (RTK / economy / context tier)', pass: tokenTooling(root),
      fix: 'squad optimize tools --rtk' },
    // ── Level 5: Self-maintaining (PC Engineering L3 + Maintenance mode) ─
    { id: 'mutation', level: 5, label: 'Mutation testing (Stryker)', pass: ciHas('stryker', 'mutmut', 'pitest') || exists(root, 'stryker.config.json', 'stryker-config.json', 'stryker.conf.js'),
      fix: 'Add weekly Stryker mutation testing with a threshold' },
    { id: 'dast', level: 5, label: 'DAST (OWASP ZAP baseline)', pass: ciHas('zap', 'zaproxy', 'dast'),
      fix: 'Add an OWASP ZAP passive baseline against preview deployments' },
    { id: 'complexity', level: 5, label: 'Complexity gate (CC ≤ 15, CRAP ≤ 30)', pass: ciHas('complexity', 'lizard', 'crap', 'sonar'),
      fix: 'Add a complexity/CRAP check against a baseline' },
    { id: 'merge-gate', level: 5, label: 'Merge gate for bot PRs (auto-merge with guardrails)', pass: ciHas('merge-gate', 'merge gate', 'auto-merge', 'merge-train'),
      fix: 'Adopt the Platform merge gate route (agentic-workflows: merge-gate)' },
    { id: 'contract', level: 5, label: 'Platform contract & health registration', pass: exists(root, '.platform/contract.yml'),
      fix: 'Add .platform/contract.yml and register in Project Health (platform-onboard skill)' },
  ];

  let level = 0;
  for (let l = 1 as 1 | 2 | 3 | 4 | 5; l <= 5; l++) {
    if (checks.filter((c) => c.level === l).every((c) => c.pass)) level = l; else break;
  }
  const next = checks.filter((c) => !c.pass && c.level <= Math.min(5, level + 2)).sort((a, b) => a.level - b.level);
  return { level, checks, next };
}

function safeRead(root: string, rel: string): string {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
}

function tokenTooling(root: string): boolean {
  const cfg = safeRead(root, '.squad/config.json');
  if (/"economyMode"\s*:\s*true|"modelProfile"\s*:\s*"(balanced|economy)"|"contextTier"|"rtk"\s*:\s*true/.test(cfg)) return true;
  return exists(root, '.claude/hooks/rtk-rewrite.sh') || /rtk/.test(safeRead(root, '.claude/settings.json'));
}

function hasFeatureFiles(root: string): boolean {
  const stack = [''];
  let seen = 0;
  while (stack.length && seen < 4000) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      seen++;
      if (e.isDirectory() && !e.name.startsWith('.') && !['node_modules', 'bin', 'obj', 'dist'].includes(e.name)) stack.push(path.join(rel, e.name));
      else if (e.isFile() && e.name.endsWith('.feature')) return true;
    }
  }
  return false;
}

const LEVEL_NAMES = ['Ad-hoc', 'Assisted', 'Structured', 'Guarded', 'Autonomous delivery', 'Self-maintaining'];

export function renderAidlcReport(r: AidlcReport): string {
  const lines = [
    '# AIDLC assessment',
    '',
    `> Generated by \`squad aidlc\` on ${new Date().toISOString().slice(0, 10)}. Scale built on the Plain Concepts Platform method (https://platform.plainconcepts.dev).`,
    '',
    `## Current level: **${r.level} — ${LEVEL_NAMES[r.level]}**`,
    '',
    '| Level | Name | Meaning |',
    '|---|---|---|',
    '| 0 | Ad-hoc | AI used individually, no shared context |',
    '| 1 | Assisted | Every AI host shares the same project instructions |',
    '| 2 | Structured | Agent team, skills, specs, tests and CI |',
    '| 3 | Guarded | PC Engineering L1 + spec-in-PR + architecture/ADRs |',
    '| 4 | Autonomous delivery | PC L2 + agentic workflows: issue → PR with no one reading the diff |',
    '| 5 | Self-maintaining | PC L3 + merge gate + health: Maintenance mode |',
    '',
  ];
  for (let l = 1; l <= 5; l++) {
    lines.push(`### Level ${l} — ${LEVEL_NAMES[l]}`, '');
    for (const c of r.checks.filter((x) => x.level === l)) {
      lines.push(`- ${c.pass ? '✅' : '❌'} ${c.label}${c.pass ? '' : ` — _${c.fix}_`}`);
    }
    lines.push('');
  }
  lines.push('## Next steps (roadmap)', '');
  if (r.next.length === 0) lines.push('- Nothing pending — keep floors ratcheting up and gates as required checks.');
  r.next.forEach((c, i) => lines.push(`${i + 1}. **L${c.level}** ${c.label}: ${c.fix}`));
  lines.push('', '_The Lead owns this roadmap. Turn each step into an issue labelled `squad` so the team picks it up._', '');
  return lines.join('\n');
}

export function writeAidlcReport(root: string): { report: AidlcReport; path: string } {
  const report = assessAidlc(root);
  const out = path.join(root, '.squad', 'aidlc', 'assessment.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderAidlcReport(report));
  return { report, path: path.relative(root, out).replace(/\\/g, '/') };
}
