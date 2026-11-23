# Application versioning

`package.json` is the source of truth for the AI Usage Monitor version. Versions use stable `major.minor.patch` numbers. Windows executable version resources require each number to be between 0 and 65535.

| Change | Command | Example |
| --- | --- | --- |
| Bug fix or maintenance | `npm run version:bump -- patch` | 1.0.0 → 1.0.1 |
| Backward-compatible feature | `npm run version:bump -- minor` | 1.0.0 → 1.1.0 |
| Breaking change | `npm run version:bump -- major` | 1.0.0 → 2.0.0 |

The bump command updates `package.json` and both root version fields in `package-lock.json`. It does not build, commit, or create a Git tag. Commit both files together when reviewing a release. Use a bump once per intended release. Rebuilding or testing a release keeps its version unless you explicitly run the bump command.

## Where the version appears

| Location | How it gets the version |
| --- | --- |
| Settings and About | Electron reads the packaged manifest through `app.getVersion()`. |
| Codex app-server handshake | The main process passes that same version to the worker, which sends it as client metadata. |
| Windows app and installer metadata | electron-builder reads the manifest and writes the executable version resources. The release script checks the installer version before generating release files. |
| Installer filename | The NSIS artifact template substitutes the manifest version in `AI-Usage-Monitor-Setup-<version>.exe`. |
| Release notes and checksum | The release script uses the version, signing status, and SHA-256 of the installer returned by the current build. |

The Electron runtime version, provider CLI versions, and SQLite schema revision have separate lifecycles. A release bump does not change them. Keep the Windows app ID stable so a new release upgrades the same installed app.

## Release workflow

1. Run the appropriate bump command.
2. Optionally write the release changes in `docs/release-notes/<version>.md`. Write the body only. The build adds the product name, version, and Authenticode status.
3. Run `npm test`, then `npm run dist:windows -- --x64` (or `npm run dist:linux`). The build stops if the manifest and lockfile versions disagree or the installer metadata does not match.
4. Review the generated `release/release-notes.md` and `release/checksums.sha256`. Smoke-test the unpacked application and installer before sharing them. Distribute the installer and checksum together.

The default output is `release/`. Use `--out-dir <directory>` for a separate build and `--electron-dist <directory>` when building from a trusted local Electron archive or distribution that matches the pinned Electron version. For signing and smoke testing, see [Windows packaging](packaging.md).
