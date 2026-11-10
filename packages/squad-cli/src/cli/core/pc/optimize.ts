/**
 * Squad Optimized — Plain Concepts: installer wizard + `squad optimize`.
 *
 * Asks (or reads from flags):
 *   1. which AI hosts to support (Copilot, Claude Code, OpenCode)
 *   2. whether to use OpenSpec for spec-driven changes
 *   3. which model each kind of team member uses
 *   4. which skills to install (skills.sh + Plain Concepts Platform)
 *   5. which token/speed accelerators to enable (repomap, RTK, graphify)
 * then generates project instructions, the repo map and the AIDLC assessment.
 *
 * Local generators run first (milliseconds); network installs run afterwards
 * concurrently (OpenSpec ∥ skills ∥ RTK/graphify) so the wizard stays fast.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ROLE_CATEGORIES,
  writeRoleModelOverrides,
  writeModelPreference,
  type TeamRoleCategory,
} from '@bradygaster/squad-sdk';
import { BOLD, DIM, GREEN, RESET, YELLOW } from '../output.js';
import { detectStack } from './stack.js';
import { generateInstructions } from './instructions.js';
import { writeRepoMap } from './repomap.js';
import { recommendSkills, installSkills, SKILL_CATALOG, type SkillRecommendation } from './skills-catalog.js';
import { setupOpenSpec, setupRtk, setupGraphify, type ToolResult } from './tools.js';
import { writeAidlcReport } from './aidlc.js';

const CYAN = '\x1b[36m';

export const PC_HOSTS = ['copilot', 'claude', 'opencode'] as const;

/** Recommended model per tier (GitHub Copilot / Claude Code ids). */
export const TIER_MODELS = {
  premium: 'claude-opus-5.5',
  standard: 'claude-sonnet-5.5',
  fast: 'claude-haiku-5.5',
} as const;

export interface OptimizeOptions {
  hosts?: string[];
  openspec?: boolean;
  /** 'recommended' | 'none' | explicit skill ids */
  skills?: 'recommended' | 'none' | string[];
  rtk?: boolean;
  graphify?: boolean;
  repomap?: boolean;
  instructions?: boolean;
  /** 'recommended' | 'auto' | explicit role → model map */
  models?: 'recommended' | 'auto' | Partial<Record<TeamRoleCategory, string>>;
  defaultModel?: string;
  /** Skip every network install (OpenSpec, skills, RTK, graphify). */
  offline?: boolean;
  /** Accept recommended answers without prompting. */
  yes?: boolean;
}

/** Parse optimizer flags from argv. Returns undefined fields for absent flags. */
export function readOptimizeFlags(args: readonly string[]): OptimizeOptions & { enabled: boolean | undefined } {
  const val = (name: string): string | undefined => {
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1]!.startsWith('--')) return args[i + 1];
    const eq = args.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.slice(name.length + 1) : undefined;
  };
  const bool = (name: string): boolean | undefined =>
    args.includes(`--${name}`) ? true : args.includes(`--no-${name}`) ? false : undefined;

  const o: OptimizeOptions & { enabled: boolean | undefined } = {
    enabled: args.includes('--no-optimize') ? false : (args.includes('--optimize') || args.includes('--yes') || args.includes('-y')) ? true : undefined,
    yes: args.includes('--yes') || args.includes('-y'),
    openspec: bool('openspec'),
    rtk: bool('rtk'),
    graphify: bool('graphify'),
    repomap: bool('repomap'),
    instructions: bool('instructions'),
    offline: args.includes('--offline'),
    defaultModel: val('--default-model'),
  };
  const skills = val('--skills');
  if (skills) o.skills = skills === 'recommended' || skills === 'none' ? skills : skills.split(',').map((s) => s.trim()).filter(Boolean);
  const models = val('--models');
  if (models) {
    if (models === 'recommended' || models === 'auto') o.models = models;
    else {
      const map: Partial<Record<TeamRoleCategory, string>> = {};
      for (const pair of models.split(',')) {
        const [k, v] = pair.split('=').map((s) => s?.trim());
        if (k && v && ROLE_CATEGORIES.some((c) => c.id === k)) map[k as TeamRoleCategory] = v;
      }
      o.models = map;
    }
  }
  return o;
}

export function recommendedRoleModels(): Partial<Record<TeamRoleCategory, string>> {
  const out: Partial<Record<TeamRoleCategory, string>> = {};
  for (const c of ROLE_CATEGORIES) out[c.id] = TIER_MODELS[c.tier];
  return out;
}

type Ask = (q: string) => Promise<string>;

const yesNo = async (ask: Ask, q: string, def: boolean): Promise<boolean> => {
  const a = (await ask(`  ${q} ${def ? '[Y/n]' : '[y/N]'}: `)).trim().toLowerCase();
  return a === '' ? def : a === 'y' || a === 'yes' || a === 's' || a === 'si' || a === 'sí';
};

/** Interactive questions. Fills only fields that flags did not already set. */
async function askQuestions(o: OptimizeOptions, ask: Ask, root: string): Promise<OptimizeOptions> {
  const stack = detectStack(root);
  console.log();
  console.log(`${CYAN}${BOLD}◆ Squad Optimized — Plain Concepts${RESET}`);
  console.log(`${DIM}  Detected: ${[...stack.languages.slice(0, 3), ...stack.frameworks.slice(0, 5)].join(', ') || 'empty project'}${RESET}`);
  console.log();

  if (!o.hosts) {
    const a = (await ask(`  AI hosts to support ${DIM}(copilot, claude, opencode)${RESET} [all]: `)).trim().toLowerCase();
    o.hosts = a === '' || a === 'all' ? [...PC_HOSTS] : a.split(/[ ,]+/).filter((h) => (PC_HOSTS as readonly string[]).includes(h));
    if (o.hosts.length === 0) o.hosts = [...PC_HOSTS];
  }
  o.openspec ??= await yesNo(ask, `Use ${BOLD}OpenSpec${RESET} for spec-driven changes (proposal → design → tasks → spec)?`, true);

  if (!o.models) {
    console.log();
    console.log(`  ${BOLD}Model per team member${RESET}`);
    console.log(`  ${DIM}[1] Recommended: Lead/Security/Reviewers → ${TIER_MODELS.premium}, devs/testers → ${TIER_MODELS.standard}, Scribe/Docs/Ralph → ${TIER_MODELS.fast}${RESET}`);
    console.log(`  ${DIM}[2] Choose per role   [3] Auto (Squad picks per task)${RESET}`);
    const a = (await ask('  Choice [1]: ')).trim();
    if (a === '3') o.models = 'auto';
    else if (a === '2') {
      const map: Partial<Record<TeamRoleCategory, string>> = {};
      for (const c of ROLE_CATEGORIES) {
        const def = TIER_MODELS[c.tier];
        const m = (await ask(`    ${c.icon}  ${c.label.padEnd(26)} [${def}]: `)).trim();
        map[c.id] = m || def;
      }
      o.models = map;
    } else o.models = 'recommended';
  }

  if (!o.skills) {
    const recs = recommendSkills(stack);
    console.log();
    console.log(`  ${BOLD}Recommended skills${RESET} ${DIM}(skills.sh + Plain Concepts Platform; * = pre-selected)${RESET}`);
    recs.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.core ? '*' : ' '} ${r.id.padEnd(24)} ${DIM}${r.why}${RESET}`));
    const a = (await ask(`  Install [Enter = *, "all", "none", or numbers e.g. 1,3,5]: `)).trim().toLowerCase();
    if (a === 'none' || a === 'n') o.skills = 'none';
    else if (a === 'all') o.skills = recs.map((r) => r.id);
    else if (a === '') o.skills = 'recommended';
    else o.skills = a.split(/[ ,]+/).map((n) => recs[Number(n) - 1]?.id).filter(Boolean) as string[];
  }

  console.log();
  console.log(`  ${BOLD}Token & speed optimisations${RESET}`);
  o.repomap ??= await yesNo(ask, 'Generate a token-budgeted repo map for agents (.squad/context/repomap.md)?', true);
  o.rtk ??= await yesNo(ask, `Enable ${BOLD}RTK${RESET} (compacts shell output, ~60–90% fewer tokens on git/test/build)?`, true);
  o.graphify ??= await yesNo(ask, `Enable ${BOLD}graphify${RESET} knowledge graph (needs Python; best for large repos)?`, stack.sourceFiles.length > 500);
  o.instructions ??= await yesNo(ask, 'Generate project instructions (AGENTS.md, copilot-instructions, CLAUDE.md)?', true);
  return o;
}

function withDefaults(o: OptimizeOptions, root: string): Required<Omit<OptimizeOptions, 'defaultModel' | 'yes'>> & Pick<OptimizeOptions, 'defaultModel'> {
  return {
    hosts: o.hosts && o.hosts.length ? o.hosts : [...PC_HOSTS],
    openspec: o.openspec ?? true,
    skills: o.skills ?? 'recommended',
    rtk: o.rtk ?? true,
    graphify: o.graphify ?? false,
    repomap: o.repomap ?? true,
    instructions: o.instructions ?? true,
    models: o.models ?? 'recommended',
    offline: o.offline ?? false,
    defaultModel: o.defaultModel,
  };
}

function resolveSkills(sel: OptimizeOptions['skills'], root: string): SkillRecommendation[] {
  if (sel === 'none') return [];
  const recs = recommendSkills(detectStack(root));
  if (!sel || sel === 'recommended') return recs.filter((r) => r.core);
  return sel.map((id) => SKILL_CATALOG.find((r) => r.id === id)).filter(Boolean) as SkillRecommendation[];
}

function recordChoices(squadDir: string, o: ReturnType<typeof withDefaults>, skills: SkillRecommendation[]): void {
  const file = path.join(squadDir, 'config.json');
  let cfg: Record<string, unknown> = { version: 1 };
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new */ }
  cfg.plainConcepts = {
    hosts: o.hosts, openspec: o.openspec, rtk: o.rtk, graphify: o.graphify, repomap: o.repomap,
    skills: skills.map((s) => s.id), optimizedAt: new Date().toISOString(),
  };
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

export interface OptimizeRun { interactive: boolean; ask?: Ask }

/**
 * Run the optimizer against `root` (team root containing `.squad/`).
 * In non-interactive runs it applies flag values on top of recommended defaults.
 */
export async function runOptimize(root: string, input: OptimizeOptions, run: OptimizeRun): Promise<void> {
  await applyOptimize(root, await collectOptimizeAnswers(root, input, run));
}

/** Ask the wizard questions (interactive) or keep flag values. Does not write anything. */
export async function collectOptimizeAnswers(root: string, input: OptimizeOptions, run: OptimizeRun): Promise<OptimizeOptions> {
  const o = { ...input };
  if (run.interactive && !o.yes && run.ask) return askQuestions(o, run.ask, root);
  return o;
}

/** Apply answers: models, generators, installs, AIDLC report. */
export async function applyOptimize(root: string, answers: OptimizeOptions): Promise<void> {
  const squadDir = path.join(root, '.squad');
  const opts = withDefaults(answers, root);
  const skills = resolveSkills(opts.skills, root);
  const started = Date.now();

  console.log();
  // 1. Models per role (before casting, so casting applies them).
  if (opts.models !== 'auto') {
    const map = opts.models === 'recommended' ? recommendedRoleModels() : opts.models;
    writeRoleModelOverrides(squadDir, map);
    console.log(`${GREEN}✓${RESET} Model per role saved (.squad/config.json → roleModelOverrides)`);
  }
  if (opts.defaultModel) writeModelPreference(squadDir, opts.defaultModel);

  // 2. Local generators (fast, no network).
  if (opts.repomap) {
    const r = writeRepoMap(root);
    console.log(`${GREEN}✓${RESET} ${r.path} ${DIM}(${r.files} files, ~${r.approxTokens} tokens)${RESET}`);
  }
  // 3. Network installs, concurrently.
  const installed = { rtk: false, graphify: false };
  if (!opts.offline) {
    const jobs: Array<Promise<ToolResult[]>> = [];
    if (opts.openspec && !fs.existsSync(path.join(root, 'openspec'))) jobs.push(setupOpenSpec(root, opts.hosts).then((r) => [r]));
    if (skills.length) {
      console.log(`${DIM}  Installing ${skills.length} skill(s): ${skills.map((s) => s.id).join(', ')}…${RESET}`);
      jobs.push(installSkills(root, skills, opts.hosts).then((rs) => rs.map((r) => ({
        tool: `skill:${r.id}`, ok: r.ok, message: r.ok ? `skill ${r.id} installed` : `skill ${r.id} failed — ${r.detail ?? ''}`,
      }))));
    }
    if (opts.rtk) jobs.push(setupRtk(root, opts.hosts));
    if (opts.graphify) jobs.push(setupGraphify(root, opts.hosts));
    for (const r of (await Promise.all(jobs)).flat()) {
      console.log(r.ok ? `${GREEN}✓${RESET} ${r.message}` : `${YELLOW}⚠ ${r.message}${RESET}`);
      if (r.ok && r.tool.startsWith('rtk')) installed.rtk = true;
      if (r.ok && r.tool.startsWith('graphify')) installed.graphify = true;
    }
  } else if (opts.openspec || skills.length || opts.rtk || opts.graphify) {
    console.log(`${DIM}  Offline: skipped OpenSpec/skills/RTK/graphify installs — run later: squad optimize tools${RESET}`);
  }

  // Instructions after installs, so they only mention tools that are really there.
  if (opts.instructions) {
    const r = generateInstructions(root, {
      hosts: opts.hosts,
      openspec: fs.existsSync(path.join(root, 'openspec')),
      repomap: opts.repomap,
      rtk: installed.rtk,
      graphify: installed.graphify || fs.existsSync(path.join(root, 'graphify-out')),
    });
    for (const f of r.written) console.log(`${GREEN}✓${RESET} ${f}`);
  }
  recordChoices(squadDir, { ...opts, rtk: installed.rtk, graphify: installed.graphify }, skills);

  // 4. AIDLC assessment last, so it reflects everything above.
  const { report, path: reportPath } = writeAidlcReport(root);
  console.log(`${GREEN}✓${RESET} ${reportPath} ${DIM}— AIDLC level ${BOLD}${report.level}${RESET}${DIM}/5, next: ${report.next.slice(0, 2).map((c) => c.label).join('; ') || '—'}${RESET}`);
  console.log(`${DIM}  Optimizer finished in ${((Date.now() - started) / 1000).toFixed(1)}s${RESET}`);
}

/** `squad optimize [all|instructions|repomap|skills|tools|models] [flags]` */
export async function runOptimizeCommand(root: string, args: string[]): Promise<void> {
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'all';
  const flags = readOptimizeFlags(args);
  const stack = detectStack(root);
  const cfgHosts = readConfiguredHosts(root);
  const hosts = flags.hosts ?? cfgHosts ?? [...PC_HOSTS];
  switch (sub) {
    case 'repomap': {
      const tokIdx = args.indexOf('--tokens');
      const r = writeRepoMap(root, { maxTokens: tokIdx !== -1 ? Number(args[tokIdx + 1]) || 4000 : 4000 });
      console.log(`${GREEN}✓${RESET} ${r.path} (${r.files} files, ~${r.approxTokens} tokens)`);
      return;
    }
    case 'instructions': {
      const cfg = readPcConfig(root);
      const r = generateInstructions(root, { hosts, openspec: cfg.openspec ?? fs.existsSync(path.join(root, 'openspec')), repomap: true, rtk: cfg.rtk ?? false, graphify: cfg.graphify ?? false });
      r.written.forEach((f) => console.log(`${GREEN}✓${RESET} ${f}`));
      if (!r.written.length) console.log(`${DIM}Instructions already up to date.${RESET}`);
      return;
    }
    case 'skills': {
      const recs = recommendSkills(stack);
      if (args.includes('--list') || !flags.skills) {
        console.log(`\n${BOLD}Recommended skills for this project${RESET} (* = core)\n`);
        recs.forEach((r) => console.log(`  ${r.core ? '*' : ' '} ${r.id.padEnd(24)} npx skills add ${r.repo}${r.skill ? ` --skill ${r.skill}` : ''}\n      ${DIM}${r.why}${RESET}`));
        console.log(`\nInstall: squad optimize skills --skills recommended | all | id1,id2\n`);
        if (!flags.skills) return;
      }
      const sel = flags.skills === 'recommended' ? recs.filter((r) => r.core)
        : flags.skills === 'none' ? [] : (flags.skills as string[]).includes('all') ? recs : resolveSkills(flags.skills, root);
      for (const r of await installSkills(root, sel, hosts)) console.log(r.ok ? `${GREEN}✓${RESET} ${r.id}` : `${YELLOW}⚠ ${r.id}: ${r.detail}${RESET}`);
      return;
    }
    case 'tools': {
      const all = flags.openspec === undefined && flags.rtk === undefined && flags.graphify === undefined;
      const jobs: Array<Promise<ToolResult[]>> = [];
      if (all || flags.openspec) jobs.push(setupOpenSpec(root, hosts).then((r) => [r]));
      if (all || flags.rtk) jobs.push(setupRtk(root, hosts));
      if (flags.graphify) jobs.push(setupGraphify(root, hosts));
      for (const r of (await Promise.all(jobs)).flat()) console.log(r.ok ? `${GREEN}✓${RESET} ${r.message}` : `${YELLOW}⚠ ${r.message}${RESET}`);
      return;
    }
    case 'models': {
      const map = flags.models && flags.models !== 'recommended' && flags.models !== 'auto' ? flags.models : recommendedRoleModels();
      if (flags.models === 'auto') writeRoleModelOverrides(path.join(root, '.squad'), null);
      else writeRoleModelOverrides(path.join(root, '.squad'), map);
      console.log(`${GREEN}✓${RESET} roleModelOverrides ${flags.models === 'auto' ? 'cleared (auto)' : 'updated'}`);
      for (const c of ROLE_CATEGORIES) console.log(`  ${c.icon}  ${c.label.padEnd(26)} ${flags.models === 'auto' ? 'auto' : map[c.id] ?? 'auto'}`);
      return;
    }
    default: {
      const { isInteractiveSession } = await import('../init.js');
      const interactive = isInteractiveSession() && !flags.yes;
      let rl: import('node:readline/promises').Interface | undefined;
      if (interactive) {
        const { createInterface } = await import('node:readline/promises');
        rl = createInterface({ input: process.stdin, output: process.stdout });
      }
      try {
        await runOptimize(root, { ...flags, hosts }, { interactive, ask: rl ? (q) => rl!.question(q) : undefined });
      } finally { rl?.close(); }
    }
  }
}

function readPcConfig(root: string): { hosts?: string[]; openspec?: boolean; rtk?: boolean; graphify?: boolean } {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.squad', 'config.json'), 'utf8'));
    return cfg.plainConcepts ?? {};
  } catch { return {}; }
}

function readConfiguredHosts(root: string): string[] | undefined {
  const pc = readPcConfig(root).hosts;
  if (pc?.length) return pc;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.squad', 'config.json'), 'utf8'));
    return Array.isArray(cfg.clients) && cfg.clients.length ? cfg.clients : undefined;
  } catch { return undefined; }
}
