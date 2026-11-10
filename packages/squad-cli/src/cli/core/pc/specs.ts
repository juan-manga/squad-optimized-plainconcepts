/**
 * OpenSpec → Gherkin (Squad Optimized — Plain Concepts).
 *
 * `squad optimize specs` turns OpenSpec requirement scenarios
 * (`#### Scenario:` + `- **GIVEN/WHEN/THEN/AND**` bullets in openspec/specs/<cap>/spec.md)
 * into executable `features/<cap>.feature` files, so specs run on every PR through
 * Reqnroll (.NET), playwright-bdd / Cucumber (JS) or pytest-bdd (Python).
 * Generated files carry a marker and are regenerated; hand-written features are left alone.
 */

import fs from 'node:fs';
import path from 'node:path';

export const GENERATED_MARKER = '# generated-by: squad optimize specs';

interface Scenario { name: string; steps: string[] }
interface Requirement { name: string; scenarios: Scenario[] }

const STEP = /^\s*[-*]\s*\*\*(GIVEN|WHEN|THEN|AND|BUT)\*\*:?\s*(.+)$/i;

export function parseOpenSpec(markdown: string): Requirement[] {
  const reqs: Requirement[] = [];
  let req: Requirement | undefined;
  let sc: Scenario | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const r = /^###\s+Requirement:\s*(.+)$/.exec(line);
    if (r) { req = { name: r[1]!.trim(), scenarios: [] }; reqs.push(req); sc = undefined; continue; }
    const s = /^####\s+Scenario:\s*(.+)$/.exec(line);
    if (s) {
      if (!req) { req = { name: 'General', scenarios: [] }; reqs.push(req); }
      sc = { name: s[1]!.trim(), steps: [] };
      req.scenarios.push(sc);
      continue;
    }
    const st = STEP.exec(line);
    if (st && sc) {
      const kw = st[1]!.toUpperCase();
      const word = kw === 'GIVEN' ? 'Given' : kw === 'WHEN' ? 'When' : kw === 'THEN' ? 'Then' : kw === 'BUT' ? 'But' : 'And';
      sc.steps.push(`${word} ${st[2]!.trim()}`);
    }
  }
  return reqs.filter((r) => r.scenarios.length);
}

export function toGherkin(capability: string, reqs: Requirement[], source: string): string {
  const out = [GENERATED_MARKER, `# source: ${source}`, `Feature: ${capability}`, ''];
  for (const r of reqs) {
    out.push(`  Rule: ${r.name}`, '');
    for (const s of r.scenarios) {
      out.push(`    @spec`, `    Scenario: ${s.name}`);
      // Gherkin needs Given/When/Then order to read well; keep author order, add a Given if missing.
      if (!s.steps.some((x) => x.startsWith('Given'))) out.push('      Given the system is in its default state');
      for (const step of s.steps) out.push(`      ${step}`);
      out.push('');
    }
  }
  return out.join('\n');
}

export interface SpecsResult { written: string[]; skipped: string[]; scenarios: number }

export function generateFeatures(root: string, outDir = 'features'): SpecsResult {
  const res: SpecsResult = { written: [], skipped: [], scenarios: 0 };
  const specsDir = path.join(root, 'openspec', 'specs');
  if (!fs.existsSync(specsDir)) return res;
  for (const cap of fs.readdirSync(specsDir)) {
    const specFile = path.join(specsDir, cap, 'spec.md');
    if (!fs.existsSync(specFile)) continue;
    const reqs = parseOpenSpec(fs.readFileSync(specFile, 'utf8'));
    if (!reqs.length) continue;
    const rel = `${outDir}/${cap}.feature`;
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && !fs.readFileSync(abs, 'utf8').startsWith(GENERATED_MARKER)) { res.skipped.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, toGherkin(cap, reqs, `openspec/specs/${cap}/spec.md`));
    res.written.push(rel);
    res.scenarios += reqs.reduce((n, r) => n + r.scenarios.length, 0);
  }
  return res;
}
