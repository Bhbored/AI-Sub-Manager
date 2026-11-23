const { CodexClient } = require('./client.cjs');
const { parseRateLimits } = require('./parse-rate-limits.mjs');
function createCodex(tool, version) {
  return {
    async refresh(info) {
      const client = new CodexClient(() => tool.start(info, ['app-server', '--listen', 'stdio://']), version);
      try {
        await client.start();
        const { account } = await client.request('account/read', { refreshToken: false });
        if (account?.type !== 'chatgpt') return { state: 'auth', message: 'Run codex login in your terminal to connect a ChatGPT account, then refresh.' };
        const windows = parseRateLimits(await client.request('account/rateLimits/read'));
        const plan = typeof account.planType === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(account.planType) ? account.planType : null;
        return windows.length
          ? { state: 'ready', connected: true, windows, plan, collectedAt: new Date().toISOString() }
          : { state: 'unavailable', connected: true, message: 'Codex returned no readable quota windows for this account.' };
      } finally { client.stop(); }
    }
  };
}
module.exports = { createCodex };

