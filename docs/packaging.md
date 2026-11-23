# Windows packaging

Build on Windows x64 with Node.js 24. Run `npm ci`, `npm test` and `npm run dist -- --x64`. electron-builder downloads the Electron runtime and the NSIS toolchain. The release folder receives the installer and an unpacked test build. The installer uses a per-user directory and creates a Start Menu shortcut. Uninstall retains local preferences and history. Provider CLI installations and accounts are managed separately.

To sign with a certificate, supply electron-builder's `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` through the build environment or CI secrets. Keep certificate material outside Git. Set `build.forceCodeSigning` to true in a signed release job so a missing certificate fails the build. Verify both the installer and packaged executable with PowerShell's `Get-AuthenticodeSignature` and record the status before distribution. Windows SmartScreen may warn about unsigned or low-reputation software.

For a packaged smoke test, run the unpacked executable with `--monitor-smoke` and wait for exit. The process writes `result.json` under `%TEMP%\ai-usage-monitor-smoke-<pid>`. The test uses isolated application settings, exercises dashboard launch, window hiding and reopening, settings navigation, refresh IPC, and invalid input handling. Separately verify the installed Start Menu entry, tray double-click, and uninstaller on a disposable Windows account.

No update feed is configured. Publish a reviewed release to an authorized distribution channel before adding automatic application updates.

This workspace's release build used a local Electron 44.4.3 cache after download errors. The smoke-tested unpacked artifact is under release/final/win-unpacked. See release/release-notes.md for results and open checks.

Use the [versioning workflow](versioning.md) to bump a release. A successful `npm run dist -- --x64` generates the installer, release notes, and SHA-256 checksum together.
