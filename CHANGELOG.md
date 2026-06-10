# Changelog

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