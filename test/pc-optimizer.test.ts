/**
 * Squad Optimized — Plain Concepts: optimizer, repomap, instructions, AIDLC, role models.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectStack, clearStackCache } from '../packages/squad-cli/src/cli/core/pc/stack.js';
import { buildRepoMap, writeRepoMap } from '../packages/squad-cli/src/cli/core/pc/repomap.js';
import { generateInstructions, BLOCK_START } from '../packages/squad-cli/src/cli/core/pc/instructions.js';
import { assessAidlc } from '../packages/squad-cli/src/cli/core/pc/aidlc.js';
import { recommendSkills } from '../packages/squad-cli/src/cli/core/pc/skills-catalog.js';
import { readOptimizeFlags, applyOptimize, recommendedRoleModels } from '../packages/squad-cli/src/cli/core/pc/optimize.js';
import {
  roleCategory,
  roleIcon,
  roleModelFor,
  readRoleModelOverrides,
  writeRoleModelOverrides,
} from '../packages/squad-sdk/src/config/role-models.js';
import { persistentConfigModel } from '../packages/squad-sdk/src/agents/model-selector.js';

let dir: string;

function write(rel: string, content: string): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-pc-'));
  clearStackCache();
  write('package.json', JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' }, dependencies: { react: '19', next: '16' }, devDependencies: { vitest: '5' } }));
  write('src/core/user.ts', 'export class UserService {}\nexport function loadUser() {}\n');
  write('src/app/page.tsx', "import { UserService, loadUser } from '../core/user';\nexport default function Page() { return null; }\n");
  write('src/app/page.test.tsx', 'it("works", () => {});\n');
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('stack detection', () => {
  it('detects languages, frameworks, commands and tests', () => {
    const s = detectStack(dir);
    expect(s.languages[0]).toBe('TypeScript');
    expect(s.frameworks).toEqual(expect.arrayContaining(['React', 'Next.js', 'Vitest']));
    expect(s.commands.build).toBe('npm run build');
    expect(s.commands.test).toBe('npm test');
    expect(s.hasTests).toBe(true);
  });
});

describe('repomap', () => {
  it('ranks depended-on files first and lists symbols', () => {
    const map = buildRepoMap(dir);
    const userIdx = map.indexOf('src/core/user.ts');
    const pageIdx = map.indexOf('src/app/page.tsx');
    expect(userIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeLessThan(pageIdx);
    expect(map).toContain('UserService, loadUser');
    expect(map).not.toContain('page.test.tsx');
  });

  it('respects the token budget', () => {
    for (let i = 0; i < 300; i++) write(`src/gen/file${i}.ts`, `export function someLongFunctionName${i}() {}\n`);
    clearStackCache();
    const r = writeRepoMap(dir, { maxTokens: 500 });
    expect(r.approxTokens).toBeLessThanOrEqual(560);
    expect(fs.readFileSync(path.join(dir, r.path), 'utf8')).toMatch(/omitted to stay within budget/);
  });
});

describe('instructions', () => {
  it('writes hub + host files idempotently and keeps user content', () => {
    write('AGENTS.md', '# My rules\n\n- Never use moment.js\n');
    const opts = { hosts: ['copilot', 'claude', 'opencode'], openspec: true, repomap: true, rtk: false, graphify: false };
    const first = generateInstructions(dir, opts);
    expect(first.written).toEqual(expect.arrayContaining(['AGENTS.md', '.github/copilot-instructions.md', 'CLAUDE.md', '.github/instructions/typescript.instructions.md']));
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Never use moment.js');
    expect(agents).toContain(BLOCK_START);
    expect(agents).toContain('`npm test`');
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md');
    expect(fs.readFileSync(path.join(dir, '.github/instructions/typescript.instructions.md'), 'utf8')).toMatch(/^---\napplyTo:/);

    const second = generateInstructions(dir, opts);
    expect(second.written).toEqual([]);
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').split(BLOCK_START).length).toBe(2);
  });
});

describe('AIDLC assessment', () => {
  it('starts at 0 and reaches 1 with instructions + commands', () => {
    expect(assessAidlc(dir).level).toBe(0);
    generateInstructions(dir, { hosts: ['copilot'], openspec: false, repomap: false, rtk: false, graphify: false });
    const r = assessAidlc(dir);
    expect(r.level).toBe(1);
    expect(r.next[0]!.level).toBe(2);
  });

  it('does not count an empty Members table as a cast team', () => {
    const teamCheck = () => assessAidlc(dir).checks.find((c) => c.id === 'squad-team')!.pass;
    write('.squad/team.md', '# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n\n## Project Context\n');
    expect(teamCheck()).toBe(false);
    write('.squad/team.md', '# Team\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| Neo | Lead | x | ✅ |\n');
    expect(teamCheck()).toBe(true);
  });

  it('detects level-3 security practices from CI', () => {
    write('.github/workflows/ci.yml', 'steps:\n - uses: trufflesecurity/trufflehog@v3\n - run: trivy fs .\n - run: semgrep --error\n');
    const ids = assessAidlc(dir).checks.filter((c) => c.pass).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['secrets', 'vulns', 'sast', 'ci']));
  });
});

describe('skills catalog', () => {
  it('recommends frontend skills for a React project and not Azure ones', () => {
    const ids = recommendSkills(detectStack(dir)).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['frontend-design', 'react-best-practices', 'pc-onboard']));
    expect(ids).not.toContain('azure-deploy');
  });
});

describe('role models & icons', () => {
  it('maps roles to categories and icons', () => {
    expect(roleCategory('Tech Lead')).toBe('lead');
    expect(roleCategory('QA Engineer')).toBe('tester');
    expect(roleCategory('Frontend Dev')).toBe('frontend');
    expect(roleIcon('Backend Dev')).toBe('🔧');
    expect(roleIcon('Mystery')).toBe('👤');
  });

  it('persists role overrides and resolves them in the config layer', () => {
    const squad = path.join(dir, '.squad');
    writeRoleModelOverrides(squad, { lead: 'claude-opus-5.5', default: 'claude-sonnet-5.5' });
    const ov = readRoleModelOverrides(squad);
    expect(roleModelFor(ov, 'Architect')).toBe('claude-opus-5.5');
    expect(roleModelFor(ov, 'Tester')).toBe('claude-sonnet-5.5');
    expect(persistentConfigModel({ roleModelOverrides: ov, defaultModel: 'x' }, 'neo', 'Lead')).toBe('claude-opus-5.5');
    expect(persistentConfigModel({ agentModelOverrides: { neo: 'gpt-5.5' }, roleModelOverrides: ov }, 'neo', 'Lead')).toBe('gpt-5.5');
    expect(persistentConfigModel({ roleModelOverrides: ov, defaultModel: 'x' }, 'neo')).toBe('x');
  });
});

describe('optimizer', () => {
  it('parses flags', () => {
    const f = readOptimizeFlags(['init', '--yes', '--no-openspec', '--skills', 'tdd,find-skills', '--models', 'lead=claude-opus-5.5,tester=claude-haiku-5.5', '--offline']);
    expect(f.enabled).toBe(true);
    expect(f.openspec).toBe(false);
    expect(f.skills).toEqual(['tdd', 'find-skills']);
    expect(f.models).toEqual({ lead: 'claude-opus-5.5', tester: 'claude-haiku-5.5' });
    expect(f.offline).toBe(true);
    expect(readOptimizeFlags(['init']).enabled).toBeUndefined();
    expect(readOptimizeFlags(['init', '--no-optimize']).enabled).toBe(false);
  });

  it('applies offline: models, repomap, instructions, AIDLC report, recorded choices', async () => {
    await applyOptimize(dir, { offline: true, hosts: ['copilot', 'claude'] });
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.squad/config.json'), 'utf8'));
    expect(cfg.roleModelOverrides).toEqual(recommendedRoleModels());
    expect(cfg.plainConcepts.hosts).toEqual(['copilot', 'claude']);
    expect(fs.existsSync(path.join(dir, '.squad/context/repomap.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, '.squad/aidlc/assessment.md'), 'utf8')).toMatch(/Current level: \*\*\d/);
  });
});
