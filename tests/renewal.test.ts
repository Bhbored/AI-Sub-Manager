import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRenewal } from '../src/shared/renewal.js';
test('clamps month end without drifting', () => {
  assert.equal(nextRenewal('2025-01-31', 'monthly', '2025-02-04'), '2025-02-28');
  assert.equal(nextRenewal('2025-01-31', 'monthly', '2025-03-01'), '2025-03-31');
  assert.equal(nextRenewal('2024-02-29', 'yearly', '2026-01-01'), '2026-02-28');
});
