import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { build, Platform, Arch } from 'electron-builder';
import { readRelease } from './release-version.ts';

const root = new URL('../', import.meta.url);
const manifest = readRelease(root);
const { name, version } = manifest;
const { values } = parseArgs({ options: {
  platform: { type: 'string' },
  x64: { type: 'boolean' },
  'out-dir': { type: 'string' },
  'electron-dist': { type: 'string' }
} });

const target = values.platform;
if (target !== 'windows' && target !== 'linux') throw Error('Pass --platform windows or --platform linux (see npm run dist:windows and dist:linux).');
if (target === 'windows' && process.platform !== 'win32') throw Error('Run the Windows release build on Windows.');
if (target === 'linux' && process.platform !== 'linux') throw Error('Run the Linux release build on Linux (the .deb packager does not run on Windows; WSL works).');

const output = resolve(values['out-dir'] ?? (target === 'linux' ? join(manifest.build.directories.output, 'linux') : manifest.build.directories.output));
const artifacts = await build({
  targets: target === 'windows'
    ? Platform.WINDOWS.createTarget('nsis', Arch.x64)
    : Platform.LINUX.createTarget(['deb', 'AppImage'], Arch.x64),
  config: {
    ...manifest.build,
    electronVersion: manifest.devDependencies.electron,
    directories: { ...manifest.build.directories, output },
    ...(values['electron-dist'] ? { electronDist: resolve(values['electron-dist']) } : {})
  }
});

let packages: string[];
let description: string;
let summary: string;
if (target === 'windows') {
  packages = artifacts.filter(file => file.toLowerCase().endsWith('.exe'));
  if (packages.length !== 1) throw Error('Expected one Windows installer from the current build.');
  const [installer] = packages;
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const metadata = JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference = "Stop"; $item = Get-Item -LiteralPath $env:AIMUM_INSTALLER; ' +
    '$v = $item.VersionInfo; $sign = Get-AuthenticodeSignature -LiteralPath $item.FullName; ' +
    '@{Version = "$($v.ProductMajorPart).$($v.ProductMinorPart).$($v.ProductBuildPart)"; Signature = $sign.Status.ToString()} | ConvertTo-Json -Compress'
  ], {
    env: { ...process.env, AIMUM_INSTALLER: installer },
    encoding: 'utf8', windowsHide: true
  })) as { Version: string; Signature: string };
  if (metadata.Version !== version) throw Error('Installer version metadata does not match package.json.');
  description = 'Windows x64 NSIS installer. Authenticode status: **' + metadata.Signature + '**.';
  summary = installer + ' (' + metadata.Signature + ')';
} else {
  const deb = artifacts.filter(file => file.endsWith('.deb'));
  const image = artifacts.filter(file => file.endsWith('.AppImage'));
  if (deb.length !== 1 || image.length !== 1) throw Error('Expected one .deb and one AppImage from the current build.');
  packages = [...deb, ...image];
  if (packages.some(file => !basename(file).includes(version))) throw Error('A Linux package filename does not match the package.json version.');
  let control = 'not checked (dpkg-deb is not installed)';
  try {
    const debVersion = execFileSync('dpkg-deb', ['-f', deb[0], 'Version'], { encoding: 'utf8' }).trim();
    if (debVersion !== version) throw Error('The .deb control version does not match package.json.');
    control = 'control version ' + debVersion;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  description = 'Linux x64 packages: `.deb` for Debian and Ubuntu (`sudo apt install ./<file>.deb`) and a portable `.AppImage` (`chmod +x` then run). The packages are unsigned; .deb ' + control + '.';
  summary = packages.join(', ');
}

const directory = dirname(packages[0]);
let notes;
try { notes = (await readFile(new URL('docs/release-notes/' + version + '.md', root), 'utf8')).trim(); }
catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  notes = 'See the project README for features and setup.';
}
const title = manifest.build.productName || name;
await writeFile(join(directory, 'release-notes.md'), '# ' + title + ' ' + version + '\n\n' + description + '\n\n' + notes + '\n');
let checksums = '';
for (const file of packages) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  checksums += hash.digest('hex') + '  ' + basename(file) + '\n';
}
await writeFile(join(directory, 'checksums.sha256'), checksums);
console.log('Release ' + version + ': ' + summary);
