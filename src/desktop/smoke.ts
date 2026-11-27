import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { screen, type BrowserWindow } from 'electron';
import type { MonitorState } from '../shared/contracts.js';
import { layoutBounds } from './window-layout.js';

export async function smoke({ window, show, getState, directory }: { window: BrowserWindow; show(): void; getState(): MonitorState; directory: string }) {
  const report = path.join(directory, 'result.json');
  const until = async (check: () => boolean | Promise<boolean>, stage = 'renderer or worker', attempts = 160) => {
    for (let i = 0; i < attempts; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Timed out waiting for ' + stage + '.');
  };
  const click = (label: string) => window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify('button[aria-label="' + label + '"]')}).click()`);
  const heading = (text: string) => window.webContents.executeJavaScript(`document.querySelector('h1')?.textContent === ${JSON.stringify(text)}`);
  try {
    await until(() => heading('Subscription usage').catch(() => false), 'dashboard startup');
    assert.equal(window.isResizable(), false, 'window should not be resizable');
    // Electron does not implement maximizable on Linux; isMaximizable() always reports true there.
    if (process.platform !== 'linux') assert.equal(window.isMaximizable(), false, 'window should not be maximizable');
    await until(() => window.isVisible(), 'the startup window to become visible');
    window.close();
    assert.equal(window.isVisible(), false, 'closing should hide the window to the tray');
    assert.equal(getState().worker, true, 'worker should be running');
    show();
    assert.equal(window.isVisible(), true, 'show() should reveal the window');
    assert.equal(await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[aria-label="Window controls"] button')).every(button => {
      const outer = button.getBoundingClientRect();
      const icon = button.querySelector('svg').getBoundingClientRect();
      return Math.abs(outer.x + outer.width / 2 - icon.x - icon.width / 2) < 1
        && Math.abs(outer.y + outer.height / 2 - icon.y - icon.height / 2) < 1;
    })`), true, 'window controls should center their icons');
    const compact = window.getBounds();
    const activeDisplay = getState().view.cornerPinAvailable ? screen.getDisplayMatching(compact) : screen.getPrimaryDisplay();
    await click('Maximize window');
    await until(() => window.isMaximized() && getState().view.mode === 'expanded', 'window to maximize');
    assert.equal(window.isFullScreen(), false, 'maximizing should leave the taskbar visible');
    if (getState().view.cornerPinAvailable) {
      let actual = window.getContentBounds();
      const expected = activeDisplay.workArea;
      await until(async () => {
        actual = window.getContentBounds();
        const [width, height] = await window.webContents.executeJavaScript('[innerWidth, innerHeight]') as [number, number];
        if (process.platform === 'linux') {
          // Some Linux window managers reserve panel space without reporting it in Electron's work area.
          return actual.x >= expected.x - 2 && actual.y >= expected.y - 2 &&
            actual.x + width <= expected.x + expected.width + 2 &&
            actual.y + height <= expected.y + expected.height + 2 &&
            width >= expected.width * 0.85 && height >= expected.height * 0.85;
        }
        return Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2 &&
          Math.abs(width - expected.width) <= 2 && Math.abs(height - expected.height) <= 2;
      }, 'the maximized viewport to fit inside the work area', 24).catch(() => {
        throw Error(`Maximized content is ${JSON.stringify(actual)}; expected work area ${JSON.stringify(expected)}.`);
      });
    }
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await until(() => !window.isMaximized() && getState().view.mode === 'compact', 'Escape to restore the compact window');
    if (getState().view.cornerPinAvailable) {
      await until(() => {
        const restored = window.getBounds();
        return restored.x === compact.x && restored.y === compact.y &&
          restored.width === compact.width && restored.height === compact.height;
      }, 'original compact bounds', 24).catch(() => {
        throw Error(`Restored compact bounds are ${JSON.stringify(window.getBounds())}; expected ${JSON.stringify(compact)}.`);
      });
    }
    await click('Maximize window');
    await until(() => window.isMaximized(), 'the window to maximize again', 40);
    await click('Desktop widget');
    await until(async () => !window.isMaximized() && await heading('Usage at a glance'), 'switching directly from the maximized window to the widget');
    if (getState().view.cornerPinAvailable) {
      assert.equal(window.isAlwaysOnTop(), true, 'widget should stay on top');
      const expected = layoutBounds('widget', screen.getPrimaryDisplay().workArea);
      const atCorner = () => {
        const actual = window.getContentBounds();
        return actual.x === expected.x && actual.y === expected.y &&
          actual.width === expected.width && actual.height === expected.height;
      };
      await until(atCorner, 'initial widget position', 24).catch(() => {
        throw Error(`Widget geometry: ${JSON.stringify(window.getBounds())}; content: ${JSON.stringify(window.getContentBounds())}; expected: ${JSON.stringify(expected)}.`);
      });
      assert.equal(await window.webContents.executeJavaScript("document.querySelector('body > #root > header').classList.contains('window-drag')"), false);
      if (process.platform === 'win32') assert.equal(window.isMovable(), false);
      window.setPosition(expected.x - 80, expected.y + 60);
      await until(atCorner, 'widget to return to its fixed corner after a move', 24);
    }
    await click('Open dashboard');
    await until(() => heading('Subscription usage'), 'returning from the widget to the dashboard');
    if (getState().view.cornerPinAvailable) assert.equal(window.isAlwaysOnTop(), false);
    await click('Settings');
    await until(() => heading('Settings'), 'settings navigation');
    await click('Explore');
    await until(() => heading('Explore'), 'Explore navigation');
    await until(() => window.webContents.executeJavaScript("document.body.innerText.includes(' sessions · ')"), 'inventory results');
    await click('Dashboard');
    await until(() => heading('Subscription usage'), 'dashboard navigation');
    await assert.rejects(window.webContents.executeJavaScript("window.monitor.setWindowMode('nope')"));
    await assert.rejects(window.webContents.executeJavaScript("window.monitor.inventory('nope')"));
    await assert.rejects(window.webContents.executeJavaScript("window.monitor.open('relative.json')"));
    await until(() => Object.values(getState().status).every(item => !['starting', 'refreshing'].includes(item.state)));
    await window.webContents.executeJavaScript("window.monitor.refresh()");
    await assert.rejects(window.webContents.executeJavaScript("window.monitor.settings({interval: 3})"));
    fs.writeFileSync(report, JSON.stringify({ ok: true, providers: Object.values(getState().status).map(item => item.state) }));
  } catch (error) {
    fs.writeFileSync(report, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}
