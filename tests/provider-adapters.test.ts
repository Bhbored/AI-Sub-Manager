import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCodex } from '../src/providers/codex/adapter.js';
import { createClaude } from '../src/providers/claude/adapter.js';
import { collect } from '../src/providers/claude/statusline.cjs';
const cli = { version: '1.2.3', executable: 'fixture', prefix: [], location: 'fixture' };

function codexFixture(account: Record<string, unknown>) {
  const requests: string[] = [];
  let stopped = false;
  const app = createCodex({
    start(_info, args) {
      assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(), stdout: new PassThrough(),
        kill() { stopped = true; child.stdin.end(); child.stdout.end(); return true; }
      });
      child.stdin.on('data', buffer => {
        const request = JSON.parse(buffer.toString());
        requests.push(request.method);
        if (request.method === 'initialize') assert.equal(request.params.clientInfo.version, '2.3.4');
        if (!request.id) return;
        const result = request.method === 'account/read' ? { account }
          : request.method === 'account/rateLimits/read'
          ? { rateLimits: { limitId: 'codex', primary: { usedPercent: 42, windowDurationMins: 300 } } }
          : {};
        child.stdout.write(JSON.stringify({ id: request.id, result }) + '\n');
      });
      return child;
    }
  }, '2.3.4');
  return { app, requests, wasStopped: () => stopped };
}

test('Codex requests only account status and limits for a ChatGPT sign-in', async () => {
  const { app, requests, wasStopped } = codexFixture({ type: 'chatgpt', planType: 'plus', email: 'fixture@example.test' });
  const result = await app.refresh(cli);
  assert.deepEqual(requests, ['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
  assert.equal(result.state, 'ready');
  assert.equal(result.windows[0].usedPercentage, 42);
  assert.equal(Object.hasOwn(result, 'email'), false);
  assert.equal(wasStopped(), true);
});

test('Codex does not request subscription limits for an API-key account', async () => {
  const { app, requests } = codexFixture({ type: 'apiKey' });
  assert.equal((await app.refresh(cli)).state, 'auth');
  assert.deepEqual(requests, ['initialize', 'initialized', 'account/read']);
});

test('Claude reports a connected subscription without inventing usage', async () => {
  const adapter = createClaude({ invoke: async (_info, args) => {
    assert.deepEqual(args, ['auth', 'status']);
    return { stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) };
  } }, 'usage.json', async () => { throw Error('ENOENT'); });
  const status = await adapter.refresh(cli);
  assert.equal(status.connected, true);
  assert.equal(status.state, 'unsupported');
  assert.equal(Object.hasOwn(status, 'windows'), false);
});


const loggedIn = { invoke: async () => ({ stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) }) };

test('Claude reports status-line limit windows and drops expired ones', async () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const record = {
    capturedAt: '2025-12-31T23:50:00Z',
    rate_limits: { five_hour: { used_percentage: 23.5, resets_at: now / 1000 + 3600 }, seven_day: { used_percentage: 40, resets_at: now / 1000 - 5 } }
  };
  const status = await createClaude(loggedIn, 'usage.json', async () => JSON.stringify(record), () => now).refresh(cli);
  assert.equal(status.state, 'ready');
  assert.deepEqual(status.windows.map(w => [w.durationMinutes, w.usedPercentage]), [[300, 23.5]]);
  assert.equal(status.collectedAt, '2025-12-31T23:50:00.000Z');
});

test('Claude falls back to setup guidance when no status-line capture exists', async () => {
  const status = await createClaude(loggedIn, 'usage.json', async () => { throw Error('ENOENT'); }).refresh(cli);
  assert.equal(status.state, 'unsupported');
  assert.equal(status.connected, true);
});

test('Claude tolerates unreadable auth status output', async () => {
  const status = await createClaude({ invoke: async () => ({ stdout: 'not json' }) }, 'usage.json').refresh(cli);
  assert.equal(status.state, 'unavailable');
});

test('status-line collector keeps only rate limits', async () => {
  const out = collect(JSON.stringify({ cwd: 'secret-folder', rate_limits: { five_hour: { used_percentage: 5, resets_at: 9, extra: 1 } } }), new Date(0));
  assert.deepEqual(out, { capturedAt: '1970-01-01T00:00:00.000Z', rate_limits: { five_hour: { used_percentage: 5, resets_at: 9 }, seven_day: undefined } });
  assert.equal(collect('{}'), null);
  assert.equal(collect('garbage'), null);
});

import { mkdtemp as mkd, readFile as rf, writeFile as wf, rm as rmr } from 'node:fs/promises';
import { tmpdir as td } from 'node:os';
import { join as jn } from 'node:path';
import { ensureStatusLine, buildCommand } from '../src/providers/claude/setup.js';

test('status-line setup sets when absent, keeps ours, updates a stale path and never overwrites a foreign one', async () => {
  const dir = await mkd(jn(td(), 'cc-setup-'));
  const file = jn(dir, 'settings.json');
  try {
    await wf(file, JSON.stringify({ theme: 'auto' }));
    const command = buildCommand(jn('C:', 'App', 'resources', 'app.asar', 'src', 'statusline.cjs'), jn('C:', 'Data', 'usage.json'));
    assert.match(command, /app\.asar\.unpacked/);
    assert.equal(ensureStatusLine({ file, command, hasNode: false }), 'no-node');
    assert.equal(ensureStatusLine({ file, command }), 'set');
    assert.equal(JSON.parse(await rf(file, 'utf8')).theme, 'auto');
    assert.equal(ensureStatusLine({ file, command }), 'ok');
    assert.equal(ensureStatusLine({ file, command: command + ' ' }), 'updated');
    await wf(file, JSON.stringify({ statusLine: { type: 'command', command: 'my-line.sh' } }));
    assert.equal(ensureStatusLine({ file, command }), 'foreign');
    assert.equal(JSON.parse(await rf(file, 'utf8')).statusLine.command, 'my-line.sh');
    await wf(file, '{ broken');
    assert.equal(ensureStatusLine({ file, command }), 'error');
    assert.equal(await rf(file, 'utf8'), '{ broken');
    assert.equal(ensureStatusLine({ file: jn(dir, 'new', 'settings.json'), command }), 'set');
  } finally { await rmr(dir, { recursive: true, force: true }); }
});
