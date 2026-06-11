---
goal: Extend Copilot Usage Insights Tracker to ingest and report local Copilot CLI and Copilot Agent usage alongside existing VS Code chat usage
version: 1.0
date_created: 2026-06-11
last_updated: 2026-06-11
owner: Copilot Usage Insights Tracker Maintainers
status: Planned
tags: [feature, architecture, parser, telemetry, testing]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan defines the exact implementation steps to add two additional local usage sources to the extension: Copilot CLI sessions and locally executed Copilot Agent sessions. The resulting system must normalize all three sources (VS Code chat, CLI, and local agent) into one session model so the existing tree view, @usage participant, and optional server reporting can present complete per-user usage.

## 1. Requirements & Constraints

- **REQ-001**: Add first-class source support for Copilot CLI usage files from the local machine.
- **REQ-002**: Add first-class source support for local Copilot Agent run usage files from the local machine.
- **REQ-003**: Preserve existing behavior for VS Code sources currently parsed by `parseCopilotSessionFile` in `src/parser.ts`.
- **REQ-004**: Normalize all sources into `SessionSummary`, `UserMessageSummary`, `ModelTurnSummary`, and `ToolCallSummary` so downstream consumers remain stable.
- **REQ-005**: Expose source provenance in UI and graph output so users can distinguish `vscode`, `copilot-cli`, and `copilot-agent` sessions.
- **REQ-006**: Ensure optional server reporting (`src/reporter.ts`) includes source category without breaking existing API payload compatibility.
- **REQ-007**: Extend search/discovery logic in `src/extension.ts` to scan configurable paths for CLI/agent logs in addition to workspaceStorage debug logs/chat sessions.
- **REQ-008**: Keep parsing fail-soft: malformed or partial source files must be skipped with diagnostics and must not break the extension activation path.
- **REQ-009**: Add deterministic unit tests for source detection, parsing, normalization, and aggregation.
- **SEC-001**: Continue local-only file access model; do not transmit raw transcript/tool arguments to server endpoints.
- **SEC-002**: Do not execute shell commands from parsed logs; parser remains pure read/transform logic.
- **CON-001**: Do not remove or rename existing command IDs in `package.json` (`copilotUsageTracker.analyzeSession`, `copilotUsageTracker.pickSession`, `copilotUsageTracker.refresh`).
- **CON-002**: Maintain compatibility with current extension engine target in `package.json` (`vscode` ^1.101.0).
- **CON-003**: Avoid breaking existing parser exports used by tests and extension runtime (`parseEntries`, `parseChatSessionLog`, `parseCopilotSessionFile`).
- **GUD-001**: Introduce source-specific parsers as separate modules and keep `src/parser.ts` focused on shared schema/types and source router logic.
- **GUD-002**: Add new configuration settings under the existing `copilotUsageTracker` namespace only.
- **PAT-001**: Use additive schema evolution: add fields/union values without changing existing field semantics.
- **PAT-002**: Prefer pure functions for parser logic and deterministic fixture-based tests.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Define canonical multi-source schema and source routing contract without regression to existing VS Code parsing.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| TASK-001 | Update `src/parser.ts` type unions: extend `SessionSummary.sourceType` and `ParsedSessionFile.sourceType` from `'debugLog' | 'chatSession'` to `'debugLog' | 'chatSession' | 'copilotCli' | 'copilotAgent'`. |  |  |
| TASK-002 | Add new exported discriminated source enum/type alias `UsageSourceType` in `src/parser.ts` and refactor internal signatures to consume this alias. |  |  |
| TASK-003 | Introduce `parseUsageSessionFile(filePath: string): ParsedSessionFile | undefined` in `src/parser.ts` as the new routing entrypoint; keep `parseCopilotSessionFile` as backward-compatible wrapper calling the new router. |  |  |
| TASK-004 | Add parser-level completion criteria assertions in tests: all legacy fixtures still parse with identical totals for `totalTokens`, `totalNanoAiu`, and `toolCallCount`. |  |  |

Completion criteria for Phase 1:
- `npm test` passes with no behavior change for current fixtures in `test/fixtures/sample-debug.jsonl` and `test/fixtures/sample-chat-session.jsonl`.
- TypeScript compile succeeds with new source type unions and no unresolved references.

### Implementation Phase 2

- GOAL-002: Implement source-specific parsers for Copilot CLI and local Copilot Agent run logs and normalize into existing summary model.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-005 | Create `src/parser/copilotCliParser.ts` implementing `parseCopilotCliLog(filePath: string): SessionSummary | undefined`, including model token extraction, usage/cost extraction, and tool/action mapping into `ToolCallSummary`. |  |  |
| TASK-006 | Create `src/parser/copilotAgentParser.ts` implementing `parseCopilotAgentLog(filePath: string): SessionSummary | undefined`, supporting multi-turn agent runs and nested tool invocations where present. |  |  |
| TASK-007 | Add shared mapper utilities in `src/parser/normalizers.ts` for timestamp coercion, token fallback, and AI-credit conversion reuse across all parser modules. |  |  |
| TASK-008 | In `src/parser.ts`, route files by filename/path pattern and optional lightweight content sniffing to one of: existing debug parser, existing chatSession parser, new CLI parser, or new agent parser. |  |  |
| TASK-009 | Add source fixture files: `test/fixtures/sample-copilot-cli.jsonl` and `test/fixtures/sample-copilot-agent.jsonl` with representative success and edge-case records. |  |  |

Completion criteria for Phase 2:
- Parsing both new fixture types returns non-empty `userMessages` and correct aggregate totals.
- Invalid records in fixtures are skipped without throwing.

### Implementation Phase 3

- GOAL-003: Extend discovery/scanning and session candidate resolution to include local CLI and agent log roots.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-010 | In `src/extension.ts`, add discovery helpers `collectCopilotCliLogDirs` and `collectCopilotAgentLogDirs` mirroring existing recursive collectors (`collectDebugLogDirs`, `collectChatSessionDirs`). |  |  |
| TASK-011 | Extend candidate model (`SessionCandidate`) in `src/extension.ts` with `sourceType` and optional `sourceFile` so each candidate explicitly identifies origin. |  |  |
| TASK-012 | Add new configuration keys in `package.json`: `copilotUsageTracker.cliSearchRoots` and `copilotUsageTracker.agentSearchRoots` (array of absolute paths), plus docs text for expected folder patterns. |  |  |
| TASK-013 | Update scan pipeline in `src/extension.ts` to merge candidates from all enabled roots and de-duplicate by canonical `(sourceType, sessionId, modifiedTime)` key. |  |  |
| TASK-014 | Maintain existing recency and paging behavior (`INITIAL_PICK_DAYS`, `PICK_LOAD_MORE_DAYS`) across mixed sources when building pick lists. |  |  |

Completion criteria for Phase 3:
- Session picker command (`copilotUsageTracker.pickSession`) lists sessions from VS Code, CLI, and agent logs when fixtures are placed in configured roots.
- No duplicate rows for the same source session.

### Implementation Phase 4

- GOAL-004: Surface source-aware analytics in UI tree, graph/participant outputs, and server payloads.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-015 | Update display nodes in `src/extension.ts` tree provider to include source badge/label per session (for example: `VS Code`, `CLI`, `Agent`). |  |  |
| TASK-016 | Update graph serialization in `src/graph.ts` to include source type in graph stats and rendered markdown sections used by `@usage`. |  |  |
| TASK-017 | Update participant tool responses in `src/participant.ts` so `usage-search-sessions` and `usage-get-graph` include source information in returned metadata/text. |  |  |
| TASK-018 | Extend `SessionPayload.raw_payload` in `src/reporter.ts` to include `source_category` (`vscode`, `copilot_cli`, `copilot_agent`) while keeping existing fields unchanged for backward compatibility. |  |  |
| TASK-019 | Ensure model-usage aggregation in `buildModelUsagePayloads` remains source-agnostic and continues to bucket by day+user+model after parser changes. |  |  |

Completion criteria for Phase 4:
- Source appears in sidebar session list and `@usage` analysis output.
- Server payloads remain accepted by backend API with new optional source category field.

### Implementation Phase 5

- GOAL-005: Complete verification, documentation, and release readiness for multi-source support.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-020 | Expand `test/parser.test.js` with deterministic tests for `parseUsageSessionFile` routing and both new source fixtures, including malformed-entry resilience checks. |  |  |
| TASK-021 | Add extension-level behavior tests (new file `test/extension.multisource.test.js`) for candidate scanning and session picker ordering across source types. |  |  |
| TASK-022 | Update user docs in `README.md` with setup instructions for CLI/agent log path configuration and explicit privacy note for additional scanned paths. |  |  |
| TASK-023 | Update maintainer docs in `Developer.md` with fixture generation instructions for CLI/agent sample logs and debug workflow. |  |  |
| TASK-024 | Add release notes entry in `CHANGELOG.md` describing new source support, config keys, and backward compatibility behavior. |  |  |

Completion criteria for Phase 5:
- `npm run compile` and `npm test` pass on Linux.
- README and changelog fully document new functionality and configuration keys.

## 3. Alternatives

- **ALT-001**: Convert CLI and agent logs into VS Code debug-log format before parsing. Rejected because it introduces unnecessary transformation complexity and hides source-specific semantics.
- **ALT-002**: Build one monolithic parser in `src/parser.ts` for all source formats. Rejected because it increases maintenance risk and reduces testability.
- **ALT-003**: Ingest only aggregate numeric usage from CLI/agent logs and ignore per-message/tool details. Rejected because it would degrade value of existing session-level and tool-level insights.
- **ALT-004**: Send raw logs to server and parse centrally. Rejected because it violates current local-first privacy model.

## 4. Dependencies

- **DEP-001**: Existing parser exports and shared summary interfaces in `src/parser.ts`.
- **DEP-002**: Existing extension scanning and picker flow in `src/extension.ts`.
- **DEP-003**: Existing graph transformation utilities in `src/graph.ts`.
- **DEP-004**: Existing chat participant tools `usage-search-sessions` and `usage-get-graph` in `src/participant.ts`.
- **DEP-005**: Existing server reporting payload contracts in `src/reporter.ts` and backend API acceptance in `server/backend/app/schemas.py` and `server/backend/tests/test_api.py`.

## 5. Files

- **FILE-001**: `src/parser.ts` - extend source types, add routing entrypoint, preserve backward compatibility wrapper.
- **FILE-002**: `src/parser/copilotCliParser.ts` - new parser for Copilot CLI local usage logs.
- **FILE-003**: `src/parser/copilotAgentParser.ts` - new parser for local Copilot Agent run logs.
- **FILE-004**: `src/parser/normalizers.ts` - shared parser normalization helpers.
- **FILE-005**: `src/extension.ts` - multi-source discovery, candidate typing, session picker integration, source labels.
- **FILE-006**: `src/graph.ts` - include source metadata in graph output.
- **FILE-007**: `src/participant.ts` - source-aware tool responses for `@usage` participant tools.
- **FILE-008**: `src/reporter.ts` - optional source category field in outgoing payload.
- **FILE-009**: `package.json` - new configuration keys for CLI and agent search roots.
- **FILE-010**: `test/fixtures/sample-copilot-cli.jsonl` - new fixture file.
- **FILE-011**: `test/fixtures/sample-copilot-agent.jsonl` - new fixture file.
- **FILE-012**: `test/parser.test.js` - expanded parser routing and resilience tests.
- **FILE-013**: `test/extension.multisource.test.js` - new extension scanning/picker tests.
- **FILE-014**: `README.md` - user documentation for new source support and configuration.
- **FILE-015**: `Developer.md` - maintainer guidance for parser fixtures and verification.
- **FILE-016**: `CHANGELOG.md` - release notes for feature introduction.

## 6. Testing

- **TEST-001**: Verify `parseUsageSessionFile` routes each fixture type (`sample-debug.jsonl`, `sample-chat-session.jsonl`, `sample-copilot-cli.jsonl`, `sample-copilot-agent.jsonl`) to expected `sourceType`.
- **TEST-002**: Verify aggregate totals (`totalInputTokens`, `totalOutputTokens`, `totalCachedTokens`, `totalNanoAiu`, `toolCallCount`) are deterministic for each fixture.
- **TEST-003**: Verify malformed records in CLI/agent fixtures are ignored without throw and do not zero valid totals.
- **TEST-004**: Verify session candidate de-duplication key prevents duplicate picker entries for repeated scans.
- **TEST-005**: Verify picker ordering remains descending by modified time across mixed source types.
- **TEST-006**: Verify graph output includes source type and remains consumable by `usage-get-graph` tool.
- **TEST-007**: Verify `usage-search-sessions` output includes source metadata for every returned session.
- **TEST-008**: Verify reporter payload includes optional `source_category` while preserving existing required fields.
- **TEST-009**: Run `npm run compile` and `npm test` as release gate.

## 7. Risks & Assumptions

- **RISK-001**: Copilot CLI and local agent log schemas may change without notice and break parser assumptions.
- **RISK-002**: Path discovery could increase scan time on large configured roots if recursion is not bounded.
- **RISK-003**: Session ID collisions across source types may occur if IDs are not source-qualified during de-duplication.
- **RISK-004**: Backend schema may reject unknown fields if not tolerant to additive payload properties.
- **ASSUMPTION-001**: CLI and local agent logs are accessible as local files with stable timestamps and parseable JSON/JSONL.
- **ASSUMPTION-002**: Existing `SessionSummary` model is sufficient to represent CLI and agent usage with no mandatory schema redesign.
- **ASSUMPTION-003**: Users can provide explicit path roots for CLI/agent logs through extension settings when defaults are unavailable.

## 8. Related Specifications / Further Reading

- `docs/project-summary.md`
- `docs/adr/adr-0001-remote-session-retrieval.md`
- `README.md`
- GitHub Copilot billing docs: https://docs.github.com/en/billing/concepts/product-billing/github-copilot-billing