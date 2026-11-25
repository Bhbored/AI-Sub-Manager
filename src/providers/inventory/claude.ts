import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import type { Inventory, InventoryMcp, InventoryPlugin, InventoryProject, InventorySkill } from '../../shared/contracts.js';
import { asRecord, isoDate } from '../../shared/validation.js';
import { cwdFrom, describeServer, emptyInventory, fileInfo, lastSegment, readHead, readJson, skillsIn, treeStats } from './common.js';

export interface ClaudeLocations { home: string; state: string }

export function claudeLocations(env: NodeJS.ProcessEnv = process.env, home = homedir()): ClaudeLocations {
  if (env.CLAUDE_CONFIG_DIR) return { home: env.CLAUDE_CONFIG_DIR, state: join(env.CLAUDE_CONFIG_DIR, '.claude.json') };
  return { home: join(home, '.claude'), state: join(home, '.claude.json') };
}

const inside = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
};

function serversOf(value: unknown, source: string): InventoryMcp[] {
  const record = asRecord(value);
  const map = asRecord(record.mcpServers ?? record);
  return Object.entries(map).filter(([, entry]) => typeof entry === 'object' && entry !== null)
    .map(([name, entry]) => describeServer(name, entry, source));
}

async function scanProjects(home: string): Promise<InventoryProject[]> {
  const root = join(home, 'projects');
  let folders;
  try { folders = await readdir(root, { withFileTypes: true }); }
  catch { return []; }
  const projects: InventoryProject[] = [];
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const directory = join(root, folder.name);
    const sessions: { file: string; created: number; updated: number }[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      try {
        const info = await stat(join(directory, entry.name));
        sessions.push({ file: join(directory, entry.name), created: info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs, updated: info.mtimeMs });
      } catch {}
    }
    const tree = await treeStats(directory);
    let path: string | null = null;
    for (const session of [...sessions].sort((a, b) => b.updated - a.updated).slice(0, 3)) {
      try { path = cwdFrom(await readHead(session.file, 65536)); } catch {}
      if (path) break;
    }
    projects.push({
      name: path ? lastSegment(path) : folder.name, path, folder: directory, sessions: sessions.length, archived: 0, bytes: tree.bytes,
      created: sessions.length ? isoDate(Math.min(...sessions.map(item => item.created))) : null,
      updated: isoDate(Math.max(tree.newest, ...sessions.map(item => item.updated), 0)) ?? null
    });
  }
  return projects.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
}

export async function scanClaude(locations: ClaudeLocations = claudeLocations()): Promise<Inventory> {
  const { home, state } = locations;
  const result: Inventory = { provider: 'claude', home, scannedAt: new Date().toISOString(), ...emptyInventory() };
  result.projects = await scanProjects(home);
  result.sessionCount = result.projects.reduce((sum, item) => sum + item.sessions, 0);
  result.sessionBytes = result.projects.reduce((sum, item) => sum + item.bytes, 0);

  const skills: InventorySkill[] = await skillsIn(join(home, 'skills'), 'user');
  const plugins: InventoryPlugin[] = [];
  const mcpServers: InventoryMcp[] = [];

  const settings = asRecord(await readJson(join(home, 'settings.json')));
  const enabled = asRecord(settings.enabledPlugins);
  const installed = asRecord(asRecord(await readJson(join(home, 'plugins', 'installed_plugins.json'))).plugins);
  for (const [key, value] of Object.entries(installed)) {
    const entry = asRecord(Array.isArray(value) ? value[0] : value);
    const [name, market = 'plugin'] = key.split('@');
    plugins.push({ name, version: typeof entry.version === 'string' ? entry.version : null, enabled: typeof enabled[key] === 'boolean' ? enabled[key] : null, source: market });
    const location = typeof entry.installPath === 'string' ? entry.installPath : '';
    if (!location || !inside(home, location)) continue;
    skills.push(...await skillsIn(join(location, 'skills'), 'plugin: ' + name));
    mcpServers.push(...serversOf(await readJson(join(location, '.mcp.json')), 'plugin: ' + name));
  }

  // The state file also stores account details; only the MCP server definitions are extracted from it.
  const app = asRecord(await readJson(state));
  mcpServers.push(...serversOf({ mcpServers: app.mcpServers }, 'user'));
  for (const [path, project] of Object.entries(asRecord(app.projects))) {
    mcpServers.push(...serversOf({ mcpServers: asRecord(project).mcpServers }, 'project: ' + lastSegment(path)));
  }

  result.skills = skills.sort((a, b) => a.name.localeCompare(b.name));
  result.plugins = plugins.sort((a, b) => a.name.localeCompare(b.name));
  result.mcpServers = mcpServers.sort((a, b) => a.name.localeCompare(b.name));
  result.files = (await Promise.all([
    fileInfo('settings.json', join(home, 'settings.json')),
    fileInfo('settings.local.json', join(home, 'settings.local.json')),
    fileInfo('CLAUDE.md (global instructions)', join(home, 'CLAUDE.md')),
    fileInfo('.claude.json (app state and MCP servers)', state)
  ])).filter(item => item !== null);
  return result;
}
