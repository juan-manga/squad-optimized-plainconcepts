/**
 * Curated skill recommendations (skills.sh registry + Plain Concepts Platform).
 *
 * Recommendations are computed from the detected stack and installed with the
 * skills.sh CLI (`npx skills add <repo> --skill <name>`), which writes to
 * `.agents/skills/` and links into each host (Claude, OpenCode, Copilot…).
 * Installs run sequentially (the CLI writes one shared skills-lock.json) with a
 * per-skill timeout so a slow registry never blocks the installer.
 */

import { spawn } from 'node:child_process';
import type { ProjectStack } from './stack.js';

export interface SkillRecommendation {
  id: string;
  repo: string;
  skill?: string;
  why: string;
  /** Recommended by default (pre-selected) when its condition matches. */
  core?: boolean;
  when?: (s: ProjectStack) => boolean;
}

const has = (s: ProjectStack, ...fw: string[]) => fw.some((f) => s.frameworks.includes(f));
const lang = (s: ProjectStack, ...l: string[]) => l.some((x) => s.languages.includes(x));

export const SKILL_CATALOG: SkillRecommendation[] = [
  // ── Plain Concepts Platform ────────────────────────────────────────
  { id: 'pc-onboard', repo: 'PlainConceptsPlatform/Foundations', skill: 'platform-onboard', core: true,
    why: 'Plain Concepts Platform onboarding: conventions, contract, docs layout, engineering levels.' },
  { id: 'pc-upstream', repo: 'PlainConceptsPlatform/Foundations', skill: 'platform-upstream',
    why: 'Send fixes upstream to the Platform Kitchen-Sink first (family apps).',
    when: (s) => has(s, 'Plain Concepts Platform') },
  { id: 'pc-new-project', repo: 'PlainConceptsPlatform/Foundations', skill: 'platform-new-project',
    why: 'Scaffold a new Platform app (theme, FSD, DI, i18n) the standard way.',
    when: (s) => s.sourceFiles.length < 20 },
  { id: 'pc-workflow-consumer', repo: 'PlainConceptsPlatform/agentic-workflows', skill: 'workflow-consumer',
    why: 'Adopt the Platform agentic workflows (triage/refine/implement/merge-gate) — needed for AIDLC 4–5.',
    when: (s) => s.hasCi },
  // ── Generic engineering (skills.sh) ────────────────────────────────
  { id: 'find-skills', repo: 'vercel-labs/skills', skill: 'find-skills', core: true,
    why: 'Lets agents discover and install more skills on demand instead of loading them all up front.' },
  { id: 'tdd', repo: 'mattpocock/skills', skill: 'tdd', core: true,
    why: 'Red/green/refactor discipline for agents — the base of the test guardrails.',
    when: (s) => s.hasTests || s.sourceFiles.length > 0 },
  { id: 'diagnosing-bugs', repo: 'mattpocock/skills', skill: 'diagnosing-bugs',
    why: 'Structured bug diagnosis before patching — fewer wasted agent iterations.' },
  { id: 'improve-architecture', repo: 'mattpocock/skills', skill: 'improve-codebase-architecture',
    why: 'Guided architecture improvements; pairs with the Lead role.',
    when: (s) => s.sourceFiles.length > 200 },
  { id: 'domain-modeling', repo: 'mattpocock/skills', skill: 'domain-modeling',
    why: 'Ubiquitous language & domain model before code — better specs.' },
  // ── Frontend ───────────────────────────────────────────────────────
  { id: 'frontend-design', repo: 'anthropics/skills', skill: 'frontend-design', core: true,
    why: 'High-quality UI output instead of generic AI-looking interfaces.',
    when: (s) => has(s, 'React', 'Next.js', 'Vue', 'Angular', 'Svelte') },
  { id: 'web-design-guidelines', repo: 'vercel-labs/agent-skills', skill: 'web-design-guidelines',
    why: 'Accessibility/UX review rules for web UI.',
    when: (s) => has(s, 'React', 'Next.js', 'Vue', 'Angular', 'Svelte') },
  { id: 'react-best-practices', repo: 'vercel-labs/agent-skills', skill: 'vercel-react-best-practices', core: true,
    why: 'React/Next.js performance patterns (waterfalls, bundle size, re-renders).',
    when: (s) => has(s, 'React', 'Next.js') },
  { id: 'agent-browser', repo: 'vercel-labs/agent-browser', skill: 'agent-browser',
    why: 'Lets the Tester drive a real browser for E2E verification.',
    when: (s) => has(s, 'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'ASP.NET Core') },
  // ── Azure / .NET ───────────────────────────────────────────────────
  { id: 'azure-prepare', repo: 'microsoft/azure-skills', skill: 'azure-prepare',
    why: 'Prepare apps for Azure deployment (infra, config, identity).',
    when: (s) => has(s, 'Azure SDK', 'Bicep', '.NET Aspire') },
  { id: 'azure-deploy', repo: 'microsoft/azure-skills', skill: 'azure-deploy',
    why: 'Deploy to Azure with azd/Bicep following Microsoft guidance.',
    when: (s) => has(s, 'Azure SDK', 'Bicep', '.NET Aspire') },
];

export function recommendSkills(stack: ProjectStack): SkillRecommendation[] {
  return SKILL_CATALOG.filter((r) => !r.when || r.when(stack));
}

export interface SkillInstallResult { id: string; ok: boolean; detail?: string }

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const opts = { cwd, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } };
    // Windows needs a shell to run npx.cmd; pass one pre-quoted command line (args are
    // catalog constants, never user input) instead of args + shell (DEP0190).
    const quote = (a: string) => (/^[\w@./:=,-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
    const child = process.platform === 'win32'
      ? spawn([cmd, ...args].map(quote).join(' '), { ...opts, shell: true })
      : spawn(cmd, args, opts);
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, out: out + '\n(timeout)' }); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, out: String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out }); });
  });
}

export { run as runCommand };

/** Agent ids understood by the skills.sh CLI (`-a`). */
const SKILLS_AGENT: Record<string, string> = { claude: 'claude-code', opencode: 'opencode', copilot: 'github-copilot' };

export async function installSkills(
  root: string,
  skills: SkillRecommendation[],
  hosts: string[],
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<SkillInstallResult[]> {
  const agents = hosts.map((h) => SKILLS_AGENT[h]).filter(Boolean) as string[];
  const queue = [...skills];
  const results: SkillInstallResult[] = [];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const args = ['-y', 'skills@latest', 'add', s.repo, '-y'];
      if (s.skill) args.push('--skill', s.skill);
      for (const a of agents) args.push('-a', a);
      const r = await run('npx', args, root, opts.timeoutMs ?? 120_000);
      results.push({ id: s.id, ok: r.ok, detail: r.ok ? undefined : r.out.trim().split('\n').slice(-2).join(' ') });
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 1, skills.length) }, worker));
  return results;
}
