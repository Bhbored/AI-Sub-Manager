import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StatusLine } from '../../shared/contracts.js';
import { asRecord } from '../../shared/validation.js';

const marker = 'statusline.cjs';
const quote = (value: string) => '"' + value.replace(/\\/g, '/') + '"';

export function settingsFile(env = process.env, home = os.homedir()) {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json');
}

export function buildCommand(script: string, usageFile: string) {
  return 'node ' + quote(script.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)) + ' ' + quote(usageFile);
}

interface Setup {
  file: string;
  command: string;
  hasNode?: boolean;
}

export function ensureStatusLine({ file, command, hasNode = true }: Setup): StatusLine {
  try {
    let settings: Record<string, unknown> = {};
    try {
      const input: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (!input || typeof input !== 'object' || Array.isArray(input)) return 'error';
      settings = asRecord(input);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') return 'error';
    }
    const exists = settings.statusLine !== undefined;
    const current = asRecord(settings.statusLine);
    if (exists) {
      if (current.type !== 'command' || typeof current.command !== 'string' || !current.command.includes(marker)) return 'foreign';
      if (current.command === command) return 'ok';
    }
    if (!hasNode) return 'no-node';
    settings.statusLine = { ...current, type: 'command', command };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(temporary, file);
    return exists ? 'updated' : 'set';
  } catch { return 'error'; }
}
