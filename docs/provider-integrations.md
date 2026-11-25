# Provider integration and architecture

| Provider | Discovery and sign-in | Subscription usage |
| --- | --- | --- |
| Codex | Native executable or official npm shim on PATH (Windows PATH, or the Linux PATH plus common user install folders). Sign in with `codex login`. | Uses the documented `account/read` and `account/rateLimits/read` stdio app-server requests. Displays only windows that the provider actually reports. A signed-in run remains unverified in this environment. |
| Claude Code | Native executable or official native npm layout on PATH (Windows PATH, or the Linux PATH plus common user install folders). Sign in with `claude auth login`. | `auth status` verifies a subscription login. The installed Claude Code 2.1.330 was detected and returned a subscription login. 5-hour and weekly usage come from the status-line capture described below. |

The monitor uses the current CLI profiles, including a profile selected in the inherited environment. Installations, updates, and login remain under the user's control. The app does not read credential files (it only edits the status line entry in Claude settings, described below) or send account details to the renderer. It filters common API credentials from CLI child environments. Custom terminal functions, shell aliases, non-npm command wrappers, and CLIs installed inside WSL aren't discoverable on PATH (Windows PATH, or the Linux PATH plus common user install folders).

Electron's main process owns SQLite, notifications to the renderer, tray behavior, and worker lifetime. The sandboxed renderer calls a small preload API; the main process validates the sender and settings. One utility process runs the provider adapters and a scheduler that deduplicates work per provider. A failed read triggers a bounded retry delay. Stale results from SQLite can be displayed during errors, and the database keeps at most 500 snapshots per provider. Logs contain structured events and coarse result states; they exclude CLI output.

To add a provider, implement a refresh function returning a normalized status and optional snapshot. Register it in the worker, extend the validated provider IDs, and add its display name and documented discovery rules.

## Explore inventory

The Explore page scans each provider's local folder on demand (`~/.claude` and `~/.claude.json`, or `CLAUDE_CONFIG_DIR`; `~/.codex`, or `CODEX_HOME`). It is read-only.

| Item | Claude Code | Codex |
| --- | --- | --- |
| Projects and sessions | `projects/<project>/*.jsonl`; the project path is read from the `cwd` recorded in recent transcripts | `sessions/YYYY/MM/DD/rollout-*.jsonl` and `archived_sessions/`, grouped by recorded `cwd`; created time comes from the file name |
| Skills | `skills/` and each installed plugin's `skills/` | `skills/` and `skills/.system/` |
| Plugins | `plugins/installed_plugins.json` and `enabledPlugins` in `settings.json` | `[plugins."name@market"]` tables in `config.toml` |
| MCP servers | `mcpServers` in `.claude.json` (user and per project) and plugin `.mcp.json` | `[mcp_servers.<name>]` tables in `config.toml` |
| Configuration | `settings.json`, `settings.local.json`, `CLAUDE.md`, `.claude.json` | `config.toml`, `AGENTS.md` |

Privacy rules: `.credentials.json` and `auth.json` are never read, listed or opened. For MCP servers only the name, transport, launcher program name or credential-free URL are kept; arguments, headers, environment values and URL queries are discarded. The rest of `.claude.json` (account details) is ignored. The renderer can only ask the main process to open folders, or JSON, TOML and Markdown files, inside these provider folders. Symbolic links are not followed while measuring sizes. The Codex TOML reader is deliberately minimal (table headers plus string and boolean values).

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode).

## Claude Code usage capture

Claude Code reports `rate_limits` (`five_hour` and `seven_day`, each with `used_percentage` and `resets_at`) only to its configured `statusLine` command, and only for claude.ai subscribers after the first API response in a session. The app does not edit Claude settings. On startup, and whenever Claude monitoring is re-enabled, the app registers the collector in Claude Code's `settings.json` (`%CLAUDE_CONFIG_DIR%` or `~/.claude`): it adds a `statusLine` entry when none exists, repairs its own entry if the path changed, and never overwrites a status line it did not create (the Claude card then shows a hint). It also needs `node` on PATH. The entry looks like:

```json
{ "statusLine": { "type": "command", "command": "node \"<install>/resources/app.asar.unpacked/dist-electron/providers/claude/statusline.cjs\" \"<data-folder>/claude-usage.json\"" } }
```

To combine it with your own status line, call the script from yours with the same stdin. The script stores only the rate-limit fields in `claude-usage.json`; the worker reads it on each refresh. Data updates only while Claude Code is in use, so older values show as cached.
