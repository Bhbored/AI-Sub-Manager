# Source layout

The app, tests, and Node-based release tools are written in TypeScript. The Windows icon generation script remains PowerShell.

| Path | Responsibility |
| --- | --- |
| `src/desktop/` | Electron startup, tray and window lifecycle, SQLite, preload bridge, and packaged smoke test. |
| `src/worker/` | Utility process, refresh scheduling, and retry handling. |
| `src/providers/` | Read-only Explore scanners (`inventory/`), Windows and POSIX CLI discovery (`windows-cli.ts`, `posix-cli.ts`, shared contract in `cli.ts`) plus separate Codex and Claude adapters. |
| `src/shared/` | IPC and worker contracts, validation, and renewal calculations. |
| `src/ui/` | React entry point, dashboard and settings features, shared controls, and Tailwind theme. |
| `scripts/` | Version bumps, Windows and Linux packaging (`dist.ts --platform`), and asset generation. |
| `tests/` | Provider, CLI discovery, scheduling, storage, and validation tests. |

Use Node.js 24 and run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. Open the repository root in your editor so its `tsconfig.json` can point to the desktop, renderer, test, and release tool configurations. The desktop compiler writes Electron code to `dist-electron/`, and Vite compiles the renderer and its Tailwind theme into `dist/`. Electron loads the emitted preload as CommonJS because the renderer sandbox requires it. The Claude status-line helper also emits a standalone CommonJS file for the external CLI.

When changing a message, update its contract in `src/shared/contracts.ts` before updating the sender and receiver. Desktop IPC still validates the renderer sender and incoming preference values at runtime.
