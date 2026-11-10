/**
 * External accelerators: OpenSpec (spec-driven changes), RTK (shell output
 * compaction → fewer tokens) and graphify (codebase knowledge graph).
 * Every step is best-effort: a missing tool is reported with the exact command
 * to run later and never fails `squad init`.
 */

import { runCommand } from './skills-catalog.js';

export interface ToolResult { tool: string; ok: boolean; message: string }

/** Squad host id → OpenSpec `--tools` id. */
const OPENSPEC_TOOL: Record<string, string> = { copilot: 'github-copilot', claude: 'claude', opencode: 'opencode', cursor: 'cursor', codex: 'codex' };
/** Squad host id → `rtk init` flag. */
const RTK_FLAG: Record<string, string[]> = { claude: [], copilot: ['--copilot'], opencode: ['--opencode'], cursor: ['--agent', 'cursor'], codex: ['--codex'] };
/** Squad host id → `graphify install --platform`. */
const GRAPHIFY_PLATFORM: Record<string, string> = { claude: 'claude', copilot: 'copilot', opencode: 'opencode', cursor: 'cursor', codex: 'codex' };

async function available(bin: string, root: string): Promise<boolean> {
  const r = await runCommand(bin, ['--version'], root, 10_000);
  return r.ok;
}

export async function setupOpenSpec(root: string, hosts: string[]): Promise<ToolResult> {
  const tools = hosts.map((h) => OPENSPEC_TOOL[h]).filter(Boolean).join(',') || 'agents';
  const r = await runCommand('npx', ['-y', '@fission-ai/openspec@latest', 'init', '.', '--tools', tools, '--force', '--no-animation'], root, 180_000);
  return r.ok
    ? { tool: 'openspec', ok: true, message: `OpenSpec initialised (openspec/, tools: ${tools})` }
    : { tool: 'openspec', ok: false, message: `OpenSpec init failed — run: npx @fission-ai/openspec@latest init --tools ${tools}` };
}

export async function setupRtk(root: string, hosts: string[]): Promise<ToolResult[]> {
  if (!(await available('rtk', root))) {
    const install = process.platform === 'win32' ? 'winget install rtk-ai.rtk' : 'brew install rtk  (or curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh)';
    return [{ tool: 'rtk', ok: false, message: `RTK not installed — install with: ${install}, then: squad optimize tools --rtk` }];
  }
  const out: ToolResult[] = [];
  for (const h of hosts) {
    const flags = RTK_FLAG[h];
    if (!flags) continue;
    const r = await runCommand('rtk', ['init', '-g', ...flags], root, 60_000);
    out.push({ tool: `rtk:${h}`, ok: r.ok, message: r.ok ? `RTK hook installed for ${h} (restart the agent)` : `rtk init -g ${flags.join(' ')} failed` });
  }
  return out;
}

export async function setupGraphify(root: string, hosts: string[]): Promise<ToolResult[]> {
  if (!(await available('graphify', root))) {
    return [{ tool: 'graphify', ok: false, message: 'graphify not installed — install with: uv tool install graphifyy  (or pipx install graphifyy), then: squad optimize tools --graphify' }];
  }
  const out: ToolResult[] = [];
  for (const h of hosts) {
    const platform = GRAPHIFY_PLATFORM[h];
    if (!platform) continue;
    const r = await runCommand('graphify', ['install', '--project', '--platform', platform], root, 120_000);
    out.push({ tool: `graphify:${h}`, ok: r.ok, message: r.ok ? `graphify skill installed for ${h} — build the graph with /graphify .` : `graphify install --platform ${platform} failed` });
  }
  return out;
}
