import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ExploreDocument } from '../../shared/contracts.js';

const maxBytes = 1024 * 1024;
const revisionOf = (text: string) => createHash('sha256').update(text).digest('hex');
const normalized = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const comparable = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;

export interface DocumentTarget {
  file: string;
  root: string;
  label: string;
  language: ExploreDocument['language'];
  writable: boolean;
  mcp?: 'claude' | 'codex';
}

export async function verifyLocalPath(root: string, path: string, kind: 'file' | 'directory', allowMissing = false) {
  if (!isAbsolute(root) || !isAbsolute(path)) throw Error('Invalid provider location.');
  const offset = relative(root, path);
  if (!offset || offset === '..' || offset.startsWith('..' + sep) || isAbsolute(offset)) {
    throw Error('That item is outside the selected provider location.');
  }
  let candidate = await realpath(root);
  const parts = offset.split(sep);
  for (const [index, part] of parts.entries()) {
    candidate = join(candidate, part);
    const last = index === parts.length - 1;
    let info;
    try { info = await lstat(candidate); }
    catch (error) {
      if (allowMissing && last && (error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw Error('That item no longer exists.');
    }
    if (info.isSymbolicLink() || comparable(await realpath(candidate)) !== comparable(resolve(candidate))) {
      throw Error('Linked provider items cannot be changed here.');
    }
    if (last && kind === 'file' ? !info.isFile() || info.nlink > 1 : !info.isDirectory()) {
      throw Error('That item is not a supported provider file or folder.');
    }
  }
  return candidate;
}

function objectJson(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(normalized(text)); }
  catch { throw Error('Enter valid JSON before saving.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('This configuration must be a JSON object.');
  return value as Record<string, unknown>;
}

async function load(target: DocumentTarget) {
  const path = await verifyLocalPath(target.root, target.file, 'file', Boolean(target.mcp));
  let original = '';
  let mode = 0o600;
  let exists = false;
  try {
    const handle = await open(path, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink > 1 || info.size > maxBytes) throw Error('Explore can edit files up to 1 MiB.');
      const bytes = Buffer.allocUnsafe(maxBytes + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > maxBytes) throw Error('Explore can edit files up to 1 MiB.');
      const contents = bytes.subarray(0, bytesRead);
      original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(contents);
      mode = info.mode & 0o777;
      exists = true;
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !target.mcp) throw error;
  }
  const state = target.mcp === 'claude' ? (exists ? objectJson(original) : {}) : null;
  const text = state ? JSON.stringify(state.mcpServers ?? {}, null, 2) + '\n' : normalized(original);
  return { path, original, mode, state, text, revision: revisionOf(state ? text : original) };
}

export async function readDocument(target: DocumentTarget): Promise<ExploreDocument> {
  const { text, revision } = await load(target);
  const line = target.mcp === 'codex' ? text.split('\n').findIndex(value => /^\s*\[{1,2}\s*(?:mcp_servers\b|"mcp_servers"|'mcp_servers')/.test(value)) : -1;
  return { label: target.label, language: target.language, text, revision, writable: target.writable, revealLine: line < 0 ? undefined : line + 1 };
}

export async function saveDocument(target: DocumentTarget, revision: unknown, draft: unknown): Promise<ExploreDocument> {
  if (!target.writable) throw Error('This document is read-only.');
  if (typeof draft !== 'string' || Buffer.byteLength(draft) > maxBytes || typeof revision !== 'string') {
    throw Error('The document is invalid or exceeds 1 MiB.');
  }
  const before = await load(target);
  if (before.revision !== revision) throw Error('This file changed on disk. Reload it or copy your draft.');
  const json = target.language === 'json' ? objectJson(draft) : null;
  if (target.language === 'toml') {
    try { parseToml(draft); } catch { throw Error('Enter valid TOML before saving.'); }
  }
  if (target.mcp === 'claude' && Object.values(json ?? {}).some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw Error('Each MCP server must be a JSON object.');
  }
  const text = before.state ? JSON.stringify({ ...before.state, mcpServers: json }, null, 2) + '\n' : normalized(draft);
  const updated = (before.original.startsWith('\uFEFF') ? '\uFEFF' : '') +
    (before.original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  if (Buffer.byteLength(updated) > maxBytes) throw Error('The updated configuration exceeds 1 MiB.');
  const temp = join(dirname(before.path), '.' + basename(before.path) + '.' + randomUUID() + '.tmp');
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(updated, 'utf8'); await file.chmod(before.mode); await file.sync(); }
    finally { await file.close(); }
    const latest = await load(target);
    if (before.path !== latest.path || latest.original !== before.original) {
      throw Error('This file changed on disk. Reload it or copy your draft.');
    }
    await rename(temp, before.path);
  } finally { await unlink(temp).catch(() => {}); }
  return readDocument(target);
}
