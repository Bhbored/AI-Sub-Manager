import { normalize } from 'node:path';
import type { CliInfo, CliTool } from '../cli.js';
import { CodexClient } from '../codex/client.js';
import { asRecord } from '../../shared/validation.js';

const sourceKinds = ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview',
  'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'];
const sameProject = (left: string, right: string) => process.platform === 'win32'
  ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right);

export async function withHistoryClient<T>(tool: CliTool, info: CliInfo, version: string, action: (client: CodexClient) => Promise<T>) {
  const client = new CodexClient(() => tool.start(info, ['app-server', '--listen', 'stdio://']), version, true);
  try { await client.start(); return await action(client); }
  finally { client.stop(); }
}

async function list(client: Pick<CodexClient, 'request'>, filter: Record<string, string>) {
  const entries: Record<string, unknown>[] = [];
  for (const archived of [false, true]) {
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const result: Record<string, unknown> = asRecord(await client.request('thread/list', {
        ...filter, archived, cursor, limit: 100, modelProviders: [], sourceKinds, useStateDbOnly: true
      }));
      if (!Array.isArray(result.data) || !(result.nextCursor === null || typeof result.nextCursor === 'string')) {
        throw Error('The installed Codex CLI could not verify the local session inventory.');
      }
      entries.push(...result.data.map(asRecord));
      cursor = result.nextCursor;
      if (cursor !== null && (seen.has(cursor) || seen.size >= 100)) throw Error('Codex history could not be verified completely.');
      if (cursor !== null) seen.add(cursor);
    } while (cursor !== null);
  }
  return entries;
}

function verifiedId(thread: Record<string, unknown>, cwd: string) {
  if (typeof thread.id !== 'string' || !thread.id || typeof thread.cwd !== 'string' || !sameProject(thread.cwd, cwd) ||
      thread.ephemeral !== false || thread.environmentId || asRecord(thread.status).type === 'active') {
    throw Error('A related Codex session is active, outside this project, or cannot be verified.');
  }
  return thread.id;
}

export async function verifiedHistory(client: Pick<CodexClient, 'request'>, cwd: string, minimumCount: number) {
  const roots = await list(client, { cwd });
  if (!roots.length || roots.length < minimumCount) throw Error('Codex could not verify all saved sessions for this project.');
  const rootIds = new Set<string>();
  const descendants = new Set<string>();
  for (const thread of roots) {
    const id = verifiedId(thread, cwd);
    if (rootIds.has(id)) continue;
    rootIds.add(id);
    for (const child of await list(client, { ancestorThreadId: id })) {
      descendants.add(verifiedId(child, cwd));
    }
  }
  const deleteRoots = [...rootIds].filter(id => !descendants.has(id));
  if (!deleteRoots.length) throw Error('Codex reported an invalid session tree.');
  return { roots: deleteRoots, ids: [...new Set([...rootIds, ...descendants])].sort() };
}

export async function verifyDeleteTree(client: Pick<CodexClient, 'request'>, cwd: string, threadId: string, approved: Set<string>) {
  const result = asRecord(await client.request('thread/read', { threadId, includeTurns: false }));
  if (verifiedId(asRecord(result.thread), cwd) !== threadId || !approved.has(threadId)) throw Error('The history changed.');
  for (const thread of await list(client, { ancestorThreadId: threadId })) {
    if (!approved.has(verifiedId(thread, cwd))) throw Error('The history changed.');
  }
}
