---
title: "ADR-0004: Source-Specific Parser Modules"
status: "Proposed"
date: "2026-06-11"
authors: "Copilot Usage maintainers; parser maintainers; extension maintainers"
tags: ["architecture", "decision", "parser", "normalization", "testing"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The current parser module contains the shared summary types and the logic for parsing VS Code Copilot Chat debug logs and `chatSessions` files. The implementation plan adds Copilot CLI and local Copilot Agent run parsing, each with likely source-specific shapes for messages, model usage, tool calls, timestamps, session IDs, and cost fields.

Keeping every parser in one file would make `src/parser.ts` responsible for shared domain types, source detection, schema-specific parsing, normalization, formatting utilities, prompt composition, and fallback behavior. That would increase coupling exactly where the feature needs independent schema evolution.

The parser architecture must satisfy these forces:

- **CTX-001**: Existing exports such as `parseEntries`, `parseChatSessionLog`, and `parseCopilotSessionFile` must remain stable for tests and runtime code.
- **CTX-002**: Source parsers must share coercion rules for timestamps, numbers, token fields, and AI-credit conversion.
- **CTX-003**: Source-specific parsing needs focused fixture coverage so schema changes are easy to isolate.
- **CTX-004**: Malformed source records must not throw through the extension activation path.
- **CTX-005**: The shared model must stay small enough for downstream code to reason about without understanding raw source schemas.

# Decision

The project will introduce source-specific parser modules for Copilot CLI and local Copilot Agent logs, with shared normalization helpers and a small source router in `src/parser.ts`.

The parser layout will be:

- **PAR-001**: `src/parser.ts` retains shared summary interfaces, existing VS Code parsers, formatting exports, and the public source-routing wrapper.
- **PAR-002**: `src/parser/copilotCliParser.ts` parses Copilot CLI usage logs into `SessionSummary`.
- **PAR-003**: `src/parser/copilotAgentParser.ts` parses local Copilot Agent run logs into `SessionSummary`.
- **PAR-004**: `src/parser/normalizers.ts` holds shared coercion and mapping helpers used by all source-specific parsers.

The router will identify candidate source type by path pattern and lightweight content sniffing, then delegate parsing to the appropriate module. Each parser will return `undefined` when the file is unsupported, empty, or unrecoverably malformed.

This decision was selected because it isolates source schema volatility while keeping the normalized `SessionSummary` contract stable for the rest of the extension.

# Consequences

## Positive

- **POS-001**: CLI and local agent schema changes can be handled in focused parser modules without risking unrelated VS Code parsing logic.
- **POS-002**: Shared normalizers reduce duplication for common parsing concerns such as number coercion, timestamp coercion, and AI-credit conversion.
- **POS-003**: Fixture tests can target each parser directly and also validate the router entrypoint.
- **POS-004**: `src/parser.ts` remains the compatibility boundary for existing runtime imports.
- **POS-005**: Future source parsers can be added with a repeatable module pattern.

## Negative

- **NEG-001**: More files and imports add module-organization overhead compared with a single parser file.
- **NEG-002**: Shared normalizers must avoid becoming a hidden dependency bucket with unclear ownership.
- **NEG-003**: Source routing by content sniffing can be ambiguous if multiple formats share similar JSON fields.
- **NEG-004**: Tests must verify both direct parser behavior and router behavior to avoid drift.

# Alternatives Considered

## Monolithic Parser File

- **ALT-001**: **Description**: Add all CLI and local agent parsing logic directly to `src/parser.ts`.
- **ALT-002**: **Rejection Reason**: This would make an already central file more difficult to review and would couple unrelated source schemas.

## Independent Parser Packages

- **ALT-003**: **Description**: Create separate npm packages or package-style directories for each source parser.
- **ALT-004**: **Rejection Reason**: This is heavier than the current repository needs and adds packaging complexity without immediate reuse outside the extension.

## Parser Classes with Inheritance

- **ALT-005**: **Description**: Define an abstract parser class and implement subclasses for VS Code, CLI, and agent sources.
- **ALT-006**: **Rejection Reason**: The existing codebase favors simple functions and interfaces; inheritance would add structure without solving a concrete complexity problem.

## Schema Conversion Before Parsing

- **ALT-007**: **Description**: Convert all source records into a shared intermediate event stream before building summaries.
- **ALT-008**: **Rejection Reason**: A future intermediate event model may become useful, but adding it now would expand scope beyond the current feature and duplicate much of the existing summary-building behavior.

# Implementation Notes

- **IMP-001**: Keep parser functions pure: they read input files, parse records, normalize data, and return summaries without side effects beyond local file reads.
- **IMP-002**: Export only the parser functions needed by `src/parser.ts`; do not expose source-internal helpers unless tests require stable direct access.
- **IMP-003**: Make `normalizers.ts` intentionally small and limited to reusable primitives such as `toFiniteNumber`, timestamp parsing, string coercion, token fallback, and source-label helpers.
- **IMP-004**: Add representative fixtures for successful records, missing usage fields, malformed JSONL lines, nested tool calls, and partial sessions.
- **IMP-005**: Validate that old parser tests pass unchanged before adding new fixture assertions.

# References

- **REF-001**: `../plan/feature-copilot-usage-sources-1.md` - Phase 1 and Phase 2 parser tasks.
- **REF-002**: `../../src/parser.ts` - current parser implementation and public exports.
- **REF-003**: `../../test/parser.test.js` - existing parser regression tests.
- **REF-004**: `../../test/fixtures/sample-debug.jsonl` - existing debug-log fixture.
- **REF-005**: `../../test/fixtures/sample-chat-session.jsonl` - existing `chatSessions` fixture.
- **REF-006**: `adr-0003-multi-source-usage-ingestion.md` - parent decision for first-class multi-source ingestion.
