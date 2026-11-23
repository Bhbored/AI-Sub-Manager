import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseRateLimits } from '../src/providers/codex/rate-limits.js';

test('preserves actual window duration and converts Unix reset time', () => {
  assert.deepEqual(parseRateLimits({rateLimits: {limitId: 'codex', primary: {usedPercent: 25, windowDurationMins: 300, resetsAt: 1730947200}}}), [{bucket:'codex', durationMinutes:300, usedPercentage:25, resetAt:'2024-11-07T02:40:00.000Z'}]);
});
test('rejects malformed windows and never invents usage', () => {
  assert.deepEqual(parseRateLimits({rateLimits:{primary:{usedPercent:101,windowDurationMins:300}, secondary:{windowDurationMins:10080}}}), []);
  assert.deepEqual(parseRateLimits(null), []);
});
