/**
 * Plain Concepts Platform adoption (Squad Optimized).
 *  - `squad optimize platform`: `.platform/contract.yml` + Project Health registration command
 *  - `squad optimize intake`:   Maintenance-mode intake (PRODUCT_SCOPE.md, business request
 *                                issue form, labels guidance) for the business-intake skill
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectStack, type ProjectStack } from './stack.js';
import { pcTemplatesDir, type GeneratedFiles } from './gates.js';

export const HEALTH_REPO = 'PlainConceptsPlatform/Project-Health-Platform';

export function platformProjectType(stack: ProjectStack): string {
  const fw = new Set(stack.frameworks);
  const web = ['React', 'Next.js', 'Vue', 'Angular', 'Svelte'].some((f) => fw.has(f));
  const back = ['ASP.NET Core', 'Express', 'Fastify', 'NestJS', 'FastAPI', 'Django'].some((f) => fw.has(f));
  if (web && back) return 'back-front';
  if (fw.has('AI agents')) return 'ml';
  if (web) return fw.has('Next.js') ? 'back-front' : 'static-site';
  if (back) return 'back-front';
  return 'other';
}

function repoSlug(root: string): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[:/]([^/]+\/[^/.]+)/.exec(url)?.[1];
  } catch { return undefined; }
}

export function generatePlatform(root: string, force = false): GeneratedFiles & { healthCommand?: string } {
  const out: GeneratedFiles & { healthCommand?: string } = { written: [], skipped: [] };
  const stack = detectStack(root);
  const rel = '.platform/contract.yml';
  const abs = path.join(root, rel);
  const reuse = stack.frameworks.includes('Plain Concepts Platform')
    ? '  - package: "@plainconceptsplatform/ui-theme"\n  - package: "@plainconceptsplatform/ui-components"'
    : '  []';
  const owned = stack.topDirs.length ? stack.topDirs.slice(0, 8).map((d) => `  - path: ${d}/`).join('\n') : '  []';
  if (fs.existsSync(abs) && !force) out.skipped.push(rel);
  else {
    const content = fs.readFileSync(path.join(pcTemplatesDir(), 'platform', 'contract.yml'), 'utf8')
      .replace('{{PROJECT_NAME}}', path.basename(path.resolve(root)))
      .replace('{{PROJECT_TYPE}}', platformProjectType(stack))
      .replace('{{OWNED}}', owned)
      .replace('{{REUSE}}', reuse);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    out.written.push(rel);
  }
  const slug = repoSlug(root);
  out.healthCommand = `gh workflow run discover.yml --repo ${HEALTH_REPO} -f repo=${slug ?? '<owner>/<repo>'}`;
  return out;
}

export function generateIntake(root: string, force = false): GeneratedFiles {
  const out: GeneratedFiles = { written: [], skipped: [] };
  const tpl = path.join(pcTemplatesDir(), 'platform');
  const files: Array<[string, string]> = [
    ['PRODUCT_SCOPE.md', 'PRODUCT_SCOPE.md'],
    ['business-request.yml', '.github/ISSUE_TEMPLATE/business-request.yml'],
  ];
  for (const [src, dest] of files) {
    const abs = path.join(root, dest);
    if (fs.existsSync(abs) && !force) { out.skipped.push(dest); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(path.join(tpl, src), abs);
    out.written.push(dest);
  }
  return out;
}
