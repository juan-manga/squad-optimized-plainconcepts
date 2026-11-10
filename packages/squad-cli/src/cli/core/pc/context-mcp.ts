/**
 * `squad context-mcp` — MCP server exposing project context to any MCP host
 * (Copilot, Claude Code, OpenCode) so agents fetch only what they need:
 *   - repo_map(max_tokens?)       token-budgeted, ranked repo map
 *   - project_stack()             detected languages, frameworks, commands
 *   - aidlc_assessment()          AIDLC level, failing checks, roadmap
 *   - find_symbol(name)           files defining a symbol (from the repo map cache)
 * `squad optimize mcp` registers it in `.mcp.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getPackageVersion } from '../version.js';
import { buildRepoMap } from './repomap.js';
import { detectStack, clearStackCache } from './stack.js';
import { assessAidlc } from './aidlc.js';

export const CONTEXT_TOOLS = [
  {
    name: 'repo_map',
    description: 'Ranked, token-budgeted map of the codebase (files + top-level symbols). Call this before searching files.',
    inputSchema: { type: 'object', properties: { max_tokens: { type: 'number', description: 'Token budget (default 4000)' } } },
  },
  {
    name: 'project_stack',
    description: 'Detected languages, frameworks, package manager and build/test/lint commands.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'aidlc_assessment',
    description: 'AIDLC maturity level (0-5, Plain Concepts Platform), failing checks and next roadmap steps.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'find_symbol',
    description: 'Files that define a symbol (class, function, type) — cheaper than a repo-wide grep.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
] as const;

export function callContextTool(root: string, name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'repo_map':
      clearStackCache();
      return buildRepoMap(root, { maxTokens: typeof args.max_tokens === 'number' ? args.max_tokens : 4000 });
    case 'project_stack': {
      clearStackCache();
      const s = detectStack(root);
      return JSON.stringify({ languages: s.languages, frameworks: s.frameworks, packageManager: s.packageManager, commands: s.commands, topDirs: s.topDirs, hasTests: s.hasTests, hasCi: s.hasCi }, null, 2);
    }
    case 'aidlc_assessment': {
      clearStackCache();
      const r = assessAidlc(root);
      return JSON.stringify({ level: r.level, failing: r.checks.filter((c) => !c.pass).map((c) => ({ level: c.level, check: c.label, fix: c.fix })), next: r.next.slice(0, 5).map((c) => c.label) }, null, 2);
    }
    case 'find_symbol': {
      const wanted = String(args.name ?? '');
      let cache: Record<string, { syms: string[] }> = {};
      try { cache = JSON.parse(fs.readFileSync(path.join(root, '.squad', 'context', 'repomap.cache.json'), 'utf8')); } catch {
        buildRepoMap(root);
        try { cache = JSON.parse(fs.readFileSync(path.join(root, '.squad', 'context', 'repomap.cache.json'), 'utf8')); } catch { /* none */ }
      }
      const hits = Object.entries(cache).filter(([, v]) => v.syms.includes(wanted)).map(([f]) => f);
      return hits.length ? hits.join('\n') : `No definition of "${wanted}" in the repo map. Try a grep.`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runContextMcp(root: string): Promise<void> {
  const server = new Server({ name: 'squad-context', version: getPackageVersion() }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: CONTEXT_TOOLS.map((t) => ({ ...t })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const text = callContextTool(root, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true };
    }
  });
  await server.connect(new StdioServerTransport());
}

/** Register the server in `.mcp.json` (merge, idempotent). */
export function registerContextMcp(root: string): string {
  const file = path.join(root, '.mcp.json');
  let cfg: Record<string, any> = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new */ }
  cfg.mcpServers = cfg.mcpServers ?? {};
  cfg.mcpServers['squad-context'] = { command: 'squad', args: ['context-mcp'] };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return '.mcp.json';
}
