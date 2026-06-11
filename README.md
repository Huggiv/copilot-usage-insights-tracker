# Copilot Usage Insights Tracker

See exactly where your GitHub Copilot Chat spend goes — per message, per session, per tool call.

This VS Code extension reads your local Copilot Chat logs, Copilot CLI usage logs, and Copilot Agent run logs. It displays cost, token, and tool-call breakdowns right in your editor. No data leaves your machine.

> **Not affiliated with GitHub or Microsoft.**
> GitHub measures Copilot usage in AI credits (AIC), where **1 AIC = $0.01 USD**. See the official [GitHub Copilot billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-copilot-billing) for details.

![GitHub Copilot Chat Usage showing token, cost, and tool-call insights](https://github.com/Huggiv/copilot-usage-insights-tracker/raw/main/images/copilot_usage_sidebar.gif)

---

## What It Does

| Capability | Detail |
|---|---|
| **Multi-source tracking** | Track usage from VS Code Copilot Chat, local Copilot CLI logs, and Copilot Agent runs — all in one view |
| **Cost & token breakdown** | See AIC, input/output tokens, cached tokens, and duration for every message |
| **Tool-call inspection** | View searches, file reads, edits, terminal commands, and more |
| **Session comparison** | Compare token usage across messages, sessions, and sources |
| **Source labels** | Sessions display `[CLI]` or `[Agent]` badges to show where usage comes from |
| **AI chat about usage** | Use `@usage` in Copilot Chat to ask questions about your current or recent sessions |
| **Quick links** | Open GitHub's AI credits docs directly from the AIC row |

---

## Quick Start

**1. Enable VS Code Copilot Chat debug logging** (optional, for chat usage):

```text
github.copilot.chat.agentDebugLog.fileLogging.enabled = true
```

![VS Code showing how to enable Copilot debug logging](https://github.com/Huggiv/copilot-usage-insights-tracker/raw/main/images/copilot_enable_debug_log.gif)

![VS Code Settings showing Copilot debug logging configuration](https://github.com/Huggiv/copilot-usage-insights-tracker/raw/main/images/copilot_usage_settings.gif)

**2. (Optional) Configure Copilot CLI or Agent log directories:**

If you use local Copilot CLI or Copilot Agent, configure the extension to scan for their logs:

```text
copilotUsageTracker.cliSearchRoots: [/path/to/cli/logs, ...]
copilotUsageTracker.agentSearchRoots: [/path/to/agent/runs, ...]
```

The extension automatically discovers `copilot-cli` or `gh-copilot` directories (for CLI) and `copilot-agent` or `agent-runs` directories (for Agent) within configured roots.

**3. Start a new Copilot Chat session (VS Code)** or **run Copilot CLI/Agent commands**.

**4. Open the Copilot Usage view** in the VS Code activity bar to see all sources.

> **Remote-SSH users:** Install this extension on the **local** VS Code client, not the remote. Usage files are stored on your local machine.

If debug logs are unavailable, the extension falls back to VS Code `chatSessions` files for transcript and tool-call data. For CLI and Agent logs, ensure you've configured the search roots.

---

## Commands

| Command | Description |
|---|---|
| `Copilot Usage: Analyze Current Session` | Load and display the active session |
| `Copilot Usage: Pick Session to Analyze` | Browse and select a past session |
| `Refresh` | Reload the current view |

---

## Privacy

- The extension reads **local files only** — no data is sent anywhere by default.
- When you use the `@usage` chat participant, the extension sends a session summary (message previews, tool names, token counts, cost totals) to the VS Code language model to answer your question.

---

## Server Dashboard

The repo also includes a server-side collector and web dashboard for team-level usage tracking.

![Copilot Usage Dashboard GIF](https://github.com/Huggiv/copilot-usage-insights-tracker/raw/main/images/copilot_usage_dashboard.gif)

- [Server setup & API docs](https://github.com/Huggiv/copilot-usage-insights-tracker/blob/main/server/README.md)
- [Full project summary](https://github.com/Huggiv/copilot-usage-insights-tracker/blob/main/docs/project-summary.md)

---

## Development

See [Developer.md](https://github.com/Huggiv/copilot-usage-insights-tracker/blob/main/Developer.md) for local setup, build steps, testing, and publishing.

---

## Supported Usage Sources

| Source | Log Format | Badge | Auto-Discovery |
|--------|-----------|-------|---|
| **VS Code Copilot Chat** | Debug JSONL or chatSessions | None | Built-in (`~/.vscode/` and `/tmp/`) |
| **Copilot CLI** | JSONL | `[CLI]` | `copilot-cli`, `gh-copilot` dirs |
| **Copilot Agent** | JSONL | `[Agent]` | `copilot-agent`, `agent-runs` dirs |

---

## Configuration

### VS Code Settings

| Setting | Type | Default | Purpose |
|---------|------|---------|---|
| `copilotUsageTracker.searchRoots` | string[] | `[]` | Additional directories to scan for VS Code Copilot Chat logs |
| `copilotUsageTracker.cliSearchRoots` | string[] | `[]` | Root directories to scan for Copilot CLI logs (discovers `copilot-cli` or `gh-copilot` subdirs) |
| `copilotUsageTracker.agentSearchRoots` | string[] | `[]` | Root directories to scan for Copilot Agent logs (discovers `copilot-agent` or `agent-runs` subdirs) |
| `copilotUsageTracker.maxSearchDepth` | number | `6` | Maximum recursion depth when scanning log directories |
| `copilotUsageTracker.monthlyCreditLimit` | number | `100000` | AI Credit budget for the month (drives usage meter) |
| `copilotUsageTracker.serverUrl` | string | `""` | Optional backend server URL for session reporting (leave empty to disable) |
| `copilotUsageTracker.userId` | string | `""` | Override user ID sent to server (defaults to GitHub account or OS username) |

---

## Known Limitations

VS Code and Copilot Chat log formats are internal and may change without notice. The parser handles missing or unexpected values gracefully, but some fields are best-effort and may need updates after a VS Code upgrade. Copilot CLI and Agent log formats are also subject to change.
