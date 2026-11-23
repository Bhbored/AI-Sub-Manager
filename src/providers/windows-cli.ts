import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import type { ProviderId, ProviderStatus } from '../shared/contracts.js';

const run = promisify(execFile);
const names = { codex: '@openai/codex', claude: '@anthropic-ai/claude-code' };
interface Candidate {
  executable: string;
  prefix: string[];
  location: string;
}
export interface CliInfo extends Candidate { version: string }
export interface ProviderAdapter { refresh(info: CliInfo): Promise<ProviderStatus> }
type Run = (file: string, args: string[], options: Parameters<typeof run>[2]) => Promise<{ stdout: string }>;
type FileStat = (file: string) => Promise<{ isFile(): boolean }>;

export function parseWhere(output: string, name: string, extension: string): string[] {
  return [...new Set(output.split(/\r?\n/).map(line => line.trim()).filter(line =>
    /^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\)/.test(line) &&
    path.basename(line).toLowerCase() === name + extension))];
}

export function createTool(root: string, id: ProviderId, execute: Run = run, fileStat: FileStat = stat) {
  const where = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');
  const options = { windowsHide: true, cwd: root, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' as const };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|NODE_OPTIONS|ELECTRON_RUN_AS_NODE)$/i.test(key)));
  env.DISABLE_AUTOUPDATER = '1';
  async function locate(name: string, extension: string) {
    try {
      const { stdout } = await execute(where, ['$PATH:' + name + extension], options);
      return parseWhere(stdout, name, extension);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 1) return [];
      throw error;
    }
  }
  async function exists(file: string) {
    try { return (await fileStat(file)).isFile(); }
    catch { return false; }
  }
  function invoke(info: Candidate, args: string[]) {
    return execute(info.executable, [...info.prefix, ...args], { ...options, env });
  }
  async function installed(): Promise<CliInfo | null> {
    const candidates: Candidate[] = (await locate(id, '.exe')).map(executable => ({ executable, prefix: [], location: executable }));
    if (!candidates.length) {
      for (const shim of await locate(id, '.cmd')) {
        const directory = path.dirname(shim);
        const entry = path.join(directory, 'node_modules', names[id], 'bin', id === 'codex' ? 'codex.js' : 'claude.exe');
        if (!await exists(entry)) continue;
        if (id === 'claude') candidates.push({ executable: entry, prefix: [], location: shim });
        else {
          const adjacent = path.join(directory, 'node.exe');
          const executable = await exists(adjacent) ? adjacent : (await locate('node', '.exe'))[0];
          if (executable) candidates.push({ executable, prefix: [entry], location: shim });
        }
      }
    }
    if (!candidates.length) return null;
    for (const candidate of candidates) {
      try {
        const { stdout } = await invoke(candidate, ['--version']);
        const version = stdout.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0];
        if (version) return { ...candidate, version };
      } catch {}
    }
    throw Error('The CLI was found on PATH but did not report its version.');
  }
  return {
    installed, invoke,
    start: (info: CliInfo, args: string[]) => spawn(info.executable, [...info.prefix, ...args],
      { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  };
}
export type CliTool = ReturnType<typeof createTool>;
