// Claude Code statusLine command: node statusline.cjs <output-file>
// Claude Code pipes session JSON on stdin; keep only rate_limits and write it atomically.
const fs = require('node:fs');
const path = require('node:path');

function collect(input, now = new Date()) {
  let data;
  try { data = JSON.parse(input); } catch { return null; }
  const limits = data?.rate_limits;
  if (!limits || typeof limits !== 'object') return null;
  const pick = value => value && typeof value === 'object'
    ? { used_percentage: value.used_percentage, resets_at: value.resets_at } : undefined;
  return { capturedAt: now.toISOString(), rate_limits: { five_hour: pick(limits.five_hour), seven_day: pick(limits.seven_day) } };
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
module.exports = { collect };
