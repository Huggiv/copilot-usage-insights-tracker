---
title: "ADR-0006: Source-Aware Reporting and Analytics"
status: "Proposed"
date: "2026-06-11"
authors: "Copilot Usage maintainers; backend maintainers; dashboard users; usage analytics stakeholders"
tags: ["architecture", "decision", "reporting", "analytics", "server"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The extension can optionally report parsed session summaries and model usage rows to the server dashboard. The current reporter sends aggregate fields and a `raw_payload` object with extension source metadata. The planned feature adds usage from Copilot CLI and local Copilot Agent runs, which means downstream analytics must be able to distinguish usage origin without requiring new raw log uploads or breaking existing server API behavior.

The `@usage` participant and graph utilities also consume normalized session data. If source provenance is lost, users may incorrectly interpret CLI or agent usage as VS Code chat usage, and server dashboard users may be unable to separate editor, CLI, and agent cost trends.

The key forces are:

- **CTX-001**: Existing server endpoints should continue accepting current payloads from released extension versions.
- **CTX-002**: Multi-source usage must remain aggregatable by user, day, model, request count, tokens, and AI credits.
- **CTX-003**: Source category is important metadata for analysis but should not require raw transcript or tool-argument transmission.
- **CTX-004**: The `@usage` participant should expose source provenance in search results and session graphs.
- **CTX-005**: Backend changes should be additive and tolerant where possible.

# Decision

Reporting and analytics will become source-aware through additive metadata while preserving existing aggregate payload semantics.

The extension will map parser source types into stable reporting categories:

- **MAP-001**: `debugLog` and `chatSession` map to `vscode`.
- **MAP-002**: `copilotCli` maps to `copilot_cli`.
- **MAP-003**: `copilotAgent` maps to `copilot_agent`.

The reporter will include the category in `SessionPayload.raw_payload.source_category` while keeping existing session and model usage fields unchanged. Model usage aggregation will remain source-agnostic by default so current model tables continue to work, but graph output and participant responses will include source type so source-aware analysis is possible.

This decision was selected because it adds provenance where users and downstream systems need it without forcing a breaking server contract or exposing raw source logs.

# Consequences

## Positive

- **POS-001**: Existing server dashboards can continue using current aggregate fields without understanding every source-specific parser detail.
- **POS-002**: Source provenance becomes available for future dashboard filters, source breakdowns, and operational diagnostics.
- **POS-003**: The extension preserves its privacy posture because only aggregate source category metadata is added to optional reporting.
- **POS-004**: `@usage` answers can distinguish patterns across VS Code, CLI, and local agent usage.
- **POS-005**: Backward compatibility is maintained for older payload consumers that ignore unknown `raw_payload` fields.

## Negative

- **NEG-001**: If the backend schema is strict, even additive fields may require schema and test updates before rollout.
- **NEG-002**: Source-agnostic model aggregation may not be sufficient for every dashboard question until source filters are added server-side.
- **NEG-003**: Mapping `debugLog` and `chatSession` into a single `vscode` reporting category hides the parser fallback distinction in server aggregates.
- **NEG-004**: Graph and participant output must be updated carefully so source labels improve clarity without cluttering responses.

# Alternatives Considered

## Keep Reporting Source-Agnostic

- **ALT-001**: **Description**: Continue reporting only aggregate totals and omit any source category from extension payloads.
- **ALT-002**: **Rejection Reason**: This prevents users and dashboard consumers from distinguishing editor, CLI, and agent usage after multi-source ingestion is introduced.

## Add Separate Server Endpoints Per Source

- **ALT-003**: **Description**: Create dedicated ingestion APIs for VS Code, CLI, and local agent usage.
- **ALT-004**: **Rejection Reason**: Separate endpoints duplicate API behavior and make client/reporting evolution harder than an additive source-category field.

## Include Raw Source Payloads in Server Reports

- **ALT-005**: **Description**: Send raw CLI or agent records to the server so the dashboard can derive source-aware analytics later.
- **ALT-006**: **Rejection Reason**: This conflicts with the local-first privacy model and exposes more data than needed for aggregate usage analytics.

## Make Model Usage Buckets Source-Specific Immediately

- **ALT-007**: **Description**: Change model usage aggregation keys from day+user+model to day+user+model+source.
- **ALT-008**: **Rejection Reason**: This is useful future dashboard functionality, but changing aggregation semantics immediately risks breaking existing reports and should be staged after source metadata is captured.

# Implementation Notes

- **IMP-001**: Add a small source-category mapper in `src/reporter.ts` or a shared utility consumed by reporter and graph code.
- **IMP-002**: Extend `SessionPayload.raw_payload` with optional `source_category` and keep `source` and `source_type` unchanged.
- **IMP-003**: Update `src/graph.ts` stats and markdown output to include source type or source label for each session graph.
- **IMP-004**: Update `src/participant.ts` tool responses so `usage-search-sessions` includes source in result rows and `usage-get-graph` includes source in graph metadata.
- **IMP-005**: Add backend tolerance tests if the FastAPI schema rejects unknown `raw_payload` properties or if source category is persisted later.
- **IMP-006**: Treat success as: existing server reporting still works, new source labels appear in local analytics, and optional source category metadata is available to the server.

# References

- **REF-001**: `../plan/feature-copilot-usage-sources-1.md` - Phase 4 source-aware analytics and reporting tasks.
- **REF-002**: `../../src/reporter.ts` - extension-to-server session and model usage payload construction.
- **REF-003**: `../../src/graph.ts` - graph transformation and markdown serialization.
- **REF-004**: `../../src/participant.ts` - `@usage` participant search and graph tools.
- **REF-005**: `../../server/backend/app/schemas.py` - backend API schemas for incoming payloads.
- **REF-006**: `../../server/backend/tests/test_api.py` - backend API compatibility tests.
- **REF-007**: `adr-0003-multi-source-usage-ingestion.md` - parent decision for the normalized multi-source model.