# AI Usage Monitor

A compact Windows and Linux (Debian/Ubuntu) utility that reads subscription status through the official CLIs already on your PATH. Codex quota windows come from its documented app-server. Claude Code account status is supported. Its interactive usage display has no verified machine-readable collection method.

## Run

Install the official provider CLIs you want to monitor. In a fresh terminal, run `where.exe codex` or `where.exe claude` (Windows) or `which codex` / `which claude` (Linux) and verify the matching version command. Use `codex login` or `claude auth login` to sign in with a subscription account. If you recently changed PATH, quit the monitor from the tray and relaunch it. Signing out in a terminal affects all clients using that CLI profile.

Open the dashboard and click Refresh. The Explore page (folder-search icon) lists, for Claude Code and Codex, each project with its session count, size, and created and last-active dates, plus installed skills, plugins, MCP servers and configuration files, with buttons to open the folders and files.

In Settings, enter your renewal dates, choose a refresh interval, and configure startup behavior. Close the window to keep the monitor running in the tray. Use Quit to stop monitoring.

## Build and maintain

- `npm ci` installs development dependencies. Use Node.js 24.
- `npm run dev` builds the renderer and launches Electron.
- `npm test` runs protocol parsing, CLI discovery, scheduler, validation, and SQLite tests.
- `npm run build` type-checks the source and builds Electron and the Tailwind-styled renderer.
- `npm run dist:windows -- --x64` builds the Windows NSIS installer (run on Windows).
- `npm run dist:linux` builds a Debian/Ubuntu `.deb` and a portable AppImage (run on Linux, or in WSL).
- [Provider integration and architecture](docs/provider-integrations.md)
- [Packaging, signing, and smoke testing](docs/packaging.md)
- [Application versioning and release bumps](docs/versioning.md)

- [TypeScript source layout](docs/source-layout.md)

## Window modes

Use the pin button to open the desktop widget. It shows each provider's 5-hour and weekly limits, reset times, and renewal date when available. Compact and widget modes are remembered between launches.

Use the full-screen button or **F11** to expand the dashboard and **Esc** to return to compact mode. The tray menu also offers all three modes. On Windows and Linux under X11, the widget opens at the top-right of the current display's usable area and stays above regular windows. On Wayland the widget view is available, while the compositor controls placement and pinning. Use your desktop's window menu or rules if it offers those options.
