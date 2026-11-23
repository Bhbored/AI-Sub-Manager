import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCodex } from '../src/main/providers/codex/adapter.cjs';
import { createClaude } from '../src/main/providers/claude/adapter.cjs';

function codexFixture(account) {
  const requests = [];
  let stopped = false;
  const app = createCodex({
    start(_info, args) {
      assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(), stdout: new PassThrough(),
        kill() { stopped = true; child.stdin.end(); child.stdout.end(); }
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
  const result = await app.refresh({});
  assert.deepEqual(requests, ['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
  assert.equal(result.windows[0].usedPercentage, 42);
  assert.equal(Object.hasOwn(result, 'email'), false);
  assert.equal(wasStopped(), true);
});

test('Codex does not request subscription limits for an API-key account', async () => {
  const { app, requests } = codexFixture({ type: 'apiKey' });
  assert.equal((await app.refresh({})).state, 'auth');
  assert.deepEqual(requests, ['initialize', 'initialized', 'account/read']);
});

test('Claude reports a connected subscription without inventing usage', async () => {
  const adapter = createClaude({ invoke: async (_info, args) => {
    assert.deepEqual(args, ['auth', 'status']);
    return { stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) };
  } });
  const status = await adapter.refresh({});
  assert.equal(status.connected, true);
  assert.equal(status.state, 'unsupported');
  assert.equal(Object.hasOwn(status, 'windows'), false);
});

