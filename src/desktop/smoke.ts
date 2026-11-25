import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { screen, type BrowserWindow } from 'electron';
import type { MonitorState } from '../shared/contracts.js';
import { layoutBounds } from './window-layout.js';

export async function smoke({ window, show, getState, directory }: { window: BrowserWindow; show(): void; getState(): MonitorState; directory: string }) {
  const report = path.join(directory, 'result.json');
  const until = async (check: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 160; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Timed out waiting for the renderer or worker.');
  };
  const click = (label: string) => window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify('button[aria-label="' + label + '"]')}).click()`);
  const heading = (text: string) => window.webContents.executeJavaScript(`document.querySelector('h1')?.textContent === ${JSON.stringify(text)}`);
  try {
    await until(() => window.webContents.executeJavaScript("document.querySelector('h1')?.textContent === 'Subscription usage'").catch(() => false));
    assert.equal(window.isResizable(), false, 'window should not be resizable');
    // Electron does not implement maximizable on Linux; isMaximizable() always reports true there.
    if (process.platform !== 'linux') assert.equal(window.isMaximizable(), false, 'window should not be maximizable');
    await until(() => window.isVisible());
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
    await click('Full screen');
    await until(() => window.isFullScreen() && getState().view.mode === 'fullscreen');
    await click('Exit full screen');
    await until(() => !window.isFullScreen() && getState().view.mode === 'compact');
    await click('Desktop widget');
    await until(() => heading('Usage at a glance'));
    if (getState().view.cornerPinAvailable) {
      assert.equal(window.isAlwaysOnTop(), true, 'widget should stay on top');
      const { workArea } = screen.getDisplayMatching(window.getBounds());
      await until(() => {
        const actual = window.getBounds();
        const expected = layoutBounds('widget', workArea);
        return actual.x === expected.x && actual.y === expected.y;
      });
    }
    await click('Open dashboard');
    await until(() => heading('Subscription usage'));
    if (getState().view.cornerPinAvailable) assert.equal(window.isAlwaysOnTop(), false);
    await click('Settings');
    await until(() => heading('Settings'));
    await click('Explore');
    await until(() => heading('Explore'));
    await until(() => window.webContents.executeJavaScript("document.body.innerText.includes(' sessions · ')"));
    await click('Dashboard');
    await until(() => heading('Subscription usage'));
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
