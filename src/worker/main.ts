import { join } from 'node:path';
import { Scheduler } from './scheduler.js';
import { createTool } from '../providers/windows-cli.js';
import { createCodex } from '../providers/codex/adapter.js';
import { createClaude } from '../providers/claude/adapter.js';
import { defaults } from '../shared/preferences.js';
import { providerIds, type ProviderId, type ProviderStatus, type WorkerEvent, type WorkerRequest } from '../shared/contracts.js';

const [root, version] = process.argv.slice(2);
const port = process.parentPort;
if (!port || !root || !version) throw Error('Missing worker configuration.');
const tools = { codex: createTool(root, 'codex'), claude: createTool(root, 'claude') };
const adapters = { codex: createCodex(tools.codex, version), claude: createClaude(tools.claude, join(root, 'claude-usage.json')) };
const cooldown = new Map<ProviderId, { failures: number; until: number }>();
let settings = defaults();

function send(id: ProviderId, value: ProviderStatus) {
  port.postMessage({ type: 'status', id, value } satisfies WorkerEvent);
}

function provider(id: ProviderId) {
  return {
    async refresh(): Promise<ProviderStatus | null> {
      let info;
      try { info = await tools[id].installed(); }
      catch { return { state: 'error', message: 'Could not run the CLI on Windows PATH. Check that its version command works in a terminal.' }; }
      if (!info) return { state: 'missing', message: 'Install the official CLI and make sure it is on your Windows PATH.' };
      if (settings.disabled[id]) return { state: 'disabled', version: info.version, message: 'Monitoring is disabled in Settings.' };
      const retry = cooldown.get(id);
      if (retry && retry.until > Date.now()) return null;
      send(id, { state: 'refreshing', version: info.version });
      try {
        const result = await adapters[id].refresh(info);
        cooldown.delete(id);
        return { ...result, version: info.version };
      } catch {
        const failures = (retry?.failures ?? 0) + 1;
        cooldown.set(id, { failures, until: Date.now() + Math.min(600000, 15000 * 2 ** (failures - 1)) });
        return { state: 'error', version: info.version, message: 'The CLI could not read account status or usage. Check your connection and try again shortly.' };
      }
    }
  };
}

const scheduler = new Scheduler({ codex: provider('codex'), claude: provider('claude') }, (id, value) => {
  if (value) send(id, value);
});
port.on('message', ({ data }: { data: WorkerRequest }) => {
  if (data.type === 'refresh') void scheduler.refresh(data.id);
  if (data.type === 'settings') {
    settings = data.settings;
    scheduler.configure(settings.paused ? 0 : settings.interval);
    if (data.initial) void scheduler.refresh();
  }
  if (data.type === 'resume' && !settings.paused && settings.interval) void scheduler.refresh();
});
