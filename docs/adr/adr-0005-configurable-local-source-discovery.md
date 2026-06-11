---
title: "ADR-0005: Configurable Local Source Discovery"
status: "Proposed"
date: "2026-06-11"
authors: "Copilot Usage maintainers; extension users; remote-workspace users"
tags: ["architecture", "decision", "discovery", "configuration", "privacy"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The extension currently discovers VS Code Copilot Chat data by scanning known user-storage locations and optional `copilotUsageTracker.searchRoots`. The planned multi-source feature requires discovery of local Copilot CLI and local Copilot Agent run logs, but their default locations may differ by operating system, tool version, installation channel, and user configuration.

The extension must balance convenience with privacy and performance. Blindly scanning broad home-directory trees would be costly and surprising. Requiring every user to manually pick a file for each session would make the feature difficult to use. The current architecture already includes bounded recursive search and user-provided roots, so the new discovery model should extend that pattern.

The key forces are:

- **CTX-001**: CLI and local agent logs may not live under VS Code `workspaceStorage`.
- **CTX-002**: Remote-workspace scenarios require continued attention to the host that can read local user artifacts.
- **CTX-003**: Users need explicit control over additional local paths scanned by the extension.
- **CTX-004**: Candidate lists and picker behavior must remain deterministic across mixed source types.
- **CTX-005**: Discovery must avoid duplicate sessions when the same file is reachable through multiple configured roots.

# Decision

The extension will use configurable, bounded local discovery roots for Copilot CLI and local Copilot Agent usage sources, in addition to existing VS Code storage discovery.

The configuration surface will add:

- **CFG-001**: `copilotUsageTracker.cliSearchRoots` for directories that may contain Copilot CLI usage logs.
- **CFG-002**: `copilotUsageTracker.agentSearchRoots` for directories that may contain local Copilot Agent run logs.

Discovery will create typed session candidates that include source type, source file path, session ID, and modified time. Candidate merging will de-duplicate by a source-qualified key rather than by session ID alone. Picker ordering will continue to use recency so users see the most recent activity across VS Code, CLI, and agent sources together.

This decision was selected because it gives users control over non-VS Code log locations while preserving the current local-file privacy model and bounded scanning behavior.

# Consequences

## Positive

- **POS-001**: Users can opt into scanning CLI and local agent log directories without granting broad implicit access to unrelated files.
- **POS-002**: Existing search-root behavior is extended rather than replaced, reducing surprise for current users.
- **POS-003**: Source-qualified candidates prevent collisions when different source types produce similar session IDs.
- **POS-004**: Recency-based picker ordering remains familiar while becoming source-aware.
- **POS-005**: The implementation can support future known default paths without changing the user-facing model.

## Negative

- **NEG-001**: Users may need to configure roots manually when CLI or agent log locations are unknown or tool-specific.
- **NEG-002**: Incorrectly configured broad roots can still increase scan time, even with recursion limits.
- **NEG-003**: Documentation must clearly explain what paths are scanned and why.
- **NEG-004**: Discovery helpers must be kept in sync with parser routing so unsupported files do not flood candidate lists.

# Alternatives Considered

## Scan the Whole Home Directory Automatically

- **ALT-001**: **Description**: Recursively scan the user's home directory for possible CLI and local agent usage logs.
- **ALT-002**: **Rejection Reason**: This is too broad for privacy and performance and would create unpredictable activation and refresh costs.

## Require Manual File Selection for Every CLI or Agent Session

- **ALT-003**: **Description**: Add an import command that requires the user to choose each CLI or agent log file manually.
- **ALT-004**: **Rejection Reason**: This avoids scanning but creates high friction and does not fit the existing session picker experience.

## Reuse Only `copilotUsageTracker.searchRoots`

- **ALT-005**: **Description**: Put all VS Code, CLI, and agent discovery under the existing generic search-root setting.
- **ALT-006**: **Rejection Reason**: A single setting makes source intent ambiguous and gives users less control over which non-VS Code paths are scanned.

## Hard-Code CLI and Agent Default Paths Only

- **ALT-007**: **Description**: Discover only known default directories for CLI and agent logs with no user configuration.
- **ALT-008**: **Rejection Reason**: Defaults are likely to vary across versions and environments, and users need a fallback for custom locations.

# Implementation Notes

- **IMP-001**: Extend `SessionCandidate` in `src/extension.ts` with `sourceType` and optional `sourceFile` fields.
- **IMP-002**: Add bounded helper functions such as `collectCopilotCliLogDirs` and `collectCopilotAgentLogDirs`, following the defensive style of existing directory collectors.
- **IMP-003**: Use `maxSearchDepth` or source-specific bounded recursion to avoid unbounded scans.
- **IMP-004**: De-duplicate candidates by a canonical key containing source type and canonical file path or session ID.
- **IMP-005**: Surface source labels in picker details so users know whether a row came from VS Code, CLI, or a local agent run.
- **IMP-006**: Document that configured search roots are read locally and that raw file content is not sent to the server by default.

# References

- **REF-001**: `../plan/feature-copilot-usage-sources-1.md` - Phase 3 discovery and candidate-resolution tasks.
- **REF-002**: `../../src/extension.ts` - current workspaceStorage, debug-log, and `chatSessions` discovery logic.
- **REF-003**: `../../package.json` - extension settings and command contributions.
- **REF-004**: `../../README.md` - user-facing privacy and setup guidance.
- **REF-005**: `adr-0001-remote-session-retrieval.md` - related local-storage and remote-workspace retrieval decision.
- **REF-006**: `adr-0003-multi-source-usage-ingestion.md` - parent source-model decision.
