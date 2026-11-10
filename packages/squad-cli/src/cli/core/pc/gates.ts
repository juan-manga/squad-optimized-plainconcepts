/**
 * CI guardrails generator (Squad Optimized — Plain Concepts).
 *
 * `squad optimize gates` writes, from the detected stack:
 *  - .github/workflows/pc-quality-gates.yml  Secrets, Vulnerabilities, SAST, SBOM, tests + coverage floor
 *  - .github/workflows/pc-pr-guardrails.yml  spec-in-PR + docs-impact, diff quality check, AIDLC trend
 *  - .github/workflows/pc-merge-gate.yml     auto-merge bot PRs outside the human checkpoints
 *  - .github/scripts/pc-*.mjs                zero-dependency gate scripts
 *  - quality.config.json                     floors and thresholds (floors only ratchet up)
 * Existing files are never overwritten unless `force` is set.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getTemplatesDir } from '../templates.js';
import { detectStack, type ProjectStack } from './stack.js';

export interface GatesOptions { force?: boolean; mergeGate?: boolean }
export interface GeneratedFiles { written: string[]; skipped: string[] }

export function pcTemplatesDir(): string {
  return path.join(getTemplatesDir(), 'pc');
}

function defaultBranch(root: string): string {
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return ref.replace(/^origin\//, '') || 'main';
  } catch {
    try {
      return execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'main';
    } catch { return 'main'; }
  }
}

/** CI setup/install/coverage commands for the detected stack. */
export function ciCommands(stack: ProjectStack): { setup: string; install: string; coverage: string } {
  const step = (s: string) => s.split('\n').map((l) => `      ${l}`).join('\n');
  const fw = new Set(stack.frameworks);
  if (stack.packageManager) {
    const pm = stack.packageManager;
    const setup = [
      pm === 'pnpm' ? '- uses: pnpm/action-setup@v4' : '',
      '- uses: actions/setup-node@v4',
      '  with:',
      '    node-version: 22',
      pm === 'npm' || pm === 'pnpm' || pm === 'yarn' ? `    cache: ${pm}` : '',
    ].filter(Boolean).join('\n');
    const run = pm === 'npm' ? 'npx' : pm === 'bun' ? 'bunx' : `${pm} exec`;
    const coverage = fw.has('Vitest') ? `${run} vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text-summary`
      : fw.has('Jest') ? `${run} jest --coverage --coverageReporters=lcov --coverageReporters=text-summary`
      : stack.commands.test ?? 'npm test';
    return { setup: step(setup), install: stack.commands.install ?? 'npm ci', coverage };
  }
  if (stack.frameworks.includes('.NET')) {
    return {
      setup: step('- uses: actions/setup-dotnet@v4\n  with:\n    dotnet-version: 9.0.x'),
      install: 'dotnet restore',
      coverage: `${stack.commands.test ?? 'dotnet test'} --collect:"XPlat Code Coverage"`,
    };
  }
  if (stack.languages[0] === 'Python') {
    const uv = (stack.commands.install ?? '').startsWith('uv');
    return {
      setup: step(uv ? '- uses: astral-sh/setup-uv@v5' : '- uses: actions/setup-python@v5\n  with:\n    python-version: "3.12"'),
      install: stack.commands.install ?? 'pip install -r requirements.txt',
      coverage: uv ? 'uv run --with pytest-cov pytest --cov --cov-report=xml' : 'pip install pytest-cov && pytest --cov --cov-report=xml',
    };
  }
  if (stack.commands.test?.startsWith('go ')) {
    return { setup: step('- uses: actions/setup-go@v5\n  with:\n    go-version: stable'), install: 'go mod download', coverage: 'go test ./... -cover' };
  }
  return { setup: step('- run: echo "No toolchain detected — edit pc-quality-gates.yml"'), install: 'echo "no install step"', coverage: stack.commands.test ?? 'echo "no tests"' };
}

function writeIfAbsent(root: string, rel: string, content: string, force: boolean, out: GeneratedFiles): void {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs) && !force) { out.skipped.push(rel); return; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  out.written.push(rel);
}

export function qualityConfig(stack: ProjectStack): Record<string, unknown> {
  const appPaths = stack.topDirs.filter((d) => !/^(tests?|docs|scripts|samples|examples|openspec|features)$/i.test(d)).map((d) => `${d}/`);
  return {
    $comment: 'Squad Optimized — Plain Concepts. Floors only ratchet up: never lower a floor to go green.',
    appPaths: appPaths.length ? appPaths : ['src/'],
    specPaths: ['openspec/', 'docs/decisions/', 'docs/adr/', '.squad/decisions', 'features/'],
    docsPaths: ['docs/', 'README.md', 'ARCHITECTURE.md', 'AGENTS.md'],
    coverage: { lines: 0 },
    diff: { maxCommentRatio: 0.1, maxTestToCodeRatio: 1, maxTestsPerKloc: 40 },
    mergeGate: { maxChangedLines: 10000, botAuthors: ['[bot]', 'copilot', 'squad'] },
  };
}

export function generateGates(root: string, opts: GatesOptions = {}): GeneratedFiles {
  const out: GeneratedFiles = { written: [], skipped: [] };
  const tpl = pcTemplatesDir();
  const stack = detectStack(root);
  const force = !!opts.force;
  const cmds = ciCommands(stack);

  const quality = fs.readFileSync(path.join(tpl, 'workflows', 'pc-quality-gates.yml'), 'utf8')
    .replace('{{DEFAULT_BRANCH}}', defaultBranch(root))
    .replace('{{SETUP_STEPS}}', cmds.setup)
    .replace('{{INSTALL_COMMAND}}', cmds.install)
    .replace('{{COVERAGE_COMMAND}}', cmds.coverage);
  writeIfAbsent(root, '.github/workflows/pc-quality-gates.yml', quality, force, out);
  writeIfAbsent(root, '.github/workflows/pc-pr-guardrails.yml', fs.readFileSync(path.join(tpl, 'workflows', 'pc-pr-guardrails.yml'), 'utf8'), force, out);
  if (opts.mergeGate !== false) {
    writeIfAbsent(root, '.github/workflows/pc-merge-gate.yml', fs.readFileSync(path.join(tpl, 'workflows', 'pc-merge-gate.yml'), 'utf8'), force, out);
  }
  for (const f of fs.readdirSync(path.join(tpl, 'scripts'))) {
    // Scripts are squad-owned: always refreshed so fixes propagate.
    writeIfAbsent(root, `.github/scripts/${f}`, fs.readFileSync(path.join(tpl, 'scripts', f), 'utf8'), true, out);
  }
  writeIfAbsent(root, 'quality.config.json', JSON.stringify(qualityConfig(stack), null, 2) + '\n', force, out);
  return out;
}
