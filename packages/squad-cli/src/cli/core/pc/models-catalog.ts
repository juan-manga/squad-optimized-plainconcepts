/**
 * Model providers & cost visibility (Squad Optimized — Plain Concepts).
 *
 *  - Forge: Plain Concepts' OpenAI-compatible gateway, configured as an OpenCode
 *    custom provider (`opencode.json` → provider.forge, key from FORGE_API_KEY).
 *  - models.dev: public model catalog (prices, context) used to show real $/Mtok.
 *  - Usage report: per-role model, relative cost, repo-map size and RTK savings.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROLE_CATEGORIES, MODEL_CATALOG, readRoleModelOverrides } from '@bradygaster/squad-sdk';
import { runCommand } from './skills-catalog.js';
import { approxTokens } from './repomap.js';

export const FORGE = {
  id: 'forge',
  name: 'Plain Concepts Forge',
  baseURL: 'https://forge.plainconcepts.com/v1',
  apiKeyEnv: 'FORGE_API_KEY',
  defaultModel: 'glm-5-2',
} as const;

export type OpenCodeProvider = 'github-copilot' | 'anthropic' | 'forge';

/** Squad model id → OpenCode `provider/model` id. */
export function opencodeModelId(model: string, provider: OpenCodeProvider = 'github-copilot'): string {
  if (model.includes('/')) return model;
  if (provider === 'forge') return `forge/${model}`;
  if (provider === 'anthropic') return `anthropic/${model.replace(/\./g, '-')}`;
  return `github-copilot/${model}`;
}

/** Merge the Forge provider (and optionally a default model) into opencode.json. */
export function writeForgeProvider(root: string, models: string[] = [FORGE.defaultModel], setDefault = true): string {
  const file = fs.existsSync(path.join(root, 'opencode.jsonc')) ? 'opencode.jsonc' : 'opencode.json';
  const abs = path.join(root, file);
  let cfg: Record<string, any> = { $schema: 'https://opencode.ai/config.json' };
  if (fs.existsSync(abs)) {
    try { cfg = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\s*\/\/.*$/gm, '')); } catch { /* keep default */ }
  }
  cfg.provider = cfg.provider ?? {};
  cfg.provider[FORGE.id] = {
    npm: '@ai-sdk/openai-compatible',
    name: FORGE.name,
    options: { baseURL: FORGE.baseURL, apiKey: `{env:${FORGE.apiKeyEnv}}` },
    models: Object.fromEntries(models.map((m) => [m.replace(/^forge\//, ''), {}])),
  };
  if (setDefault && !cfg.model) cfg.model = `forge/${models[0]}`;
  fs.writeFileSync(abs, JSON.stringify(cfg, null, 2) + '\n');
  return file;
}

export interface ModelsDevPrice { input?: number; output?: number; context?: number }

/** Fetch prices from models.dev (best effort, 10 s timeout). Keyed by model id. */
export async function fetchModelsDev(): Promise<Map<string, ModelsDevPrice>> {
  const out = new Map<string, ModelsDevPrice>();
  try {
    const res = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return out;
    const data = (await res.json()) as Record<string, { models?: Record<string, { cost?: { input?: number; output?: number }; limit?: { context?: number } }> }>;
    for (const provider of Object.values(data)) {
      for (const [id, m] of Object.entries(provider.models ?? {})) {
        if (!out.has(id)) out.set(id, { input: m.cost?.input, output: m.cost?.output, context: m.limit?.context });
      }
    }
  } catch { /* offline */ }
  return out;
}

const TIER_COST = { premium: 10, standard: 3, fast: 1 } as const;

export function relativeCost(model: string): number {
  const info = MODEL_CATALOG.find((m) => m.id === model);
  if (info?.cost !== undefined) return info.cost;
  if (info) return TIER_COST[info.tier];
  return /opus|sol|max/i.test(model) ? 10 : /haiku|mini|flash|luna/i.test(model) ? 1 : 3;
}

export interface UsageReport { markdown: string; rtkSavedTokens?: number }

export async function buildUsageReport(root: string, opts: { online?: boolean } = {}): Promise<UsageReport> {
  const squadDir = path.join(root, '.squad');
  const roleModels = readRoleModelOverrides(squadDir);
  const prices = opts.online ? await fetchModelsDev() : new Map<string, ModelsDevPrice>();
  const lines = ['## Token economy', '', '| Role | Model | Relative cost | $/Mtok in·out (models.dev) |', '|---|---|---|---|'];
  for (const c of ROLE_CATEGORIES) {
    const model = roleModels[c.id];
    if (!model) continue;
    const p = prices.get(model) ?? prices.get(model.replace(/\./g, '-'));
    lines.push(`| ${c.icon} ${c.label} | \`${model}\` | ${relativeCost(model)}× | ${p?.input !== undefined ? `${p.input} · ${p.output}` : '—'} |`);
  }
  if (lines.length === 4) lines.push('| — | auto (Squad picks per task) | — | — |');

  const repomap = path.join(squadDir, 'context', 'repomap.md');
  lines.push('');
  if (fs.existsSync(repomap)) lines.push(`- Repo map: ~${approxTokens(fs.readFileSync(repomap, 'utf8'))} tokens (read once instead of exploring the tree).`);
  else lines.push('- Repo map: not generated — `squad optimize repomap`.');

  let rtkSavedTokens: number | undefined;
  const rtk = await runCommand('rtk', ['gain', '--format', 'json'], root, 15_000);
  if (rtk.ok) {
    try {
      const j = JSON.parse(rtk.out.slice(rtk.out.indexOf('{')));
      rtkSavedTokens = Number(j.total_saved ?? j.saved_tokens ?? j.tokens_saved ?? j.summary?.total_saved);
      lines.push(Number.isFinite(rtkSavedTokens) ? `- RTK: ~${rtkSavedTokens} tokens saved so far (\`rtk gain\`).` : '- RTK: installed (`rtk gain` for details).');
    } catch { lines.push('- RTK: installed (`rtk gain` for details).'); }
  } else {
    lines.push('- RTK: not installed — `squad optimize tools --rtk`.');
  }
  return { markdown: lines.join('\n') + '\n', rtkSavedTokens };
}
