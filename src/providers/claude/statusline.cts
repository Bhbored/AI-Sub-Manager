import fs from 'node:fs';
import path from 'node:path';

interface WindowInput {
  used_percentage?: number;
  resets_at?: number;
}

export function collect(input: string, now = new Date()) {
  let data;
  try { data = JSON.parse(input); } catch { return null; }
  const limits: unknown = data?.rate_limits;
  if (!limits || typeof limits !== 'object') return null;
  function pick(value: unknown): WindowInput | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const { used_percentage, resets_at } = value as Record<string, unknown>;
    return {
      used_percentage: typeof used_percentage === 'number' ? used_percentage : undefined,
      resets_at: typeof resets_at === 'number' ? resets_at : undefined
    };
  }
  const { five_hour, seven_day } = limits as Record<string, unknown>;
  return { capturedAt: now.toISOString(), rate_limits: { five_hour: pick(five_hour), seven_day: pick(seven_day) } };
}

function main() {
  const target = process.argv[2];
  if (!target || !path.isAbsolute(target)) return;
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    const record = collect(input);
    if (!record) return;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = target + '.' + process.pid + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(record));
      fs.renameSync(temporary, target);
    } catch {}
  });
}

if (require.main === module) main();
