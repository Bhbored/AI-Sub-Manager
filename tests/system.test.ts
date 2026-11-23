import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTool, parseWhere } from '../src/providers/windows-cli.js';
import { defaults, normalize } from '../src/shared/preferences.js';
import { openStore } from '../src/desktop/storage.js';

test('PATH discovery disregards relative paths and other executables', () => {
  assert.deepEqual(parseWhere('codex.exe\r\nC:\\Program Files\\Tools\\codex.exe\r\nC:\\Tools\\evil.exe', 'codex', '.exe'), ['C:\\Program Files\\Tools\\codex.exe']);
});

test('CLI reads version with a direct executable and keeps the CLI profile', async () => {
  const calls: { exe: string; args: string[]; options?: { env?: NodeJS.ProcessEnv } | null }[] = [];
  const file = 'C:\\Program Files\\Tools\\claude.exe';
  const cli = createTool('C:\\Monitor', 'claude', async (exe, args, options) => {
    calls.push({ exe, args, options });
    return { stdout: args[0] === '--version' ? '2.1.330 (Claude Code)' : file };
  });
  const found = await cli.installed();
  assert.equal(found?.version, '2.1.330');
  assert.equal(calls[0].args[0], '$PATH:claude.exe');
  assert.equal(calls[1].exe, file);
  assert.ok(!Object.hasOwn(calls[1].options?.env ?? {}, 'ANTHROPIC_API_KEY'));
});

test('npm Codex discovery invokes its module without a command shell', async () => {
  const calls: { exe: string; args: string[]; options?: { env?: NodeJS.ProcessEnv } | null }[] = [];
  const cli = createTool('C:\\Monitor', 'codex', async (exe, args) => {
    calls.push({ exe, args });
    if (args[0] === '$PATH:codex.exe') throw Object.assign(Error(), {code: 1});
    return { stdout: args[0] === '$PATH:codex.cmd' ? 'C:\\npm global\\codex.cmd' : 'codex-cli 0.171.0' };
  }, async () => ({ isFile: () => true }));
  assert.equal((await cli.installed())?.version, '0.171.0');
  assert.deepEqual(calls[2], { exe: 'C:\\npm global\\node.exe', args: ['C:\\npm global\\node_modules\\@openai\\codex\\bin\\codex.js', '--version'] });
});

test('preferences reject invalid dates, intervals, and property types', () => {
  assert.throws(() => normalize({ ...defaults(), interval: '10' }));
  assert.throws(() => normalize({ ...defaults(), paused: 1 }));
  const setting = defaults();
  setting.subscriptions.codex.anchor = '2026-02-29';
  assert.throws(() => normalize(setting));
});

test('a new SQLite database migrates and persists settings and snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monitor-test-'));
  try {
    let db = openStore(directory);
    db.write('settings', defaults());
    db.snapshot('codex', { state: 'ready', connected: true, collectedAt: '2026-01-01T00:00:00.000Z', windows: [] });
    db.close();
    db = openStore(directory);
    try {
      assert.deepEqual(db.read('settings'), defaults());
      assert.equal(db.latest('codex')?.collectedAt, '2026-01-01T00:00:00.000Z');
      assert.equal(db.latest('claude'), null);
    } finally { db.close(); }
  } finally { await rm(directory, { recursive: true }); }
});
