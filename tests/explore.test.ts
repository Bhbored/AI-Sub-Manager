import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDocument, saveDocument, verifyLocalPath, type DocumentTarget } from '../src/providers/inventory/documents.js';
import { ExploreService } from '../src/providers/inventory/explore.js';
import { verifiedHistory, verifyDeleteTree } from '../src/providers/inventory/history.js';

async function workspace(run: (path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), 'explore-test-'));
  try { await run(path); }
  finally { await rm(path, { recursive: true, force: true }); }
}

test('Claude MCP edits expose only user servers and merge unrelated external state changes', () => workspace(async root => {
  const file = join(root, '.claude.json');
  const target: DocumentTarget = { file, root, language: 'json', label: 'MCP', writable: true, mcp: 'claude' };
  const original = { account: 'private', projects: { demo: { trust: true } }, mcpServers: { one: { command: 'node' } } };
  await writeFile(file, JSON.stringify(original));
  const opened = await readDocument(target);
  assert.deepEqual(JSON.parse(opened.text), original.mcpServers);
  await writeFile(file, JSON.stringify({ ...original, account: 'new-private' }));
  await assert.rejects(saveDocument(target, opened.revision, '[]'), /JSON object/);
  const saved = await saveDocument(target, opened.revision, '{"two":{"command":"node"}}');
  assert.notEqual(saved.revision, opened.revision);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
    ...original, account: 'new-private', mcpServers: { two: { command: 'node' } }
  });
  await assert.rejects(saveDocument(target, opened.revision, '{}'), /changed on disk/);
}));

test('TOML saves preserve comments and reject invalid syntax and linked paths', () => workspace(async root => {
  const file = join(root, 'config.toml');
  const text = '# notes\r\nmodel = "example"\r\n\r\n[mcp_servers.demo]\r\ncommand = "node"\r\n';
  await writeFile(file, text);
  const target: DocumentTarget = { root, file, language: 'toml', label: 'MCP', writable: true, mcp: 'codex' };
  const opened = await readDocument(target);
  assert.equal(opened.revealLine, 4);
  await assert.rejects(saveDocument(target, opened.revision, '[invalid'), /valid TOML/);
  await saveDocument(target, opened.revision, opened.text.replace('"node"', '"npx"'));
  assert.equal(await readFile(file, 'utf8'), text.replace('"node"', '"npx"'));
  const link = join(root, 'linked');
  await symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyLocalPath(root, join(link, 'config.toml'), 'file'), /Linked/);
}));

test('Claude history deletion refreshes totals and preserves source files and saved project state', () => workspace(async root => {
  const home = join(root, 'claude');
  const history = join(home, 'projects', 'one');
  const source = join(root, 'repo');
  await mkdir(history, { recursive: true });
  await mkdir(source);
  await writeFile(join(source, 'source.ts'), 'export {};');
  const state = join(home, '.claude.json');
  const stateData = JSON.stringify({ projects: { [source]: { trust: true } } });
  await writeFile(state, stateData);
  await writeFile(join(history, 'one.jsonl'), JSON.stringify({ cwd: source }));
  const old = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home;
  try {
    const service = new ExploreService(root, 'test', async () => { throw Error('unexpected trash'); });
    const listed = await service.inventory('claude');
    const id = listed.projects[0].id;
    assert.ok(id && listed.sessionBytes > 0);
    assert.equal(await service.remove('claude', id, async () => false), null);
    await assert.rejects(service.remove('codex', id, async () => true), /no longer listed/);
    const result = await service.remove('claude', id, async () => true);
    assert.equal(result?.inventory.sessionCount, 0);
    assert.equal(result?.inventory.sessionBytes, 0);
    assert.equal(await readFile(state, 'utf8'), stateData);
    assert.equal(await readFile(join(source, 'source.ts'), 'utf8'), 'export {};');
  } finally {
    if (old === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = old;
  }
}));

test('Codex verifies archived descendants and refuses threads from a different project', async () => {
  const cwd = join(tmpdir(), 'work');
  const root = { id: 'root', cwd, ephemeral: false, status: { type: 'notLoaded' } };
  const child = { ...root, id: 'archived-child' };
  let childCwd = cwd;
  const client = {
    async request(method: string, params?: Record<string, unknown>) {
      if (method === 'thread/read') return { thread: root };
      return { nextCursor: null, data: params?.ancestorThreadId === 'root'
        ? params.archived ? [{ ...child, cwd: childCwd }] : []
        : params?.ancestorThreadId ? [] : params?.archived ? [child] : [root] };
    }
  };
  assert.deepEqual(await verifiedHistory(client, cwd, 1), { roots: ['root'], ids: ['archived-child', 'root'] });
  await verifyDeleteTree(client, cwd, 'root', new Set(['root', 'archived-child']));
  await assert.rejects(verifyDeleteTree(client, cwd, 'root', new Set(['root'])), /history changed/);
  childCwd = join(tmpdir(), 'other-project');
  await assert.rejects(verifiedHistory(client, cwd, 1), /outside this project/);
});

test('Claude edits and trashes a personal skill and uninstalls only user plugins through the CLI', t => workspace(async root => {
  const home = join(root, 'claude');
  const skill = join(home, 'skills', 'example');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), '# Example\n');
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home;
  t.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });
  const calls: string[][] = [];
  const user = { id: 'example@catalog', scope: 'user' };
  const project = { id: 'other@catalog', scope: 'project' };
  let plugins = [user, project];
  const service = new ExploreService(root, 'test', path => rename(path, join(root, 'trashed')), () => ({
    installed: async () => ({ executable: 'fixture', prefix: [], location: root, version: '1.0' }),
    start: () => { throw Error('unexpected CLI start'); },
    invoke: async (_info, args) => {
      calls.push(args);
      if (args[1] === 'list') return { stdout: JSON.stringify(plugins) };
      if (!args.includes('--help')) plugins = [project];
      return { stdout: '' };
    }
  }));
  const listed = await service.inventory('claude', true);
  const skillId = listed.skills[0].id!;
  const pluginId = listed.plugins[0].id!;
  assert.equal(listed.plugins[1].id, undefined);
  const opened = await service.read('claude', skillId);
  await service.save('claude', skillId, opened.revision, '# Updated\n');
  assert.equal((await service.remove('claude', skillId, async () => true))?.inventory.skills.length, 0);
  assert.equal(await readFile(join(root, 'trashed', 'SKILL.md'), 'utf8'), '# Updated\n');
  await service.inventory('claude', true);
  assert.equal(await service.remove('claude', pluginId, async () => false), null);
  const removed = await service.remove('claude', pluginId, async (_title, detail) => detail.includes('persistent data'));
  assert.deepEqual(removed?.inventory.plugins.map(item => item.selector), [project.id]);
  assert.deepEqual(calls.filter(args => args[1] === 'uninstall' && !args.includes('--help')), [
    ['plugin', 'uninstall', '--scope', 'user', user.id]
  ]);
}));
