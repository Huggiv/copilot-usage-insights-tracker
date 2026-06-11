# Copilot Usage Insights Tracker

See exactly where your GitHub Copilot Chat spend goes — per message, per session, per tool call.

This VS Code extension reads your local Copilot Chat logs and shows cost, token, and tool-call breakdowns right in your editor. No data leaves your machine.

> **Not affiliated with GitHub or Microsoft.**
> GitHub measures Copilot usage in AI credits (AIC), where **1 AIC = $0.01 USD**. See the official [GitHub Copilot billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-copilot-billing) for details.

![GitHub Copilot Chat Usage showing token, cost, and tool-call insights](images/usage-screenshot.png)

---

## What It Does

| Capability | Detail |
|---|---|
| **Cost & token breakdown** | See AIC, input/output tokens, cached tokens, and duration for every message |
| **Tool-call inspection** | View searches, file reads, edits, terminal commands, and more |
| **Session comparison** | Compare token usage across messages in a session |
| **AI chat about usage** | Use `@usage` in Copilot Chat to ask questions about your current or recent sessions |
| **Quick links** | Open GitHub's AI credits docs directly from the AIC row |

---

## Quick Start

**1. Enable debug logging** in VS Code settings:

```text
github.copilot.chat.agentDebugLog.fileLogging.enabled = true
```

**2. Start a new Copilot Chat session.**

**3. Open the Copilot Usage view** in the VS Code activity bar.

> **Remote-SSH users:** Install this extension on the **local** VS Code client, not the remote. Usage files are stored on your local machine.

If debug logs are unavailable, the extension falls back to VS Code `chatSessions` files for transcript and tool-call data. Billing totals may not be available in that case.

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

## Known Limitations

VS Code and Copilot Chat log formats are internal and may change without notice. The parser handles missing or unexpected values gracefully, but some fields are best-effort and may need updates after a VS Code upgrade.
