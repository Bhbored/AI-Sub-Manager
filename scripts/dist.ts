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
  x64: { type: 'boolean' },
  'out-dir': { type: 'string' },
  'electron-dist': { type: 'string' }
} });

if (process.platform !== 'win32') throw Error('Run the Windows release build on Windows.');
const output = resolve(values['out-dir'] ?? manifest.build.directories.output);
const artifacts = await build({
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  config: {
    ...manifest.build,
    electronVersion: manifest.devDependencies.electron,
    directories: { ...manifest.build.directories, output },
    ...(values['electron-dist'] ? { electronDist: resolve(values['electron-dist']) } : {})
  }
});
const installers = artifacts.filter(file => file.toLowerCase().endsWith('.exe'));
if (installers.length !== 1) throw Error('Expected one Windows installer from the current build.');
const [installer] = installers;

const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const metadata = JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference = "Stop"; $item = Get-Item -LiteralPath $env:AIMUM_INSTALLER; ' +
  '$v = $item.VersionInfo; $sign = Get-AuthenticodeSignature -LiteralPath $item.FullName; ' +
  '@{Version = "$($v.ProductMajorPart).$($v.ProductMinorPart).$($v.ProductBuildPart)"; Signature = $sign.Status.ToString()} | ConvertTo-Json -Compress'
], {
  env: { ...process.env, AIMUM_INSTALLER: installer },
  encoding: 'utf8', windowsHide: true
}));
if (metadata.Version !== version) throw Error('Installer version metadata does not match package.json.');

const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const checksum = hash.digest('hex');
const directory = dirname(installer);
let notes;
try { notes = (await readFile(new URL('docs/release-notes/' + version + '.md', root), 'utf8')).trim(); }
catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  notes = 'See the project README for features and setup.';
}
const title = manifest.build.productName || name;
await writeFile(join(directory, 'release-notes.md'),
  '# ' + title + ' ' + version + '\n\n' +
  'Windows x64 NSIS installer. Authenticode status: **' + metadata.Signature + '**.\n\n' + notes + '\n');
await writeFile(join(directory, 'checksums.sha256'), checksum + '  ' + basename(installer) + '\n');
console.log('Release ' + version + ': ' + installer + ' (' + metadata.Signature + ')');
