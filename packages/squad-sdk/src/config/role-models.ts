/**
 * Role-based model and icon preferences (Squad Optimized — Plain Concepts).
 *
 * The installer asks which model each kind of team member should use before the
 * team is cast. Agents do not exist yet at that point, so preferences are stored
 * per role category in `.squad/config.json` → `roleModelOverrides`, and applied to
 * `agentModelOverrides` when members are cast. Each category also carries a
 * default icon so every member gets a recognizable emoji.
 */

import { join } from 'node:path';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';

export type TeamRoleCategory =
  | 'lead'
  | 'frontend'
  | 'backend'
  | 'tester'
  | 'devops'
  | 'docs'
  | 'data'
  | 'security'
  | 'ai'
  | 'scribe'
  | 'monitor'
  | 'reviewer'
  | 'default';

export interface TeamRoleCategoryInfo {
  id: TeamRoleCategory;
  label: string;
  icon: string;
  /** Recommended model tier for this kind of work. */
  tier: 'premium' | 'standard' | 'fast';
  pattern?: RegExp;
}

/** Ordered: first matching pattern wins. */
export const ROLE_CATEGORIES: readonly TeamRoleCategoryInfo[] = [
  { id: 'lead', label: 'Lead / Architect', icon: '🏗️', tier: 'premium', pattern: /lead|architect|principal/i },
  { id: 'security', label: 'Security', icon: '🔒', tier: 'premium', pattern: /security|auth|appsec/i },
  { id: 'ai', label: 'AI / ML', icon: '🧠', tier: 'premium', pattern: /\bai\b|\bml\b|machine learning|prompt|llm/i },
  { id: 'frontend', label: 'Frontend / UI', icon: '⚛️', tier: 'standard', pattern: /frontend|front-end|\bui\b|ux|design/i },
  { id: 'backend', label: 'Backend / API', icon: '🔧', tier: 'standard', pattern: /backend|back-end|api|server|service/i },
  { id: 'data', label: 'Data', icon: '📊', tier: 'standard', pattern: /data|database|analytics|sql/i },
  { id: 'devops', label: 'DevOps / Platform', icon: '⚙️', tier: 'standard', pattern: /devops|infra|platform|sre|cloud|ci\/cd/i },
  { id: 'tester', label: 'Tester / QA', icon: '🧪', tier: 'standard', pattern: /test|qa|quality/i },
  { id: 'docs', label: 'Docs / DevRel', icon: '📝', tier: 'fast', pattern: /docs|devrel|writer|documentation/i },
  { id: 'scribe', label: 'Scribe', icon: '📋', tier: 'fast', pattern: /scribe|logger|decision merger/i },
  { id: 'monitor', label: 'Work Monitor (Ralph)', icon: '🔄', tier: 'fast', pattern: /monitor|ralph/i },
  { id: 'reviewer', label: 'Reviewer / Fact Checker', icon: '🔍', tier: 'premium', pattern: /review|fact|verif|rai/i },
  { id: 'default', label: 'Everyone else', icon: '👤', tier: 'standard' },
];

/** Map a free-form role string to its category. */
export function roleCategory(role: string | undefined | null): TeamRoleCategory {
  if (!role) return 'default';
  for (const c of ROLE_CATEGORIES) {
    if (c.pattern && c.pattern.test(role)) return c.id;
  }
  return 'default';
}

/** Default icon for a role. */
export function roleIcon(role: string | undefined | null): string {
  const id = roleCategory(role);
  return ROLE_CATEGORIES.find((c) => c.id === id)?.icon ?? '👤';
}

function readConfig(squadDir: string, storage: StorageProvider): Record<string, unknown> {
  const configPath = join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) return { version: 1 };
  try {
    const raw = storage.readSync(configPath);
    const parsed = raw !== undefined ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : { version: 1 };
  } catch {
    return { version: 1 };
  }
}

function writeConfig(squadDir: string, config: Record<string, unknown>, storage: StorageProvider): void {
  storage.writeSync(join(squadDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

function readStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
  }
  return out;
}

/** Reads `roleModelOverrides` (role category → model id) from `.squad/config.json`. */
export function readRoleModelOverrides(
  squadDir: string,
  storage: StorageProvider = new FSStorageProvider(),
): Partial<Record<TeamRoleCategory, string>> {
  return readStringMap(readConfig(squadDir, storage).roleModelOverrides);
}

/** Merges role model overrides into `.squad/config.json`. `null` clears them. */
export function writeRoleModelOverrides(
  squadDir: string,
  overrides: Partial<Record<TeamRoleCategory, string>> | null,
  storage: StorageProvider = new FSStorageProvider(),
): void {
  const config = readConfig(squadDir, storage);
  if (!overrides || Object.keys(overrides).length === 0) delete config.roleModelOverrides;
  else config.roleModelOverrides = { ...readStringMap(config.roleModelOverrides), ...overrides };
  writeConfig(squadDir, config, storage);
}

/** Reads `agentIcons` (agent name → emoji) from `.squad/config.json`. */
export function readAgentIcons(squadDir: string, storage: StorageProvider = new FSStorageProvider()): Record<string, string> {
  return readStringMap(readConfig(squadDir, storage).agentIcons);
}

/** Merges agent icons into `.squad/config.json`. */
export function writeAgentIcons(
  squadDir: string,
  icons: Record<string, string>,
  storage: StorageProvider = new FSStorageProvider(),
): void {
  const config = readConfig(squadDir, storage);
  config.agentIcons = { ...readStringMap(config.agentIcons), ...icons };
  writeConfig(squadDir, config, storage);
}

/**
 * Model for a role from `roleModelOverrides`: exact category first, then
 * `default`. Returns undefined when nothing (or `auto`) is configured.
 */
export function roleModelFor(
  overrides: Partial<Record<string, string>> | null | undefined,
  role: string | undefined | null,
): string | undefined {
  if (!overrides) return undefined;
  const pick = (v: string | undefined) => (v && v.trim() && v.trim().toLowerCase() !== 'auto' ? v.trim() : undefined);
  return pick(overrides[roleCategory(role)]) ?? pick(overrides['default']);
}
