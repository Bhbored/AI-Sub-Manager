import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, type SchedulerTimers } from '../src/worker/scheduler.js';
import type { ProviderStatus } from '../src/shared/contracts.js';

test('coalesces simultaneous requests and keeps providers independent', async () => {
  let calls = 0;
  let resolve!: (value: ProviderStatus) => void;
  const promise = new Promise<ProviderStatus>(done => { resolve = done; });
  const reports: [string, ProviderStatus | null][] = [];
  const firstResult = { state: 'auth' } as const;
  const secondResult = { state: 'missing' } as const;
  const scheduler = new Scheduler({
    a: { refresh: () => { calls++; return promise; } },
    b: { refresh: async () => secondResult }
  }, (id, status) => reports.push([id, status]));
  const first = scheduler.refreshProvider('a');
  assert.equal(first, scheduler.refreshProvider('a'));
  assert.deepEqual(await scheduler.refreshProvider('b'), secondResult);
  resolve(firstResult);
  assert.deepEqual(await first, firstResult);
  assert.equal(calls, 1);
  assert.deepEqual(reports, [['b', secondResult], ['a', firstResult]]);
});

test('reconfigures and stops its timer', () => {
  const calls: number[] = [];
  const handle = setInterval(() => {}, 10000).unref();
  clearInterval(handle);
  const timers: SchedulerTimers = {
    setInterval: (_callback, ms) => { calls.push(ms); return handle; },
    clearInterval: () => { calls.push(0); }
  };
  const scheduler = new Scheduler({}, () => {}, timers);
  scheduler.configure(10);
  scheduler.configure(0);
  scheduler.configure(1);
  scheduler.stop();
  assert.deepEqual(calls, [600000, 0, 60000, 0]);
  assert.throws(() => scheduler.configure(3));
});

test('one failing provider does not reject the cycle', async () => {
  const scheduler = new Scheduler({
    bad: { refresh: () => { throw Error('bad'); } },
    good: { refresh: () => ({ state: 'auth' }) }
  }, () => {});
  const results = await scheduler.refresh();
  assert.equal(results[0]?.state, 'error');
  assert.equal(results[1]?.state, 'auth');
});
