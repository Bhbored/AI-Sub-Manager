import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readRelease } from './release-version.mjs';

const root = new URL('../', import.meta.url);
const manifest = readRelease(root);
const [increment, ...rest] = process.argv.slice(2);
const kinds = ['major', 'minor', 'patch'];
const index = kinds.indexOf(increment);
if (index < 0 || rest.length) {
  console.error('Usage: npm run version:bump -- patch|minor|major');
  process.exit(1);
}

const parts = manifest.version.split('.').map(Number);
parts[index]++;
if (parts[index] > 65535) throw Error('The next version exceeds the Windows version component limit.');
parts.fill(0, index + 1);

const result = spawnSync(process.execPath, [
  process.env.npm_execpath, 'version', parts.join('.'), '--no-git-tag-version', '--ignore-scripts'
], { cwd: fileURLToPath(root), stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
readRelease(root);
