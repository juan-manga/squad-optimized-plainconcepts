/**
 * Squad Optimized — Plain Concepts: gates, gate scripts, specs→Gherkin, platform/intake,
 * Forge/OpenCode models, usage report, incremental repomap, context MCP tools.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { clearStackCache, detectStack } from '../packages/squad-cli/src/cli/core/pc/stack.js';
import { generateGates, ciCommands, pcTemplatesDir } from '../packages/squad-cli/src/cli/core/pc/gates.js';
import { parseOpenSpec, generateFeatures, GENERATED_MARKER } from '../packages/squad-cli/src/cli/core/pc/specs.js';
import { generatePlatform, generateIntake, platformProjectType } from '../packages/squad-cli/src/cli/core/pc/platform.js';
import { opencodeModelId, writeForgeProvider, relativeCost, buildUsageReport } from '../packages/squad-cli/src/cli/core/pc/models-catalog.js';
import { buildRepoMap, lastRepoMapStats } from '../packages/squad-cli/src/cli/core/pc/repomap.js';
import { callContextTool, registerContextMcp, CONTEXT_TOOLS } from '../packages/squad-cli/src/cli/core/pc/context-mcp.js';
import { writeAidlcReport, assessAidlc } from '../packages/squad-cli/src/cli/core/pc/aidlc.js';
import { readOptimizeFlags } from '../packages/squad-cli/src/cli/core/pc/optimize.js';
import { writeRoleModelOverrides } from '../packages/squad-sdk/src/config/role-models.js';

let dir: string;
const write = (rel: string, content: string) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-pcg-'));
  clearStackCache();
  write('package.json', JSON.stringify({ scripts: { test: 'vitest run' }, dependencies: { react: '19' }, devDependencies: { vitest: '5' } }));
  write('src/sum.ts', 'export function sum(a: number, b: number) { return a + b; }\n');
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('gates', () => {
  it('writes workflows, scripts and quality config for a Node/Vitest project', () => {
    const r = generateGates(dir);
    expect(r.written).toEqual(expect.arrayContaining([
      '.github/workflows/pc-quality-gates.yml', '.github/workflows/pc-pr-guardrails.yml', '.github/workflows/pc-merge-gate.yml',
      '.github/scripts/pc-spec-gate.mjs', '.github/scripts/pc-diff-check.mjs', '.github/scripts/pc-coverage-floor.mjs', 'quality.config.json',
    ]));
    const wf = fs.readFileSync(path.join(dir, '.github/workflows/pc-quality-gates.yml'), 'utf8');
    expect(wf).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(wf).toContain('vitest run --coverage');
    expect(wf).toContain('actions/setup-node@v4');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'quality.config.json'), 'utf8')).appPaths).toEqual(['src/']);
    // never clobbers user-edited workflows
    write('.github/workflows/pc-quality-gates.yml', '# mine');
    expect(generateGates(dir).skipped).toContain('.github/workflows/pc-quality-gates.yml');
  });

  it('chooses .NET and Python toolchains', () => {
    clearStackCache();
    fs.rmSync(path.join(dir, 'package.json'));
    write('App.slnx', '<Solution/>');
    expect(ciCommands(detectStack(dir)).coverage).toContain('XPlat Code Coverage');
  });

  it('moves AIDLC level-3 security checks to green', () => {
    expect(assessAidlc(dir).checks.find((c) => c.id === 'sast')!.pass).toBe(false);
    generateGates(dir);
    clearStackCache();
    const pass = assessAidlc(dir).checks.filter((c) => c.pass).map((c) => c.id);
    expect(pass).toEqual(expect.arrayContaining(['secrets', 'vulns', 'sast', 'sbom', 'spec-gate', 'coverage', 'merge-gate', 'ci']));
  });
});

describe('gate scripts (real git diff)', () => {
  const scripts = () => path.join(pcTemplatesDir(), 'scripts');
  const runScript = (name: string, env: Record<string, string> = {}) => {
    try {
      const out = execFileSync(process.execPath, [path.join(dir, '.github/scripts', name)], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (e: any) { return { code: e.status as number, out: `${e.stdout}${e.stderr}` }; }
  };
  beforeEach(() => {
    fs.mkdirSync(path.join(dir, '.github/scripts'), { recursive: true });
    for (const f of fs.readdirSync(scripts())) fs.copyFileSync(path.join(scripts(), f), path.join(dir, '.github/scripts', f));
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  });
  const commit = () => {
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'change');
  };

  it('spec gate fails app changes without spec, passes with spec + docs-impact', () => {
    write('src/feature.ts', 'export const x = 1;\n');
    commit();
    expect(runScript('pc-spec-gate.mjs', { BASE_SHA: 'HEAD~1', HEAD_SHA: 'HEAD' }).code).toBe(1);
    write('openspec/changes/add-x/proposal.md', '# Add x\n');
    commit();
    const ok = runScript('pc-spec-gate.mjs', { BASE_SHA: 'HEAD~2', HEAD_SHA: 'HEAD', PR_BODY: 'Docs-impact: none - internal constant' });
    expect(ok.code).toBe(0);
  });

  it('diff check rejects focused tests and comment-heavy code', () => {
    write('src/a.test.ts', 'it.only("x", () => { expect(1).toBe(1); });\n');
    commit();
    expect(runScript('pc-diff-check.mjs', { BASE_SHA: 'HEAD~1', HEAD_SHA: 'HEAD' }).out).toMatch(/skipped or focused/);
    const noisy = Array.from({ length: 20 }, (_, i) => `// explain step ${i}\nconst v${i} = ${i};`).join('\n');
    write('src/noisy.ts', noisy + '\n');
    commit();
    expect(runScript('pc-diff-check.mjs', { BASE_SHA: 'HEAD~1', HEAD_SHA: 'HEAD' }).out).toMatch(/Comment lines are/);
  });

  it('merge gate auto-merges small bot PRs and escalates .github changes', () => {
    write('src/b.ts', 'export const b = 2;\n');
    commit();
    const env = { BASE_SHA: 'HEAD~1', HEAD_SHA: 'HEAD', PR_AUTHOR: 'squad[bot]', PR_LABELS: '' };
    expect(runScript('pc-merge-gate.mjs', env).out).toContain('disposition=auto-merge');
    write('.github/workflows/x.yml', 'name: x\n');
    commit();
    expect(runScript('pc-merge-gate.mjs', env).out).toContain('disposition=human-review');
    expect(runScript('pc-merge-gate.mjs', { ...env, PR_AUTHOR: 'alice' }).out).toContain('disposition=skip');
  });

  it('coverage floor reads lcov and enforces the floor', () => {
    write('coverage/lcov.info', 'SF:a\nLF:10\nLH:6\nend_of_record\n');
    write('quality.config.json', JSON.stringify({ coverage: { lines: 70 } }));
    expect(runScript('pc-coverage-floor.mjs').code).toBe(1);
    write('quality.config.json', JSON.stringify({ coverage: { lines: 50 } }));
    expect(runScript('pc-coverage-floor.mjs').code).toBe(0);
  });

  it('AIDLC trend fails when the level drops', () => {
    write('.squad/aidlc/assessment.json', JSON.stringify({ level: 2, checks: [{ id: 'ci', level: 2, label: 'CI', pass: true }] }));
    commit();
    write('.squad/aidlc/assessment.json', JSON.stringify({ level: 1, checks: [{ id: 'ci', level: 2, label: 'CI', pass: false }] }));
    commit();
    const r = runScript('pc-aidlc-trend.mjs', { BASE_SHA: 'HEAD~1' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/regressed: CI/);
  });
});

describe('OpenSpec → Gherkin', () => {
  const spec = [
    '# Billing', '', '### Requirement: Expired card banner', '',
    '#### Scenario: Customer with expired card', '- **GIVEN** a customer with an expired card', '- **WHEN** they open billing', '- **THEN** a banner asks to update the card', '',
    '#### Scenario: Valid card', '- **WHEN** they open billing', '- **THEN** no banner is shown',
  ].join('\n');

  it('parses requirements and scenarios', () => {
    const reqs = parseOpenSpec(spec);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.scenarios.map((s) => s.steps.length)).toEqual([3, 2]);
  });

  it('writes feature files and keeps hand-written ones', () => {
    write('openspec/specs/billing/spec.md', spec);
    const r = generateFeatures(dir);
    expect(r.written).toEqual(['features/billing.feature']);
    expect(r.scenarios).toBe(2);
    const f = fs.readFileSync(path.join(dir, 'features/billing.feature'), 'utf8');
    expect(f.startsWith(GENERATED_MARKER)).toBe(true);
    expect(f).toContain('Scenario: Customer with expired card');
    expect(f).toContain('Given the system is in its default state');
    write('features/billing.feature', 'Feature: mine\n');
    expect(generateFeatures(dir).skipped).toEqual(['features/billing.feature']);
  });
});

describe('platform & intake', () => {
  it('writes contract, product scope and issue form', () => {
    const p = generatePlatform(dir);
    expect(p.written).toEqual(['.platform/contract.yml']);
    expect(fs.readFileSync(path.join(dir, '.platform/contract.yml'), 'utf8')).toMatch(/type: static-site/);
    expect(p.healthCommand).toContain('Project-Health-Platform');
    expect(generateIntake(dir).written).toEqual(['PRODUCT_SCOPE.md', '.github/ISSUE_TEMPLATE/business-request.yml']);
    expect(assessAidlc(dir).checks.filter((c) => ['contract', 'intake'].includes(c.id)).every((c) => c.pass)).toBe(true);
  });

  it('classifies project types', () => {
    expect(platformProjectType({ frameworks: ['React', 'ASP.NET Core'] } as any)).toBe('back-front');
    expect(platformProjectType({ frameworks: [] } as any)).toBe('other');
  });
});

describe('models & usage', () => {
  it('maps OpenCode model ids per provider', () => {
    expect(opencodeModelId('claude-sonnet-5.5')).toBe('github-copilot/claude-sonnet-5.5');
    expect(opencodeModelId('claude-sonnet-5.5', 'anthropic')).toBe('anthropic/claude-sonnet-5-5');
    expect(opencodeModelId('glm-5-2', 'forge')).toBe('forge/glm-5-2');
    expect(opencodeModelId('openai/gpt-5.5', 'forge')).toBe('openai/gpt-5.5');
  });

  it('writes the Forge provider into opencode.json without losing config', () => {
    write('opencode.json', JSON.stringify({ theme: 'dark' }));
    writeForgeProvider(dir);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8'));
    expect(cfg.theme).toBe('dark');
    expect(cfg.provider.forge.options).toEqual({ baseURL: 'https://forge.plainconcepts.com/v1', apiKey: '{env:FORGE_API_KEY}' });
    expect(cfg.model).toBe('forge/glm-5-2');
  });

  it('reports role models and relative cost offline', async () => {
    writeRoleModelOverrides(path.join(dir, '.squad'), { lead: 'claude-opus-5.5', scribe: 'claude-haiku-5.5' });
    expect(relativeCost('claude-opus-5.5')).toBeGreaterThan(relativeCost('claude-haiku-5.5'));
    const r = await buildUsageReport(dir);
    expect(r.markdown).toContain('`claude-opus-5.5`');
    expect(r.markdown).toContain('## Token economy');
  });

  it('parses provider, hosts and guardrail flags', () => {
    const f = readOptimizeFlags(['--provider', 'forge', '--hosts', 'copilot,cursor,bogus', '--no-gates', '--mcp']);
    expect(f.provider).toBe('forge');
    expect(f.hosts).toEqual(['copilot', 'cursor']);
    expect(f.gates).toBe(false);
    expect(f.mcp).toBe(true);
  });
});

describe('repomap incremental & cache-stable', () => {
  it('reuses unchanged files and produces byte-identical output', () => {
    const a = buildRepoMap(dir);
    expect(lastRepoMapStats.reused).toBe(0);
    clearStackCache();
    const b = buildRepoMap(dir);
    expect(lastRepoMapStats.reused).toBe(lastRepoMapStats.files);
    expect(b).toBe(a);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('context MCP tools', () => {
  it('serves repo map, stack, symbols and AIDLC', () => {
    expect(CONTEXT_TOOLS.map((t) => t.name)).toEqual(['repo_map', 'project_stack', 'aidlc_assessment', 'find_symbol']);
    expect(callContextTool(dir, 'repo_map', {})).toContain('src/sum.ts');
    expect(JSON.parse(callContextTool(dir, 'project_stack', {})).frameworks).toContain('React');
    expect(callContextTool(dir, 'find_symbol', { name: 'sum' })).toBe('src/sum.ts');
    expect(JSON.parse(callContextTool(dir, 'aidlc_assessment', {})).level).toBe(0);
    expect(() => callContextTool(dir, 'nope', {})).toThrow();
  });

  it('registers itself in .mcp.json, preserving other servers', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    registerContextMcp(dir);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
    expect(Object.keys(cfg.mcpServers)).toEqual(['other', 'squad-context']);
  });
});

describe('AIDLC json', () => {
  it('writes assessment.json for the trend gate', () => {
    writeAidlcReport(dir, '## Token economy\n');
    const j = JSON.parse(fs.readFileSync(path.join(dir, '.squad/aidlc/assessment.json'), 'utf8'));
    expect(j.level).toBe(0);
    expect(j.checks.length).toBeGreaterThan(20);
    expect(fs.readFileSync(path.join(dir, '.squad/aidlc/assessment.md'), 'utf8')).toContain('## Token economy');
  });
});
