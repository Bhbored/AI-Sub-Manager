import { CodexClient, type AppServerProcess } from './client.js';
import { parseRateLimits } from './rate-limits.js';
import { asRecord } from '../../shared/validation.js';
import type { CliInfo, ProviderAdapter } from '../cli.js';

export function createCodex(tool: { start(info: CliInfo, args: string[]): AppServerProcess }, version: string): ProviderAdapter {
  return {
    async refresh(info) {
      const client = new CodexClient(() => tool.start(info, ['app-server', '--listen', 'stdio://']), version);
      try {
        await client.start();
        const account = asRecord(asRecord(await client.request('account/read', { refreshToken: false })).account);
        if (account.type !== 'chatgpt') return { state: 'auth', message: 'Run codex login in your terminal to connect a ChatGPT account, then refresh.' };
        const windows = parseRateLimits(await client.request('account/rateLimits/read'));
        const plan = typeof account.planType === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(account.planType) ? account.planType : null;
        return windows.length
          ? { state: 'ready', connected: true, windows, plan, collectedAt: new Date().toISOString() }
          : { state: 'unavailable', connected: true, message: 'Codex returned no readable quota windows for this account.' };
      } finally { client.stop(); }
    }
  };
}
