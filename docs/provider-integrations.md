# Provider integration and architecture

| Provider | Discovery and sign-in | Subscription usage |
| --- | --- | --- |
| Codex | Native executable or official npm shim on PATH (Windows PATH, or the Linux PATH plus common user install folders). Sign in with `codex login`. | Uses the documented `account/read` and `account/rateLimits/read` stdio app-server requests. Displays only windows that the provider actually reports. A signed-in run remains unverified in this environment. |
| Claude Code | Native executable or official native npm layout on PATH (Windows PATH, or the Linux PATH plus common user install folders). Sign in with `claude auth login`. | `auth status` verifies a subscription login. The installed Claude Code 2.1.330 was detected and returned a subscription login. 5-hour and weekly usage come from the status-line capture described below. |

The monitor uses the current CLI profiles, including a profile selected in the inherited environment. Installations, updates, and login remain under the user's control. The app does not read credential files (it only edits the status line entry in Claude settings, described below) or send account details to the renderer. It filters common API credentials from CLI child environments. Custom terminal functions, shell aliases, non-npm command wrappers, and CLIs installed inside WSL aren't discoverable on PATH (Windows PATH, or the Linux PATH plus common user install folders).

Electron's main process owns SQLite, notifications to the renderer, tray behavior, and worker lifetime. The sandboxed renderer calls a small preload API; the main process validates the sender and settings. One utility process runs the provider adapters and a scheduler that deduplicates work per provider. A failed read triggers a bounded retry delay. Stale results from SQLite can be displayed during errors, and the database keeps at most 500 snapshots per provider. Logs contain structured events and coarse result states; they exclude CLI output.

To add a provider, implement a refresh function returning a normalized status and optional snapshot. Register it in the worker, extend the validated provider IDs, and add its display name and documented discovery rules.

## Explore inventory

The Explore page inspects each provider's local profile on demand. Codex is selected first. Choose Projects, MCP, Skills, Plugins, or Configuration to manage that provider's local data. The editor writes only when you select **Save** or press **Ctrl+S**. **Revert** restores the last loaded or saved version, and **Reload from disk** reads external changes.

| Item | Claude Code | Codex |
| --- | --- | --- |
| Projects and sessions | `projects/<project>/*.jsonl`; the project path is read from the `cwd` recorded in recent transcripts | `sessions/YYYY/MM/DD/rollout-*.jsonl` and `archived_sessions/`, grouped by recorded `cwd`; created time comes from the file name |
| Skills | Personal `skills/` and installed plugin skills | `~/.agents/skills`, profile `skills/`, and discovered bundled and plugin skills |
| Plugins | Provider CLI inventory and user-scope uninstall | Provider CLI inventory and uninstall |
| MCP servers | `mcpServers` in `.claude.json` (user and per project) and plugin `.mcp.json` | `[mcp_servers.<name>]` tables in `config.toml` |
| Configuration | `settings.json`, `settings.local.json`, `CLAUDE.md` | `config.toml`, `AGENTS.md` |

Delete history permanently removes the selected provider's local history and recalculates the tracked bytes. It preserves source files and Claude project settings. Codex deletion needs a CLI that can verify all related sessions and refuses active or cross-project sessions. Personal skills move to the system trash. Plugin uninstall uses the provider CLI. Claude removes the plugin's persistent data when its last installation is uninstalled.

Credential files stay outside Explore. The MCP inventory shows redacted summaries. The editor displays the selected user configuration on request, so it may include secrets stored in that file. For Claude, only the user-level `mcpServers` object reaches the editor. The rest of `.claude.json` stays in the main process. Editor contents are not logged or stored by the monitor. Linked files and folders cannot be edited or removed through Explore.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode).

## Claude Code usage capture

Claude Code reports `rate_limits` (`five_hour` and `seven_day`, each with `used_percentage` and `resets_at`) only to its configured `statusLine` command, and only for claude.ai subscribers after the first API response in a session. The app does not edit Claude settings. On startup, and whenever Claude monitoring is re-enabled, the app registers the collector in Claude Code's `settings.json` (`%CLAUDE_CONFIG_DIR%` or `~/.claude`): it adds a `statusLine` entry when none exists, repairs its own entry if the path changed, and never overwrites a status line it did not create (the Claude card then shows a hint). It also needs `node` on PATH. The entry looks like:

```json
{ "statusLine": { "type": "command", "command": "node \"<install>/resources/app.asar.unpacked/dist-electron/providers/claude/statusline.cjs\" \"<data-folder>/claude-usage.json\"" } }
```

To combine it with your own status line, call the script from yours with the same stdin. The script stores only the rate-limit fields in `claude-usage.json`; the worker reads it on each refresh. Data updates only while Claude Code is in use, so older values show as cached.
