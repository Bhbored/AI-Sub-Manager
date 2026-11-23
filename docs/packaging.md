# Packaging

Use `npm run dist:windows` on Windows and `npm run dist:linux` on Linux. The two commands share `scripts/dist.ts` and differ only by `--platform`.

## Windows

Build on Windows x64 with Node.js 24. Run `npm ci`, `npm test` and `npm run dist:windows -- --x64`. electron-builder downloads the Electron runtime and the NSIS toolchain. The release folder receives the installer and an unpacked test build. The installer uses a per-user directory and creates a Start Menu shortcut. Uninstall retains local preferences and history. Provider CLI installations and accounts are managed separately.

To sign with a certificate, supply electron-builder's `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` through the build environment or CI secrets. Keep certificate material outside Git. Set `build.forceCodeSigning` to true in a signed release job so a missing certificate fails the build. Verify both the installer and packaged executable with PowerShell's `Get-AuthenticodeSignature` and record the status before distribution. Windows SmartScreen may warn about unsigned or low-reputation software.

For a packaged smoke test, run the unpacked executable with `--monitor-smoke` and wait for exit. The process writes `result.json` under `%TEMP%\ai-usage-monitor-smoke-<pid>`. The test uses isolated application settings, exercises dashboard launch, window hiding and reopening, settings navigation, refresh IPC, and invalid input handling. Separately verify the installed Start Menu entry, tray double-click, and uninstaller on a disposable Windows account.

No update feed is configured. Publish a reviewed release to an authorized distribution channel before adding automatic application updates.

This workspace's release build used a local Electron 44.4.3 cache after download errors. The smoke-tested unpacked artifact is under release/final/win-unpacked. See release/release-notes.md for results and open checks.

Use the [versioning workflow](versioning.md) to bump a release. A successful `npm run dist:windows -- --x64` generates the installer, release notes, and SHA-256 checksum together.

## Linux (Debian and Ubuntu)

Build on Linux x64 with Node.js 24 (WSL Ubuntu works; the `.deb` packager does not run on Windows). Run `npm ci`, `npm test` and `npm run dist:linux`. electron-builder downloads the Electron runtime and its `fpm` packager. Output goes to `release/linux/`: a `.deb`, a portable `.AppImage`, `release-notes.md` and `checksums.sha256`. The script verifies the version in the filenames and, when `dpkg-deb` is available, the `.deb` control version.

- Install with `sudo apt install ./AI-Usage-Monitor-<version>-linux-amd64.deb` (check the exact file name in `release/linux/`), or `chmod +x` the AppImage and run it. The `.deb` installs the app as `ai-usage-monitor` and creates its desktop entry and icon.
- `Launch at login` writes `~/.config/autostart/ai-usage-monitor.desktop`; turning it off removes the file. An AppImage registers its own path, so move it before enabling the setting.
- The tray icon needs a StatusNotifier host. Stock GNOME hides tray icons unless the AppIndicator extension is enabled. Click the tray icon to open the dashboard.
- Provider CLIs are found on `PATH` first, then in `~/.local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `~/.volta/bin`, `~/.bun/bin`, `~/.nvm/versions/node/*/bin`, `/usr/local/bin`, `/usr/bin` and `/snap/bin`, because desktop launchers often start apps with a shorter `PATH` than a terminal.
- On Ubuntu 24.04 and later, AppArmor can block Chromium sandboxing for AppImages. The `.deb` is the recommended install; if the AppImage does not start, run it once with `--no-sandbox`.
- The `maintainer` in `package.json` is a placeholder address; set a real one before publishing. Packages are unsigned.
- Smoke test the unpacked app (`release/linux/linux-unpacked/ai-usage-monitor --monitor-smoke`) under a desktop session or `xvfb-run`.
