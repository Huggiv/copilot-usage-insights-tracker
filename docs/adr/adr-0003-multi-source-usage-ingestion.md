---
title: "ADR-0003: Multi-Source Copilot Usage Ingestion"
status: "Proposed"
date: "2026-06-11"
authors: "Copilot Usage maintainers; VS Code extension users; server dashboard stakeholders"
tags: ["architecture", "decision", "usage-ingestion", "copilot-cli", "copilot-agent"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The extension currently reads local VS Code Copilot Chat artifacts, primarily debug logs and `chatSessions` files, and converts them into a `SessionSummary` model used by the sidebar view, the `@usage` chat participant, and optional server reporting.

The planned feature expands the product scope to include Copilot CLI sessions and locally executed Copilot Agent runs. These additional sources represent the same user-level concern, Copilot usage on the local system, but they are not guaranteed to share the same file layout or event schema as VS Code chat logs.

The key forces are:

- **CTX-001**: Users need a consolidated view of Copilot usage across editor chat, terminal/CLI workflows, and local agent workflows.
- **CTX-002**: The repository's current privacy posture depends on local filesystem reads and must not change by requiring raw log upload.
- **CTX-003**: Existing downstream components are coupled to `SessionSummary`, `UserMessageSummary`, `ModelTurnSummary`, and `ToolCallSummary`.
- **CTX-004**: VS Code, Copilot CLI, and local agent log formats may evolve independently and may contain partial or malformed records.
- **CTX-005**: Server reporting and model aggregation already assume normalized session-level and model-level metrics.

This decision is needed before implementation because it defines whether Copilot CLI and local agent usage become separate products, parallel dashboards, or first-class sources inside the existing usage model.

# Decision

Copilot CLI and local Copilot Agent runs will be ingested as first-class local usage sources and normalized into the existing session-summary domain model.

The canonical source model will include these source types:

- **SRC-001**: `debugLog` for VS Code Copilot Chat debug logs.
- **SRC-002**: `chatSession` for VS Code `chatSessions` fallback files.
- **SRC-003**: `copilotCli` for Copilot CLI local usage sessions.
- **SRC-004**: `copilotAgent` for locally executed Copilot Agent run usage.

All downstream consumers will continue to operate on `SessionSummary` and related summary types. Source-specific differences will be represented as additive metadata, especially `sourceType`, source labels, and optional raw payload provenance. No downstream component will require direct knowledge of raw CLI or agent log schemas.

This decision was selected because it keeps one product experience and one analytics pipeline while acknowledging that source provenance matters for interpretation, filtering, diagnostics, and future schema evolution.

# Consequences

## Positive

- **POS-001**: Users receive a consolidated local-system view of Copilot usage rather than separate partial views for editor, CLI, and agent workflows.
- **POS-002**: Existing UI, graph, participant, and reporter code can evolve additively because the normalized session model remains the integration boundary.
- **POS-003**: Source provenance can be exposed consistently in picker rows, sidebar nodes, graph output, and server payload metadata.
- **POS-004**: The local-first privacy model remains intact because all parsing occurs from local files before any optional aggregate reporting.
- **POS-005**: Future source additions can follow the same source-type and normalization pattern.

## Negative

- **NEG-001**: The parser and discovery layers become more complex because they must support multiple source schemas and path patterns.
- **NEG-002**: Some fields may be unavailable for CLI or agent sources, requiring careful handling of missing token, cost, duration, or tool-call values.
- **NEG-003**: Source provenance must be propagated across several layers to avoid misleading users about where usage originated.
- **NEG-004**: Test coverage must expand substantially because a regression in shared normalization can affect all sources.
- **NEG-005**: Source-specific interpretation rules may diverge as Copilot CLI and local agent schemas evolve.

# Alternatives Considered

## Keep VS Code Chat as the Only Supported Source

- **ALT-001**: **Description**: Preserve the existing extension scope and continue parsing only VS Code debug logs and `chatSessions` files.
- **ALT-002**: **Rejection Reason**: This fails the feature requirement to account for local Copilot CLI and local agent usage and leaves local-system usage incomplete.

## Build Separate Views for CLI and Agent Usage

- **ALT-003**: **Description**: Add independent sidebar views or dashboards for CLI and local agent usage with separate data models.
- **ALT-004**: **Rejection Reason**: This duplicates aggregation, filtering, graph, and reporting logic while making it harder for users to compare total usage across sources.

## Report Raw Source Logs to the Server for Central Parsing

- **ALT-005**: **Description**: Upload raw CLI and agent logs to the server dashboard and parse source-specific formats centrally.
- **ALT-006**: **Rejection Reason**: This violates the extension's local-first privacy posture and increases server responsibility for sensitive transcript/tool data.

## Convert New Sources into Synthetic VS Code Debug Logs

- **ALT-007**: **Description**: Transform CLI and agent records into synthetic debug-log entries, then reuse only the existing VS Code parser path.
- **ALT-008**: **Rejection Reason**: This hides source-specific semantics, makes diagnostics harder, and creates a fragile intermediate format that is not actually produced by VS Code.

# Implementation Notes

- **IMP-001**: Add a shared `UsageSourceType` alias in `src/parser.ts` and use it in `SessionSummary` and `ParsedSessionFile` source fields.
- **IMP-002**: Add `parseUsageSessionFile(filePath: string): ParsedSessionFile | undefined` as the source-routing entrypoint while keeping `parseCopilotSessionFile` as a backward-compatible wrapper.
- **IMP-003**: Preserve existing aggregate semantics for `totalInputTokens`, `totalOutputTokens`, `totalCachedTokens`, `totalTokens`, `totalNanoAiu`, `modelTurnCount`, and `toolCallCount`.
- **IMP-004**: Normalize unavailable source fields to existing safe defaults and never throw during extension activation or session scanning for malformed files.
- **IMP-005**: Treat implementation success as: the same sidebar, participant tools, graph output, and optional server reporting can consume all supported source types.

# References

- **REF-001**: `../plan/feature-copilot-usage-sources-1.md` - implementation plan for Copilot CLI and local Copilot Agent source support.
- **REF-002**: `../../src/parser.ts` - existing summary schema, VS Code debug-log parser, and `chatSessions` fallback parser.
- **REF-003**: `../../src/extension.ts` - session discovery, picker, sidebar rendering, and spend aggregation entrypoints.
- **REF-004**: `../../src/participant.ts` - `@usage` participant and language model tools that consume session graphs.
- **REF-005**: `adr-0001-remote-session-retrieval.md` - related decision preserving local UI-side retrieval for user-storage artifacts.
