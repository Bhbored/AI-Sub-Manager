import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix } from 'node:path';
import type { ProviderId } from '../shared/contracts.js';
import { cliEnvironment, type Candidate, type CliInfo, type CliTool } from './cli.js';

const run = promisify(execFile);
const { delimiter, dirname, isAbsolute, join } = posix;
type Run = (file: string, args: string[], options: Parameters<typeof run>[2]) => Promise<{ stdout: string }>;
type Find = (name: string) => string[];

function isExecutable(file: string) {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.X_OK);
    return true;
  } catch { return false; }
}

/** Directories where user-level installs usually live; a desktop launcher's PATH often omits them. */
function fallbackDirectories(home: string) {
  const directories = ['.local/bin', '.claude/local', '.npm-global/bin', '.volta/bin', '.bun/bin'].map(entry => join(home, entry));
  try {
    const versions = join(home, '.nvm/versions/node');
    for (const version of readdirSync(versions).sort().reverse()) directories.push(join(versions, version, 'bin'));
  } catch {}
  return [...directories, '/usr/local/bin', '/usr/bin', '/snap/bin'];
}

/** Absolute, executable matches for a command name: the inherited PATH first, then well-known user install folders. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, home = homedir(), executable = isExecutable): string[] {
  const directories = [...(env.PATH ?? '').split(delimiter), ...fallbackDirectories(home)].filter(directory => directory && isAbsolute(directory));
  return [...new Set(directories.map(directory => join(directory, name)).filter(executable))];
}

export function createPosixTool(root: string, id: ProviderId, execute: Run = run, find: Find = name => findOnPath(name)): CliTool {
  const options = { cwd: root, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' as const };
  const base = cliEnvironment();
  // Launchers such as nvm install "#!/usr/bin/env node" scripts; make the sibling node resolvable even with a minimal PATH.
  const environment = (file: string) => ({ ...base, PATH: [dirname(file), base.PATH].filter(Boolean).join(delimiter) });
  const invoke = (info: Candidate, args: string[]) =>
    execute(info.executable, [...info.prefix, ...args], { ...options, env: environment(info.executable) });
  async function installed(): Promise<CliInfo | null> {
    const candidates: Candidate[] = find(id).map(executable => ({ executable, prefix: [], location: executable }));
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
    start: (info, args) => spawn(info.executable, [...info.prefix, ...args],
      { cwd: root, env: environment(info.executable), stdio: ['pipe', 'pipe', 'ignore'] })
  };
}
