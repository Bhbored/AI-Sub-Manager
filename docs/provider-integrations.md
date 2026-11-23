# Provider integration and architecture

| Provider | Discovery and sign-in | Subscription usage |
| --- | --- | --- |
| Codex | Native executable or official npm shim on Windows PATH. Sign in with `codex login`. | Uses the documented `account/read` and `account/rateLimits/read` stdio app-server requests. Displays only windows that the provider actually reports. A signed-in run remains unverified in this environment. |
| Claude Code | Native executable or official native npm layout on Windows PATH. Sign in with `claude auth login`. | `auth status` verifies a subscription login. The installed Claude Code 2.1.330 was detected and returned a subscription login. Interactive usage is not collected. |

The monitor uses the current CLI profiles, including a profile selected in the inherited environment. Installations, updates, and login remain under the user's control. The app does not read credential files or send account details to the renderer. It filters common API credentials from CLI child environments. Custom terminal functions, shell aliases, non-npm command wrappers, and CLIs installed inside WSL aren't discoverable on Windows PATH.

Electron's main process owns SQLite, notifications to the renderer, tray behavior, and worker lifetime. The sandboxed renderer calls a small preload API; the main process validates the sender and settings. One utility process runs the provider adapters and a scheduler that deduplicates work per provider. A failed read triggers a bounded retry delay. Stale results from SQLite can be displayed during errors, and the database keeps at most 500 snapshots per provider. Logs contain structured events and coarse result states; they exclude CLI output.

To add a provider, implement a refresh function returning a normalized status and optional snapshot. Register it in the worker, extend the validated provider IDs, and add its display name and documented discovery rules.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode).
