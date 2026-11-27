import { realpath, stat } from 'node:fs/promises';
import { basename, extname, relative, isAbsolute, sep } from 'node:path';
import type { Inventory, ProviderId } from '../../shared/contracts.js';
import { credentialFiles } from './common.js';
import { claudeLocations, scanClaude } from './claude.js';
import { codexLocations, scanCodex } from './codex.js';

export function scanInventory(id: ProviderId): Promise<Inventory> {
  return id === 'claude' ? scanClaude() : scanCodex();
}

/** Locations the app may open on the user's behalf. */
export function inventoryRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const claude = claudeLocations(env);
  return [claude.home, codexLocations(env).home];
}

const openableExtensions = new Set(['.json', '.toml', '.md']);

/** Resolve a path requested by the renderer, allowing only provider folders and their plain config/doc files. */
export async function resolveOpenable(target: unknown, roots: string[] = inventoryRoots()): Promise<string> {
  if (typeof target !== 'string' || !isAbsolute(target)) throw Error('Invalid path.');
  if (basename(target).toLowerCase() === '.claude.json') throw Error('Open user MCP settings through Explore.');
  const real = await realpath(target).catch(() => { throw Error('That item no longer exists.'); });
  let inRoot = false;
  for (const root of roots) {
    const resolved = await realpath(root).catch(() => null);
    if (!resolved) continue;
    const path = relative(resolved, real);
    if (path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path))) inRoot = true;
  }
  if (!inRoot) throw Error('That location is outside the Claude Code and Codex folders.');
  const info = await stat(real);
  if (info.isDirectory()) return real;
  if (credentialFiles.has(basename(real).toLowerCase())) throw Error('Credential files are never opened by this app.');
  if (basename(real).toLowerCase() === '.claude.json') throw Error('Open user MCP settings through Explore.');
  if (!openableExtensions.has(extname(real).toLowerCase())) throw Error('Only JSON, TOML and Markdown files can be opened.');
  return real;
}
