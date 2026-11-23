import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { findOnPath, createPosixTool } from '../src/providers/posix-cli.js';
import { createPlatformTool } from '../src/providers/cli.js';
import { setAutostart } from '../src/desktop/autostart.js';

test('POSIX discovery ignores relative PATH entries, de-duplicates and keeps fallbacks last', () => {
  const found = findOnPath('claude', { PATH: ['relative/bin', '/opt/tools', '/opt/tools'].join(delimiter) }, '/home/u', file => file.endsWith('claude'));
  assert.equal(found[0], join('/opt/tools', 'claude'));
  assert.equal(found.filter(file => file === join('/opt/tools', 'claude')).length, 1);
  assert.ok(found.includes(join('/home/u', '.local/bin', 'claude')));
  assert.ok(!found.some(file => file.startsWith('relative')));
});

test('POSIX tool runs the CLI directly, scrubs credentials and exposes its own folder to child processes', async () => {
  const calls: { exe: string; args: string[]; env?: NodeJS.ProcessEnv }[] = [];
  process.env.ANTHROPIC_API_KEY = 'secret';
  const tool = createPosixTool('/tmp', 'codex', async (exe, args, options) => {
    calls.push({ exe, args, env: (options as { env?: NodeJS.ProcessEnv } | null)?.env });
    return { stdout: 'codex-cli 0.9.1' };
  }, () => ['/home/u/.nvm/versions/node/v24/bin/codex']);
  const info = await tool.installed();
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(info?.version, '0.9.1');
  assert.equal(calls[0].exe, '/home/u/.nvm/versions/node/v24/bin/codex');
  assert.deepEqual(calls[0].args, ['--version']);
  assert.ok(!Object.hasOwn(calls[0].env ?? {}, 'ANTHROPIC_API_KEY'));
  assert.ok(calls[0].env?.PATH?.startsWith('/home/u/.nvm/versions/node/v24/bin' + delimiter));
});

test('POSIX tool reports a missing CLI and a CLI without a version', async () => {
  assert.equal(await createPosixTool('/tmp', 'claude', async () => ({ stdout: '' }), () => []).installed(), null);
  await assert.rejects(createPosixTool('/tmp', 'claude', async () => ({ stdout: 'hello' }), () => ['/usr/bin/claude']).installed());
});

test('platform factory returns a tool on every platform', () => {
  for (const platform of ['win32', 'linux', 'darwin'] as const) assert.equal(typeof createPlatformTool('/tmp', 'claude', platform).installed, 'function');
});

test('autostart writes a quoted XDG entry and removes it again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'autostart-'));
  const file = join(dir, 'autostart', 'ai-usage-monitor.desktop');
  try {
    setAutostart(true, '/opt/My "App"/ai-usage-monitor', file);
    const text = await readFile(file, 'utf8');
    assert.match(text, /^\[Desktop Entry\]/);
    assert.match(text, /Exec="\/opt\/My \\"App\\"\/ai-usage-monitor" --startup/);
    setAutostart(false, '', file);
    assert.equal(existsSync(file), false);
    setAutostart(false, '', file);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
