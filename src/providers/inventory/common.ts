import { lstat, open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Inventory, InventoryFile, InventoryMcp, InventorySkill } from '../../shared/contracts.js';
import { asRecord } from '../../shared/validation.js';

/** Files that hold login tokens. Scanners never open them and the app never opens them for the user. */
export const credentialFiles = new Set(['.credentials.json', 'auth.json']);

export interface TreeStats { bytes: number; files: number; newest: number; truncated: boolean }
export interface Budget { left: number }

/** Total size of a folder, skipping symlinks so a link can never lead the scan outside the folder. */
export async function treeStats(directory: string, budget: Budget = { left: 200000 }): Promise<TreeStats> {
  const total: TreeStats = { bytes: 0, files: 0, newest: 0, truncated: false };
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return total; }
  for (const entry of entries) {
    if (budget.left <= 0) { total.truncated = true; break; }
    budget.left--;
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const inner = await treeStats(file, budget);
      total.bytes += inner.bytes;
      total.files += inner.files;
      total.newest = Math.max(total.newest, inner.newest);
      total.truncated ||= inner.truncated;
    } else if (entry.isFile()) {
      try {
        const info = await stat(file);
        total.bytes += info.size;
        total.files++;
        total.newest = Math.max(total.newest, info.mtimeMs);
      } catch {}
    }
  }
  return total;
}

export async function readHead(file: string, bytes: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

export async function readJson(file: string): Promise<unknown> {
  try {
    const handle = await open(file, 'r');
    try { return JSON.parse((await handle.readFile('utf8')).replace(/^﻿/, '')); }
    finally { await handle.close(); }
  } catch { return null; }
}

export const lastSegment = (value: string) => value.split(/[\\/]+/).filter(Boolean).pop() ?? value;

/** The working directory recorded near the top of a session transcript. */
export function cwdFrom(head: string): string | null {
  const match = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(head);
  if (!match) return null;
  try {
    const value: unknown = JSON.parse('"' + match[1] + '"');
    return typeof value === 'string' && value ? value : null;
  } catch { return null; }
}

export function frontmatter(text: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''));
  const fields: Record<string, string> = {};
  if (!block) return fields;
  for (const line of block[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return fields;
}

/** Skill folders that contain a SKILL.md, described by its front matter. */
export async function skillsIn(directory: string, source: string): Promise<InventorySkill[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const skills: InventorySkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const folder = join(directory, entry.name);
    try {
      const file = join(folder, 'SKILL.md');
      if (!(await lstat(file)).isFile()) continue;
      const fields = frontmatter(await readHead(file, 4096));
      skills.push({ name: fields.name || entry.name, description: (fields.description ?? '').slice(0, 240), source, path: folder });
    } catch {}
  }
  return skills;
}

export async function fileInfo(label: string, file: string): Promise<InventoryFile | null> {
  if (credentialFiles.has(basename(file).toLowerCase())) return null;
  try {
    const info = await stat(file);
    return info.isFile() ? { label, path: file, bytes: info.size, modified: new Date(info.mtimeMs).toISOString() } : null;
  } catch { return null; }
}

/** Reduce an MCP server definition to its launcher name or credential-free URL; arguments and env are never kept. */
export function describeServer(name: string, value: unknown, source: string, enabled: boolean | null = null): InventoryMcp {
  const entry = asRecord(value);
  let target = '';
  if (typeof entry.url === 'string') {
    try {
      const url = new URL(entry.url);
      target = url.protocol + '//' + url.host + (url.pathname === '/' ? '' : url.pathname);
    } catch { target = 'invalid URL'; }
  } else if (typeof entry.command === 'string') target = lastSegment(entry.command);
  const transport = typeof entry.type === 'string' ? entry.type : typeof entry.url === 'string' ? 'http' : 'stdio';
  return { name, transport, target, source, enabled };
}

export function emptyInventory(): Omit<Inventory, 'provider' | 'home' | 'scannedAt'> {
  return { projects: [], skills: [], plugins: [], mcpServers: [], files: [], sessionCount: 0, sessionBytes: 0, warnings: [] };
}
