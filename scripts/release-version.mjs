import { readFileSync } from 'node:fs';

export function readRelease(root) {
  const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
  const manifest = read('package.json');
  const lock = read('package-lock.json');
  const { version } = manifest;
  const parts = version?.split('.');
  if (!/^\d+\.\d+\.\d+$/.test(version) ||
      parts.some(part => part !== String(Number(part)) || Number(part) > 65535)) {
    throw Error('Use a stable major.minor.patch version. Windows version components must be 0–65535.');
  }
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw Error('package.json and package-lock.json disagree. Restore the lockfile or run npm install --package-lock-only.');
  }
  return manifest;
}
