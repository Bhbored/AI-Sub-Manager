# Source layout

The app, tests, and Node-based release tools are written in TypeScript. The Windows icon generation script remains PowerShell.

| Path | Responsibility |
| --- | --- |
| `src/desktop/` | Electron startup, tray and window lifecycle, SQLite, preload bridge, and packaged smoke test. |
| `src/worker/` | Utility process, refresh scheduling, and retry handling. |
| `src/providers/` | Windows CLI discovery plus separate Codex and Claude adapters. |
| `src/shared/` | IPC and worker contracts, validation, and renewal calculations. |
| `src/ui/` | React entry point, dashboard and settings features, shared controls, and Tailwind theme. |
| `scripts/` | Version bumps, Windows packaging, and asset generation. |
| `tests/` | Provider, CLI discovery, scheduling, storage, and validation tests. |

Use Node.js 24 and run `npm ci`, `npm test`, and `npm run build`. The desktop compiler writes Electron code to `dist-electron/`. Vite builds the renderer in `dist/` and reads the Tailwind stylesheet generated in `generated/`. Electron loads the emitted preload as CommonJS because the renderer sandbox requires it. The Claude status-line helper also emits a standalone CommonJS file for the external CLI.

When changing a message, update its contract in `src/shared/contracts.ts` before updating the sender and receiver. Desktop IPC still validates the renderer sender and incoming preference values at runtime.
