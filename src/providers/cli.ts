import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { ProviderId, ProviderStatus } from '../shared/contracts.js';
import { createTool as createWindowsTool } from './windows-cli.js';
import { createPosixTool } from './posix-cli.js';

export interface Candidate {
  executable: string;
  prefix: string[];
  location: string;
}
export interface CliInfo extends Candidate { version: string }
export interface ProviderAdapter { refresh(info: CliInfo): Promise<ProviderStatus> }
export interface CliTool {
  installed(): Promise<CliInfo | null>;
  invoke(info: Candidate, args: string[]): Promise<{ stdout: string }>;
  start(info: CliInfo, args: string[]): ChildProcessByStdio<Writable, Readable, null>;
}

/** Child-process environment without API credentials or variables that change how Node/Electron starts. */
export function cliEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(source).filter(([key]) =>
    !/^(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|NODE_OPTIONS|ELECTRON_RUN_AS_NODE)$/i.test(key)));
  env.DISABLE_AUTOUPDATER = '1';
  return env;
}

export function createPlatformTool(root: string, id: ProviderId, platform: NodeJS.Platform = process.platform): CliTool {
  return platform === 'win32' ? createWindowsTool(root, id) : createPosixTool(root, id);
}
