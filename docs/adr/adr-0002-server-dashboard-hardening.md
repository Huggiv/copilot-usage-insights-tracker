---
title: "ADR-0002: Production Hardening Strategy for Server-Side Collector Dashboard"
status: "Proposed"
date: "2026-06-11"
authors: "Copilot Usage maintainers; backend maintainers; frontend maintainers; operations stakeholders"
tags: ["architecture", "decision", "backend", "dashboard", "security", "operations"]
supersedes: ""
superseded_by: ""
---

# Status

Proposed

# Context

The repository includes a server stack with a FastAPI backend collector and a React dashboard used to ingest and visualize Copilot usage telemetry. The stack is functional for local workflows but has production readiness gaps identified in Epic #1 and child issues #2 through #7.

The key forces driving this decision are:

- Security requirements for shared environments where open ingestion endpoints and permissive CORS are unacceptable.
- Data correctness and operability requirements, including deterministic schema evolution, reliable date filtering, and explicit API behavior at larger data volumes.
- Performance requirements for batch ingestion and list queries as telemetry volume grows.
- Reliability and supportability requirements for structured observability, health/readiness behavior, and CI-backed regression protection.

Constraints include preserving the current product scope (no full IAM redesign, no database engine replacement in this phase, no frontend redesign) while keeping compatibility for existing local usage patterns.

# Decision

The project will implement a phased production-hardening architecture for the server-side collector dashboard, with one coordinated Epic and six focused workstreams:

1. Secure API access and CORS hardening for collector endpoints.
2. Explicit data model normalization and migration workflow.
3. Efficient and idempotent batch ingestion semantics.
4. Stable query contracts with pagination and explicit all-time behavior.
5. Operational observability, readiness, and runtime configuration guidance.
6. Backend test coverage and CI quality gates for critical API paths.

This strategy is selected because it reduces operational and security risk without expanding scope into a full platform rewrite. It also aligns implementation sequencing to deliver user-facing stability quickly while enabling safe incremental rollout.

# Consequences

## Positive

- **POS-001**: Security posture is improved by requiring authenticated write access and controlled cross-origin policies.
- **POS-002**: API behavior becomes more predictable through explicit pagination and filter semantics.
- **POS-003**: Data quality improves through standardized timestamp handling and migration discipline.
- **POS-004**: Ingestion throughput and scalability improve with transaction-efficient batch processing and idempotent behavior.
- **POS-005**: Operational troubleshooting is faster due to structured logs, metrics, and health/readiness checks.

## Negative

- **NEG-001**: Implementation complexity increases because security, migrations, query contracts, and CI changes must be coordinated.
- **NEG-002**: Some API and behavior changes may require compatibility handling for existing local clients.
- **NEG-003**: Development velocity may slow temporarily while tests and quality gates are introduced.
- **NEG-004**: Additional runtime configuration (auth, CORS, limits, logging) increases deployment and documentation overhead.
- **NEG-005**: Incremental migrations require careful rollout to avoid breaking previously created local SQLite datasets.

# Alternatives Considered

## Keep current local-first implementation unchanged

- **ALT-001**: **Description**: Continue with the current backend and dashboard behavior with minimal fixes only.
- **ALT-002**: **Rejection Reason**: This leaves known security, scalability, and operability risks unresolved and does not satisfy the accepted issue scope.

## Full platform rewrite in one step

- **ALT-003**: **Description**: Replace backend architecture, database strategy, and frontend contract in a single major redesign.
- **ALT-004**: **Rejection Reason**: This exceeds current scope and timeline, introduces high migration risk, and delays immediate risk reduction.

## Security-only hardening without contract and quality improvements

- **ALT-005**: **Description**: Implement authentication and CORS controls only, deferring data/query/test/ops improvements.
- **ALT-006**: **Rejection Reason**: This addresses only a subset of failure modes and leaves data correctness, performance, and regression risks unmitigated.

## Move immediately to managed cloud services and multi-tenant IAM

- **ALT-007**: **Description**: Introduce full cloud-managed identity, managed database services, and tenant isolation in this phase.
- **ALT-008**: **Rejection Reason**: Valuable long-term direction, but explicitly out of scope for the current Epic and would block near-term stabilization goals.

# Implementation Notes

- **IMP-001**: Implement changes as six independently deliverable issue tracks (#2 to #7) under Epic #1, with cross-track review for API compatibility.
- **IMP-002**: Roll out schema and API contract changes with migration notes and backward-compatibility checks against existing local data files.
- **IMP-003**: Define a minimal production profile (auth required, explicit CORS allowlist, limits enabled, structured logging enabled) and document it in server runbooks.
- **IMP-004**: Add CI gates that include backend test execution and lint checks before merge.
- **IMP-005**: Validate success with end-to-end smoke tests in Docker Compose: ingest sample payloads, verify summary/list/model APIs, and confirm dashboard rendering.

# References

- **REF-001**: [Epic #1: Productionize server-side collector dashboard](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/1)
- **REF-002**: [Issue #2: API security and CORS hardening](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/2)
- **REF-003**: [Issue #3: Data model normalization and migration strategy](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/3)
- **REF-004**: [Issue #4: Batch ingestion performance and idempotency](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/4)
- **REF-005**: [Issue #5: Query contract improvements](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/5)
- **REF-006**: [Issue #6: Observability and operational readiness](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/6)
- **REF-007**: [Issue #7: Backend tests and CI quality gates](https://github.com/Huggiv/copilot-usage-insights-tracker/issues/7)
- **REF-008**: [server/backend/app/main.py](server/backend/app/main.py)
- **REF-009**: [server/backend/app/models.py](server/backend/app/models.py)
- **REF-010**: [server/frontend/src/App.jsx](server/frontend/src/App.jsx)
- **REF-011**: [server/README.md](server/README.md)