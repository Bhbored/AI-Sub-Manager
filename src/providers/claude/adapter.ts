import { readFile } from 'node:fs/promises';
import { asRecord, isFiniteNumber, isoDate } from '../../shared/validation.js';
import type { QuotaWindow } from '../../shared/contracts.js';
import type { CliTool, ProviderAdapter } from '../windows-cli.js';

const durations = { five_hour: 300, seven_day: 10080 };

export function parseUsage(input: unknown, now = Date.now()) {
  const record = asRecord(input);
  const collectedAt = typeof record.capturedAt === 'string' ? isoDate(Date.parse(record.capturedAt)) : null;
  if (!collectedAt) return null;
  const limits = asRecord(record.rate_limits);
  const windows: QuotaWindow[] = [];
  for (const [key, durationMinutes] of Object.entries(durations)) {
    const { used_percentage: used, resets_at: reset } = asRecord(limits[key]);
    if (!isFiniteNumber(used) || used < 0 || used > 100) continue;
    const resetMs = isFiniteNumber(reset) ? reset * 1000 : null;
    if (resetMs !== null && resetMs <= now) continue;
    windows.push({ bucket: 'Claude', durationMinutes, usedPercentage: used, resetAt: resetMs === null ? null : isoDate(resetMs) });
  }
  return { windows, collectedAt };
}

export function createClaude(
  tool: Pick<CliTool, 'invoke'>,
  usageFile: string,
  read: (file: string) => Promise<string> = file => readFile(file, 'utf8'),
  clock = Date.now
): ProviderAdapter {
  return {
    async refresh(info) {
      let stdout: string;
      try { ({ stdout } = await tool.invoke(info, ['auth', 'status'])); }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 1 ||
          !('stdout' in error) || typeof error.stdout !== 'string') throw error;
        stdout = error.stdout;
      }
      let status;
      try { status = asRecord(JSON.parse(stdout)); }
      catch { return { state: 'unavailable', message: 'Claude Code returned an unreadable account status. Update the CLI and refresh.' }; }
      if (status.loggedIn !== true || status.authMethod !== 'claude.ai') {
        return { state: 'auth', message: 'Run claude auth login in your terminal to connect a Claude subscription, then refresh.' };
      }
      let usage: ReturnType<typeof parseUsage> = null;
      try { usage = parseUsage(JSON.parse(await read(usageFile)), clock()); } catch {}
      if (!usage) {
        return { state: 'unsupported', connected: true, message: 'Claude Code reports subscription limits to its status line. See the provider setup guide, then use Claude Code once.' };
      }
      return usage.windows.length
        ? { state: 'ready', connected: true, ...usage }
        : { state: 'unavailable', connected: true, message: 'The last Claude Code session reported no active limit windows. Use Claude Code to refresh them.' };
    }
  };
}
