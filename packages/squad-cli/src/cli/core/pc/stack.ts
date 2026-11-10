/**
 * Stack detection for Squad Optimized (Plain Concepts).
 * Zero dependencies, bounded directory walk, cached per directory so every
 * optimizer step (instructions, skills, repomap, AIDLC) reuses one scan.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ProjectStack {
  root: string;
  languages: string[];
  frameworks: string[];
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  commands: { install?: string; build?: string; test?: string; lint?: string; dev?: string };
  hasTests: boolean;
  hasCi: boolean;
  ciFiles: string[];
  /** Relative paths of source files (bounded), reused by repomap. */
  sourceFiles: string[];
  /** Top-level directories that hold code. */
  topDirs: string[];
}

export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'bin', 'obj', 'coverage', '.next', '.nuxt',
  '.turbo', '.cache', 'vendor', 'target', '__pycache__', '.venv', 'venv', '.squad', '.idea',
  '.vs', '.vscode', 'graphify-out', '.opencode', '.claude', 'packages-lock', '.pnpm-store',
]);

export const SOURCE_EXT: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.cs': 'C#', '.fs': 'F#', '.py': 'Python', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.rs': 'Rust', '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.dart': 'Dart',
};

const MAX_FILES = 5000;
const cache = new Map<string, ProjectStack>();

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
}

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [''];
  while (stack.length && out.length < MAX_FILES) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) stack.push(childRel);
      } else if (e.isFile()) {
        out.push(childRel);
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  return out.sort();
}

export function clearStackCache(): void { cache.clear(); }

export function detectStack(root: string): ProjectStack {
  const key = path.resolve(root);
  const hit = cache.get(key);
  if (hit) return hit;

  const files = walk(root);
  const langCount = new Map<string, number>();
  const sourceFiles: string[] = [];
  for (const f of files) {
    const lang = SOURCE_EXT[path.extname(f).toLowerCase()];
    if (lang && !f.startsWith('.github/')) {
      langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
      sourceFiles.push(f);
    }
  }
  const languages = [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const frameworks = new Set<string>();
  const commands: ProjectStack['commands'] = {};
  let packageManager: ProjectStack['packageManager'];

  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg) {
    packageManager = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm'
      : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn'
      : fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock')) ? 'bun'
      : 'npm';
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, string>;
    const has = (d: string) => Object.prototype.hasOwnProperty.call(deps, d);
    if (has('next')) frameworks.add('Next.js');
    if (has('react')) frameworks.add('React');
    if (has('vue')) frameworks.add('Vue');
    if (has('@angular/core')) frameworks.add('Angular');
    if (has('svelte')) frameworks.add('Svelte');
    if (has('express') || has('fastify') || has('@nestjs/core')) frameworks.add(has('@nestjs/core') ? 'NestJS' : has('fastify') ? 'Fastify' : 'Express');
    if (has('tailwindcss')) frameworks.add('Tailwind');
    if (has('vitest')) frameworks.add('Vitest');
    if (has('jest')) frameworks.add('Jest');
    if (has('@playwright/test')) frameworks.add('Playwright');
    if (Object.keys(deps).some((d) => d.startsWith('@plainconceptsplatform/'))) frameworks.add('Plain Concepts Platform');
    const run = packageManager === 'npm' ? 'npm run' : packageManager;
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    commands.install = packageManager === 'npm' ? 'npm ci' : `${packageManager} install`;
    if (scripts.build) commands.build = `${run} build`;
    if (scripts.test) commands.test = packageManager === 'npm' ? 'npm test' : `${packageManager} test`;
    if (scripts.lint) commands.lint = `${run} lint`;
    if (scripts.dev) commands.dev = `${run} dev`;
  }

  const csproj = files.filter((f) => /\.(csproj|fsproj|sln|slnx)$/.test(f));
  if (csproj.length) {
    frameworks.add('.NET');
    const sln = csproj.find((f) => /\.slnx?$/.test(f));
    commands.build ??= `dotnet build${sln ? ` ${sln}` : ''}`;
    commands.test ??= `dotnet test${sln ? ` ${sln}` : ''}`;
    for (const p of csproj.slice(0, 20)) {
      try {
        const c = fs.readFileSync(path.join(root, p), 'utf8');
        if (/Microsoft\.NET\.Sdk\.Web|AspNetCore/.test(c)) frameworks.add('ASP.NET Core');
        if (/Aspire/.test(c)) frameworks.add('.NET Aspire');
        if (/xunit|nunit|MSTest/i.test(c)) frameworks.add('dotnet-test');
        if (/Azure\./.test(c)) frameworks.add('Azure SDK');
      } catch { /* ignore */ }
    }
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) {
    const uv = fs.existsSync(path.join(root, 'uv.lock'));
    commands.install ??= uv ? 'uv sync' : 'pip install -r requirements.txt';
    commands.test ??= uv ? 'uv run pytest' : 'pytest';
    try {
      const py = fs.readFileSync(path.join(root, fs.existsSync(path.join(root, 'pyproject.toml')) ? 'pyproject.toml' : 'requirements.txt'), 'utf8');
      if (/fastapi/i.test(py)) frameworks.add('FastAPI');
      if (/django/i.test(py)) frameworks.add('Django');
      if (/ruff/i.test(py)) commands.lint ??= uv ? 'uv run ruff check' : 'ruff check';
      if (/agent-framework|semantic-kernel|langchain|openai/i.test(py)) frameworks.add('AI agents');
    } catch { /* ignore */ }
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) { commands.build ??= 'go build ./...'; commands.test ??= 'go test ./...'; }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) { commands.build ??= 'cargo build'; commands.test ??= 'cargo test'; }
  if (files.some((f) => /(^|\/)(main|infra)\.bicep$|\.bicep$/.test(f))) frameworks.add('Bicep');
  if (files.some((f) => f.endsWith('.tf'))) frameworks.add('Terraform');
  if (files.some((f) => /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/.test(f))) frameworks.add('Docker');

  const hasTests = files.some((f) => /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f) || /Tests?\.cs$/.test(f) || /(^|\/)test_[^/]+\.py$/.test(f));
  const ciFiles = files.filter((f) => /^\.github\/workflows\/[^/]+\.(ya?ml|md)$/.test(f) || /azure-pipelines\.ya?ml$/.test(f) || f === '.gitlab-ci.yml');
  const topDirs = [...new Set(sourceFiles.map((f) => f.split('/')[0]!).filter((d) => !d.includes('.')))].slice(0, 30);

  const result: ProjectStack = {
    root: key, languages, frameworks: [...frameworks], packageManager, commands,
    hasTests, hasCi: ciFiles.length > 0, ciFiles, sourceFiles, topDirs,
  };
  cache.set(key, result);
  return result;
}
