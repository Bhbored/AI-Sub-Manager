const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function smoke({ window, show, getState, directory }) {
  const report = path.join(directory, 'result.json');
  const until = async check => {
    for (let i = 0; i < 160; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Timed out waiting for the renderer or worker.');
  };
  try {
    await until(() => window.webContents.executeJavaScript("document.querySelector('h1')?.textContent === 'Subscription usage'").catch(() => false));
    assert.equal(window.isResizable(), false);
    assert.equal(window.isMaximizable(), false);
    await until(() => window.isVisible());
    window.close();
    assert.equal(window.isVisible(), false);
    assert.equal(getState().worker, true);
    show();
    assert.equal(window.isVisible(), true);
    await window.webContents.executeJavaScript("document.querySelector('[aria-label=Settings]').click()");
    await until(() => window.webContents.executeJavaScript("document.querySelector('h1')?.textContent === 'Settings'"));
    await window.webContents.executeJavaScript("document.querySelector('[aria-label=\"Back to dashboard\"]').click()");
    await until(() => Object.values(getState().status).every(item => !['starting', 'refreshing'].includes(item.state)));
    await window.webContents.executeJavaScript("window.monitor.refresh()");
    await assert.rejects(window.webContents.executeJavaScript("window.monitor.settings({interval: 3})"));
    fs.writeFileSync(report, JSON.stringify({ ok: true, providers: Object.values(getState().status).map(item => item.state) }));
  } catch (error) {
    fs.writeFileSync(report, JSON.stringify({ ok: false, error: error.message }));
    throw error;
  }
}
module.exports = { smoke };
