# OpenClaw Enterprise -- Architecture Decision Records

This page indexes all Architecture Decision Records (ADRs) for OpenClaw Enterprise. ADRs capture significant architectural decisions, their context, rationale, alternatives considered, and consequences.

All ADRs were ratified on 2026-03-13 as part of the initial architecture design.

---

## ADR Index

| ADR | Title | Status | Summary |
|-----|-------|--------|---------|
| [001](./001-opa-over-cedar.md) | OPA Over Cedar for Policy Evaluation | Accepted | Use Open Policy Agent with Rego instead of Cedar. OPA provides a broader Kubernetes ecosystem, sidecar deployment pattern, CNCF graduated project status, and mature tooling. |
| [002](./002-multi-gateway-tenancy.md) | Multi-Gateway Approach for Multi-Tenancy | Accepted | Deploy one OpenClaw Gateway per tenant managed by a Kubernetes operator instead of session isolation within a single gateway. Provides strongest isolation, independent scaling, and simpler failure domains. |
| [003](./003-plugin-per-capability.md) | One Plugin Per Enterprise Capability | Accepted | Structure the project as one plugin per capability (15 plugins) rather than a monolithic enterprise plugin. Aligns with the Plugin + Skill Pairs principle, enables independent testing and deployment, and provides a clear dependency graph. |
| [004](./004-multi-signal-task-correlation.md) | Multi-Signal Task Correlation with Confidence Scoring | Accepted | Use multi-signal deduplication (title similarity, entity references, temporal proximity, participant overlap) with weighted confidence scoring and three-tier thresholds for auto-merge, human review, and separation. |
| [005](./005-three-layer-classification.md) | Three-Layer Data Classification | Accepted | Implement a three-layer classification system: connector defaults, AI upgrade-only reclassification, and admin override. Balances cost, accuracy, and human authority over classification decisions. |
| [006](./006-append-only-audit.md) | Append-Only Audit Logging | Accepted | Use PostgreSQL append-only tables partitioned by month in a separate database. UPDATE and DELETE are blocked by triggers. GDPR compliance via anonymization, not deletion. 1-year minimum retention. |
| [007](./007-ocip-via-sessions-send.md) | OCIP via sessions_send Annotations | Accepted | Implement the OpenClaw Interchange Protocol as structured annotations on existing sessions_send messages rather than a custom transport. Follows the upstream-first principle with graceful fallback. |
| [008](./008-d3-canvas-visualization.md) | D3.js Visualization via Canvas A2UI | Accepted | Use D3.js rendered through OpenClaw's Canvas A2UI pattern for interactive visualizations. No additional frontend framework required. Produces interactive HTML/CSS/JS/SVG assets. |

---

## ADR Format

Each ADR follows a standard format:

- **Status**: Accepted, Deprecated, or Superseded
- **Date**: Decision date
- **Context**: Problem statement and forces at play
- **Decision**: What was decided
- **Rationale**: Why this decision was made
- **Alternatives Considered**: Other options that were evaluated
- **Consequences**: What becomes easier and what becomes more difficult

---

## Source

Original ADR files are located at `docs/adr/` in the project root. The reference pages in this section provide the same content in a navigable format.
