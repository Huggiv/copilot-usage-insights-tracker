# Changelog

## 2.0.0

**Major feature release: Multi-source usage ingestion**

- **Copilot CLI support**: Parse and analyze local Copilot CLI usage logs (JSONL format) with token and credit tracking.
- **Copilot Agent support**: Ingest local Copilot Agent run logs with multi-turn execution and tool-call tracking.
- **Source-aware discovery**: Automatically scan configurable directories for CLI and Agent logs with source de-duplication.
- **Source labels in UI**: Sessions display `[CLI]` or `[Agent]` badges in tree view, search results, and chat participant output.
- **Source-specific parser modules**: New modular architecture with `copilotCliParser.ts`, `copilotAgentParser.ts`, and shared `normalizers.ts` for field coercion and credit conversion.
- **New configuration keys**: `copilotUsageTracker.cliSearchRoots` and `copilotUsageTracker.agentSearchRoots` to configure scan paths.
- **Enhanced reporting**: Includes `source_category` field in server payloads (vscode, copilot_cli, copilot_agent).
- **Backward compatible**: Existing VS Code debug log parsing and chatSessions files unchanged; full migration support.
- **Comprehensive testing**: 16 new parser tests plus fixture files with real-world test cases and malformed-line resilience.

## 0.2.0

- Adds model usage tracking and reporting to improve cost and usage visibility.
- Adds session reporting with configurable server URL and user ID settings.
- Introduces a dashboard stack with backend and frontend services for visualizing usage data.
- Refactors API base URL handling and updates Nginx API routing behavior.
- Adds `extensionKind` to improve compatibility in Remote-SSH and remote workspace setups.
- Updates docs and diagrams for the new architecture and reporting flow.

## 0.1.0

- Initial private release.
- Adds a VS Code tree view for Copilot Chat usage sessions.
- Parses Copilot debug logs and VS Code `chatSessions` files.
- Shows message, token, cache, AIC, model-turn, tool-call, and command summaries.
- Adds the `@usage` chat participant and usage graph language model tools.
- Improves startup time by loading the current workspace session before scanning older workspace history.
- Speeds up session search by loading recent sessions first instead of reading all historical chat files up front.
- Adds a loading state for the session picker so it cannot be clicked repeatedly while sessions are loading.
- Adds a "Load older sessions" picker row to fetch older sessions in 10-day batches.
- Adds a Spend Summary section.
- Updates README with local packaging setup (`@vscode/vsce`) and VSIX installation steps (UI and command line).