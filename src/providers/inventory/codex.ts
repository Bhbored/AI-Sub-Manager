import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Inventory, InventoryMcp, InventoryPlugin, InventoryProject } from '../../shared/contracts.js';
import { isoDate } from '../../shared/validation.js';
import { cwdFrom, describeServer, emptyInventory, fileInfo, lastSegment, readHead, skillsIn } from './common.js';

export interface CodexLocations { home: string }

export function codexLocations(env: NodeJS.ProcessEnv = process.env, home = homedir()): CodexLocations {
  return { home: env.CODEX_HOME || join(home, '.codex') };
}

export interface TomlTable { path: string[]; values: Record<string, string | boolean> }

function splitPath(header: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  for (const char of header) {
    if (quote) { if (char === quote) quote = ''; else current += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '.') { parts.push(current.trim()); current = ''; }
    else current += char;
  }
  parts.push(current.trim());
  return parts;
}

/** Minimal TOML reader: table headers plus scalar string and boolean values. Arrays and inline tables are skipped. */
export function scanToml(text: string): TomlTable[] {
  const tables: TomlTable[] = [{ path: [], values: {} }];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/.exec(line);
    if (header) { tables.push({ path: splitPath(header[1]), values: {} }); continue; }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const value = pair[2].trim();
    const table = tables[tables.length - 1];
    const basic = /^"((?:[^"\\]|\\.)*)"/.exec(value);
    const literal = /^'([^']*)'/.exec(value);
    if (basic) {
      try { table.values[pair[1]] = JSON.parse('"' + basic[1] + '"') as string; } catch {}
    } else if (literal) table.values[pair[1]] = literal[1];
    else if (/^(true|false)\b/.test(value)) table.values[pair[1]] = value.startsWith('true');
  }
  return tables;
}

async function sessionFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) files.push(file);
    }
  };
  await walk(root);
  return files;
}

/** Codex names its transcripts rollout-YYYY-MM-DDTHH-MM-SS-<id>.jsonl in local time. */
export function startedFrom(name: string): number | null {
  const match = /^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(name);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const time = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(time) ? time : null;
}

async function scanSessions(home: string, warnings: string[]): Promise<InventoryProject[]> {
  const limit = 20000;
  const all = [
    ...(await sessionFiles(join(home, 'sessions'))).map(file => ({ file, archived: false })),
    ...(await sessionFiles(join(home, 'archived_sessions'))).map(file => ({ file, archived: true }))
  ];
  if (all.length > limit) warnings.push('Only the first ' + limit + ' Codex sessions were scanned.');
  const groups = new Map<string, { path: string | null; sessions: number; archived: number; bytes: number; created: number; updated: number; folder: string }>();
  for (const { file, archived } of all.slice(0, limit)) {
    try {
      const info = await stat(file);
      const path = cwdFrom(await readHead(file, 65536));
      const key = path ? path.toLowerCase() : '';
      const created = startedFrom(file.split(/[\\/]/).pop() ?? '') ?? (info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs);
      const group = groups.get(key) ?? { path, sessions: 0, archived: 0, bytes: 0, created: Infinity, updated: 0, folder: join(home, archived ? 'archived_sessions' : 'sessions') };
      group.sessions++;
      if (archived) group.archived++;
      group.bytes += info.size;
      group.created = Math.min(group.created, created);
      group.updated = Math.max(group.updated, info.mtimeMs);
      groups.set(key, group);
    } catch {}
  }
  return [...groups.values()].map(group => ({
    name: group.path ? lastSegment(group.path) : 'Unknown project', path: group.path, folder: group.folder,
    sessions: group.sessions, archived: group.archived, bytes: group.bytes,
    created: Number.isFinite(group.created) ? isoDate(group.created) : null, updated: isoDate(group.updated)
  })).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
}

export async function scanCodex(locations: CodexLocations = codexLocations()): Promise<Inventory> {
  const { home } = locations;
  const result: Inventory = { provider: 'codex', home, scannedAt: new Date().toISOString(), ...emptyInventory() };
  result.projects = await scanSessions(home, result.warnings);
  result.sessionCount = result.projects.reduce((sum, item) => sum + item.sessions, 0);
  result.sessionBytes = result.projects.reduce((sum, item) => sum + item.bytes, 0);

  const skills = [...await skillsIn(join(home, 'skills'), 'user'), ...await skillsIn(join(home, 'skills', '.system'), 'system')];
  const plugins: InventoryPlugin[] = [];
  const mcpServers: InventoryMcp[] = [];
  try {
    for (const table of scanToml(await readFile(join(home, 'config.toml'), 'utf8'))) {
      const [section, name, extra] = table.path;
      if (section === 'mcp_servers' && name && extra === undefined) {
        mcpServers.push(describeServer(name, table.values, 'config.toml', typeof table.values.enabled === 'boolean' ? table.values.enabled : null));
      } else if (section === 'plugins' && name && extra === undefined) {
        const [plugin, market = 'plugin'] = name.split('@');
        plugins.push({ name: plugin, version: null, enabled: typeof table.values.enabled === 'boolean' ? table.values.enabled : null, source: market });
      }
    }
  } catch {}

  result.skills = skills.sort((a, b) => a.name.localeCompare(b.name));
  result.plugins = plugins.sort((a, b) => a.name.localeCompare(b.name));
  result.mcpServers = mcpServers.sort((a, b) => a.name.localeCompare(b.name));
  result.files = (await Promise.all([
    fileInfo('config.toml', join(home, 'config.toml')),
    fileInfo('AGENTS.md (global instructions)', join(home, 'AGENTS.md'))
  ])).filter(item => item !== null);
  return result;
}
