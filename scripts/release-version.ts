import { readFileSync } from 'node:fs';
import type { Configuration } from 'electron-builder';

interface ReleaseManifest {
  name: string;
  version: string;
  devDependencies: { electron: string };
  build: Configuration & { directories: { output: string } };
}

interface Lockfile {
  version?: string;
  packages?: Record<string, { version?: string }>;
}

export function readRelease(root: URL): ReleaseManifest {
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
  const manifest = read('package.json') as ReleaseManifest;
  const lock = read('package-lock.json') as Lockfile;
  const { version } = manifest;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) ||
      version.split('.').some(part => part !== String(Number(part)) || Number(part) > 65535)) {
    throw Error('Use a stable major.minor.patch version. Windows version components must be 0–65535.');
  }
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw Error('package.json and package-lock.json disagree. Restore the lockfile or run npm install --package-lock-only.');
  }
  return manifest;
}
