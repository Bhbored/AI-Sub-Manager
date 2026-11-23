const { Scheduler } = require('../worker/scheduler.mjs');
const { createTool } = require('./tools.cjs');
const { createCodex } = require('./providers/codex/adapter.cjs');
const { createClaude } = require('./providers/claude/adapter.cjs');
const root = process.argv[2];
const port = process.parentPort;
const tools = { codex: createTool(root, 'codex'), claude: createTool(root, 'claude') };
const adapters = { codex: createCodex(tools.codex, process.argv[3]), claude: createClaude(tools.claude, require('node:path').join(root, 'claude-usage.json')) };
const cooldown = new Map();
let settings = { interval: 10, paused: false };
const send = (id, value) => port.postMessage({ type: 'status', id, value });
const providers = Object.fromEntries(Object.entries(adapters).map(([id, adapter]) => [id, {
  async refresh() {
    let info;
    try { info = await tools[id].installed(); }
    catch { return { state: 'error', message: 'Could not run the CLI on Windows PATH. Check that its version command works in a terminal.' }; }
    if (!info) return { state: 'missing', message: 'Install the official CLI and make sure it is on your Windows PATH.' };
    if (settings.disabled?.[id]) return { state: 'disabled', version: info.version, message: 'Monitoring is disabled in Settings.' };
    const retry = cooldown.get(id);
    if (retry && retry.until > Date.now()) return null;
    send(id, { state: 'refreshing', version: info.version });
    try {
      const result = await adapter.refresh(info);
      cooldown.delete(id);
      return { ...result, version: info.version };
    } catch {
      const failures = (retry?.failures ?? 0) + 1;
      cooldown.set(id, { failures, until: Date.now() + Math.min(600000, 15000 * 2 ** (failures - 1)) });
      return { state: 'error', version: info.version, message: 'The CLI could not read account status or usage. Check your connection and try again shortly.' };
    }
  }
}]));
const scheduler = new Scheduler(providers, (id, value) => { if (value) send(id, value); }, { setInterval: (_callback, ms) => setInterval(() => refresh(), ms), clearInterval });
function refresh(id) {
  for (const key of id ? [id] : Object.keys(adapters)) void scheduler.refreshProvider(key);
}

port.on('message', ({ data }) => {
  if (data.type === 'refresh') refresh(data.id);
  if (data.type === 'settings') {
    settings = data.settings;
    scheduler.configure(settings.paused ? 0 : settings.interval);
    if (data.initial) refresh();
  }
  if (data.type === 'resume' && !settings.paused && settings.interval) refresh();
});




