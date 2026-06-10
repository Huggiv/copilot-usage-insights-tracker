---
title: "ADR-0001: UI-Side Session Retrieval for Remote Workspaces"
status: "Proposed"
date: "2026-06-08"
authors: "Copilot Usage maintainers; remote-workspace users"
tags: ["architecture", "decision", "bugfix", "remote-workspaces"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The extension reads Copilot Chat session data from VS Code user storage artifacts, primarily debug logs and sibling `chatSessions` files. In remote workspace scenarios such as Remote-SSH, the workspace extension host does not own the local Copilot Chat storage where those artifacts are written.

This created a bug where the extension could load high-level session lists or partial summaries, but could not reliably retrieve full remote session detail from the extension when the active host was not the same host that owned the Copilot Chat artifacts.

The repository already documents the underlying constraint: remote users must run the extension on the local VS Code client because Copilot Chat usage files are stored in local user storage. The extension package also allows both `ui` and `workspace` execution, which means the architecture must explicitly prefer the host that has access to those files instead of assuming workspace-local filesystem visibility.

The decision therefore needs to make session-detail retrieval deterministic across local and remote workspaces without introducing a network dependency or changing the extension's privacy model.

# Decision

Session discovery and session-detail parsing will be treated as a UI-side responsibility first, because the local VS Code client is the authoritative location for Copilot Chat storage artifacts in remote workspace setups.

The extension will prefer execution paths and packaging that allow session selection, transcript lookup, sibling `chatSessions` resolution, and detailed parsing to run in the local UI host. Workspace-host execution remains allowed only as a compatibility fallback for scenarios where logs are actually present there.

This decision was selected because it fixes the bug at the architectural boundary where the data becomes unavailable. The problem is not in parsing fidelity alone; it is in assuming the extension can always retrieve session files from the same host as the active workspace. Aligning the retrieval path with the storage location preserves the existing filesystem-based design and avoids adding a server, synchronization layer, or remote API.

# Consequences

## Positive

- **POS-001**: Remote workspace users can retrieve full session detail from the extension when Copilot artifacts exist only in local VS Code user storage.
- **POS-002**: The fix preserves the current privacy model because session analysis still uses local filesystem reads rather than uploading logs to an external service.
- **POS-003**: The parser and title-resolution flow remain reusable because the change is about where files are resolved, not about redefining the session-summary schema.
- **POS-004**: The decision matches the repository documentation and packaging intent, reducing operator confusion about where the extension must run.

## Negative

- **NEG-001**: Supporting both `ui` and `workspace` extension kinds adds host-selection complexity that must remain explicit in future changes.
- **NEG-002**: Some remote scenarios may still produce incomplete detail when local debug logging is disabled and only partial `chatSessions` data is available.
- **NEG-003**: Testing must cover local and remote execution modes because regressions can be introduced by changes that work in one host but not the other.
- **NEG-004**: The fix depends on VS Code continuing to store Copilot Chat artifacts in the same local user-storage locations currently used by the extension.

# Alternatives Considered

## Keep session retrieval workspace-host only

- **ALT-001**: **Description**: Continue resolving session detail exclusively from the workspace extension host filesystem.
- **ALT-002**: **Rejection Reason**: This does not address the root cause because remote workspaces do not reliably expose the local Copilot Chat storage needed for detailed session retrieval.

## Add a remote service or synchronization layer

- **ALT-003**: **Description**: Mirror session artifacts to a backend service or synchronize them between UI and workspace hosts before parsing.
- **ALT-004**: **Rejection Reason**: This adds operational complexity, privacy concerns, and new failure modes for a problem that can be solved by running the retrieval path where the data already exists.

## Parse only whatever data is available from the current host

- **ALT-005**: **Description**: Accept partial summaries when detailed artifacts are missing and do not change host preference.
- **ALT-006**: **Rejection Reason**: This preserves the bug from the user's perspective because the extension still fails to provide the expected session detail in remote scenarios.

## Require manual file export from users

- **ALT-007**: **Description**: Ask users to manually locate and import local Copilot log files when working remotely.
- **ALT-008**: **Rejection Reason**: This undermines the extension's usability and shifts an architectural responsibility onto end users.

# Implementation Notes

- **IMP-001**: Keep `extensionKind` configured to allow UI-host execution and ensure commands that load or pick sessions use the host with access to local Copilot storage first.
- **IMP-002**: Preserve the current parsing fallback order: prefer detailed debug logs when available, then use sibling `chatSessions` data for transcript and tool-call detail when debug logs are absent or incomplete.
- **IMP-003**: Document the remote-workspace requirement in user-facing guidance so installation and troubleshooting point users to the UI-side deployment path.
- **IMP-004**: Validate the behavior with at least one remote-workspace scenario where the workspace host lacks direct access to the local Copilot storage tree.
- **IMP-005**: Treat success as: a remote user can pick a session, load its title and transcript detail, and see the same parsed session summary shape as a local user.

# References

- **REF-001**: `../../README.md` - documents that remote users must run the extension in the local VS Code client because Copilot artifacts are stored locally.
- **REF-002**: `../../package.json` - declares `extensionKind` support for both `ui` and `workspace` execution.
- **REF-003**: `../../CHANGELOG.md` - records the compatibility change for Remote-SSH and remote workspace setups.
- **REF-004**: `../../src/parser.ts` - contains sibling `chatSessions` resolution and session parsing logic used to assemble detailed summaries.
- **REF-005**: `../../src/extension.ts` - contains auto-load and session-picking flows that select and load session detail.