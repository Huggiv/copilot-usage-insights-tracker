# Developer Guide

This guide covers setting up your local development environment, building the extension, and deploying services.

## Quick Start

This project includes a `Makefile` to streamline local development and deployment:

### Extension Development

```bash
# Install dependencies, compile, package, and install in local VS Code
make copilot-usage-install

# Uninstall the extension from VS Code
make copilot-usage-uninstall
```

### Docker Services

```bash
# Deploy backend (port 8000) and frontend (port 5173) locally
make docker-deploy

# Stop running Docker services
make docker-stop

# View Docker Compose logs
make docker-logs
```

### Internal Targets

These are called automatically but can be run independently:

```bash
make install      # npm ci - install npm dependencies
make compile      # npm run compile - TypeScript compilation
make package      # npm run package - create VSIX extension package
make clean        # Remove build artifacts and VSIX files
make help         # Show available targets
```

**Note:** The `code` CLI command must be available in your PATH for the install/uninstall targets to work. If it's not available, you can install the extension manually via the VS Code UI: Extensions > ... menu > Install from VSIX.

## Build

```bash
npm install
npm run compile
npm test
```

## Architecture

### Multi-Source Parser Design

The extension supports ingesting usage data from four sources via a modular parser architecture:

**Source Types:**
- `debugLog` — VS Code Copilot Chat debug logs (default, built-in discovery)
- `chatSession` — VS Code Copilot Chat `.jsonl` session files (fallback)
- `copilotCli` — Local Copilot CLI usage logs (JSONL or JSON array format)
- `copilotAgent` — Local Copilot Agent run logs (JSONL with typed records)

**Parser Modules:**
- `src/parser.ts` — Main routing and type definitions
- `src/parser/normalizers.ts` — Shared coercion helpers for token and credit conversion
- `src/parser/copilotCliParser.ts` — CLI log parsing (228 lines)
- `src/parser/copilotAgentParser.ts` — Agent log parsing with tool attachment (352 lines)

**Discovery & Configuration:**
- New config keys: `copilotUsageTracker.cliSearchRoots` and `copilotUsageTracker.agentSearchRoots`
- Automatic sub-directory discovery: `copilot-cli`, `gh-copilot` (CLI); `copilot-agent`, `agent-runs` (Agent)
- Source-qualified session de-duplication via `candidateMergeKey()` to prevent cross-source ID collisions

**Surface Integration:**
- Tree view displays `[CLI]` and `[Agent]` badges on session nodes
- Chat participant shows source tags in search results
- Graph serialization includes `sourceType` in stats
- Server reporting includes `source_category` field (vscode, copilot_cli, copilot_agent)

**Testing:**
- 16 new parser tests covering CLI and Agent parsing, malformed-line resilience, and source routing
- Fixture files with real-world test cases: `test/fixtures/sample-copilot-cli.jsonl` and `test/fixtures/sample-copilot-agent.jsonl`

## Backend API Tests

Run backend checks locally from `server/backend`:

```bash
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m compileall app
pytest -q
```

CI now enforces backend checks through `.github/workflows/backend-ci.yml` for backend-related changes.

## Local VS Code Development Setup

`vsce` is a local dev dependency, so packaging fails if dependencies are not installed.

Run:

```bash
npm install
npm run package
```

For a one-off command without relying on PATH resolution, run:

```bash
npx @vscode/vsce package
```

If `npm run package` still fails after install, run:

```bash
npm ls @vscode/vsce
node -v
```

`@vscode/vsce` works best on a current LTS Node.js version.

## Install VSIX in VS Code

### Via UI

1. Open VS Code.
2. Go to Extensions (`Ctrl+Shift+X`).
3. Click the three-dot menu in the top-right of the Extensions panel.
4. Choose `Install from VSIX...`.
5. Select your file: `copilot-usage-0.2.0.vsix`.
6. Reload VS Code if prompted.

### Via Command Line

1. Open PowerShell in the folder containing the VSIX.
2. Run:

```bash
code --install-extension copilot-usage-0.2.0.vsix
```

## Extension Publishing

This repository includes a workflow to publish the extension to the VS Code Marketplace: `.github/workflows/publish-vscode-extension.yml`.

### Setup

1. Create a VS Code Marketplace Personal Access Token (PAT).
2. Add it as a repository secret named `VSCE_PAT`.
3. (Optional, recommended) Create a protected environment named `vscode-marketplace` and require approval.

### Release Publish Flow

1. Bump `package.json` version.
2. Commit the change.
3. Create and push a matching tag (example: `v0.2.0`).

The workflow runs on `v*.*.*` tags and checks that the tag version matches `package.json` before publishing.

## Troubleshooting

- **`code` command not found**: The VS Code CLI is not in your PATH. Install it manually or add it to your PATH.
- **`vsce` package errors**: Ensure dependencies are installed (`npm install`) and you're using a current LTS Node.js version.
- **Docker services fail to start**: Check that Docker daemon is running and ports 8000 and 5173 are available.
- **CLI/Agent logs not appearing**: Verify that `copilotUsageTracker.cliSearchRoots` or `copilotUsageTracker.agentSearchRoots` are configured correctly in VS Code settings. The extension scans for `copilot-cli`, `gh-copilot`, `copilot-agent`, and `agent-runs` subdirectories within configured roots.

---

## Adding a New Usage Source

To support a new usage source format:

1. **Create a parser module** in `src/parser/newSourceParser.ts`:
   - Export a function `parseNewSourceLog(filePath: string): SessionSummary | undefined`
   - Use `normalizers.ts` helpers for field coercion and credit conversion
   - Return `undefined` if the file cannot be parsed or contains no valid records

2. **Add the source type** to `UsageSourceType` union in `src/parser.ts`:
   ```typescript
   export type UsageSourceType = 'debugLog' | 'chatSession' | 'copilotCli' | 'copilotAgent' | 'newSource';
   ```

3. **Extend the router** in `parseUsageSessionFile()` to handle your source type:
   ```typescript
   case 'newSource':
       return (require('./parser/newSourceParser').parseNewSourceLog as any)(filePath);
   ```

4. **Add discovery helpers** in `src/extension.ts`:
   - Implement `collectNewSourceLogDirs()` to find source-specific directories
   - Call it from `findSessionsForDays()` and merge results with `mergeSessionCandidate()`

5. **Add configuration keys** in `package.json` under `contributes.configuration.properties`:
   ```json
   "copilotUsageTracker.newSourceSearchRoots": {
     "type": "array",
     "items": {"type": "string"},
     "default": [],
     "description": "Directories to scan for new source logs..."
   }
   ```

6. **Add tests** in `test/parser.test.js` with fixture files in `test/fixtures/`

7. **Update the README** with the new source in the "Supported Usage Sources" table
