import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBounds, supportsCornerPin, useXWaylandForPinning } from '../src/desktop/window-layout.js';

test('the widget uses the top-right of the selected work area, including negative monitor coordinates', () => {
  assert.deepEqual(layoutBounds('widget', { x: -1920, y: 24, width: 1920, height: 1016 }),
    { x: -356, y: 40, width: 340, height: 332 });
});

test('compact mode restores and clamps its position when a monitor disappears', () => {
  const area = { x: 0, y: 30, width: 380, height: 500 };
  const previous = { x: 1400, y: -50, width: 422, height: 704 };
  assert.deepEqual(layoutBounds('compact', area, previous), { x: 32, y: 30, width: 348, height: 468 });
  assert.deepEqual(layoutBounds('compact', area, { ...previous, x: 0, y: 30 }),
    { x: 0, y: 30, width: 348, height: 468 });
});

test('native Wayland leaves placement to the compositor and X11 permits anchoring', () => {
  assert.equal(supportsCornerPin('win32', undefined, ''), true);
  assert.equal(supportsCornerPin('linux', 'wayland', ''), false);
  assert.equal(supportsCornerPin('linux', 'x11', 'wayland'), false);
  assert.equal(supportsCornerPin('linux', 'wayland', 'x11'), true);
});

test('XWayland is selected for pinning only when available and no platform was requested', () => {
  assert.equal(useXWaylandForPinning('linux', 'wayland', ':0', ''), true);
  assert.equal(useXWaylandForPinning('linux', 'wayland', undefined, ''), false);
  assert.equal(useXWaylandForPinning('linux', 'wayland', ':0', 'wayland'), false);
  assert.equal(useXWaylandForPinning('win32', undefined, ':0', ''), false);
});
