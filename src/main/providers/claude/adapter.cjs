const { readFile } = require('node:fs/promises');
const durations = { five_hour: 300, seven_day: 10080 };

/** Convert the statusLine rate_limits capture into the normalized window list; expired windows are dropped. */
function parseUsage(record, now = Date.now()) {
  const captured = Date.parse(record?.capturedAt);
  if (!Number.isFinite(captured)) return null;
  const windows = [];
  for (const [key, durationMinutes] of Object.entries(durations)) {
    const value = record.rate_limits?.[key];
    if (!value || !Number.isFinite(value.used_percentage) || value.used_percentage < 0 || value.used_percentage > 100) continue;
    const resetMs = Number.isFinite(value.resets_at) ? value.resets_at * 1000 : null;
    if (resetMs !== null && resetMs <= now) continue;
    windows.push({
      bucket: 'Claude', durationMinutes, usedPercentage: value.used_percentage,
      resetAt: resetMs === null ? null : new Date(resetMs).toISOString()
    });
  }
  return { windows, collectedAt: new Date(captured).toISOString() };
}

function createClaude(tool, usageFile, read = file => readFile(file, 'utf8'), clock = Date.now) {
  return {
    async refresh(info) {
      let stdout;
      try { ({ stdout } = await tool.invoke(info, ['auth', 'status'])); }
      catch (error) {
        if (error.code !== 1 || typeof error.stdout !== 'string') throw error;
        stdout = error.stdout;
      }
      let status;
      try { status = JSON.parse(stdout); }
      catch { return { state: 'unavailable', message: 'Claude Code returned an unreadable account status. Update the CLI and refresh.' }; }
      if (!status || status.loggedIn !== true || status.authMethod !== 'claude.ai') {
        return { state: 'auth', message: 'Run claude auth login in your terminal to connect a Claude subscription, then refresh.' };
      }
      let usage = null;
      try { usage = parseUsage(JSON.parse(await read(usageFile)), clock()); } catch {}
      if (!usage) {
        return { state: 'unsupported', connected: true, message: 'Claude Code only reports subscription limits to its status line. Set it up as described in docs/provider-integrations.md, then use Claude Code once.' };
      }
      return usage.windows.length
        ? { state: 'ready', connected: true, windows: usage.windows, collectedAt: usage.collectedAt }
        : { state: 'unavailable', connected: true, message: 'The last Claude Code session reported no active limit windows. Use Claude Code to refresh them.' };
    }
  };
}
module.exports = { createClaude, parseUsage };
