# Research: OpenClaw Enterprise Platform

**Date**: 2026-03-13
**Feature**: 001-enterprise-ai-platform

## R1: OPA vs Cedar for Policy Evaluation

**Decision**: OPA (Open Policy Agent) with Rego policies

**Rationale**:
- OPA is the de facto standard for cloud-native policy evaluation with broad enterprise adoption (CNCF graduated project)
- Rego language handles complex hierarchical policy resolution natively
- Runs as a lightweight sidecar (daemon mode) with sub-millisecond evaluation
- REST API for policy queries from TypeScript plugins — no FFI needed
- Built-in policy testing framework (`opa test`)
- Cedar is newer and simpler but lacks the ecosystem maturity and tooling for hierarchical multi-domain policy evaluation
- OPA's bundle system supports hot-reload of policy bundles — aligns with FR-006 (60s reload requirement)

**Alternatives considered**:
- Cedar (AWS): Simpler language, formal verification, but less ecosystem support for complex hierarchies; no CNCF governance
- Custom TypeScript evaluator: Violates constitution principle II (Policy Over Code — "No policy logic lives in TypeScript")
- Casbin: Good for RBAC but not designed for the multi-domain policy evaluation needed (models, actions, integrations, agent-to-agent, features, data, audit)

## R2: OpenClaw Plugin Integration Points

**Decision**: Use all six plugin API hooks as mapped below

**Rationale**: Deep research of OpenClaw's plugin system reveals exact integration points for each enterprise capability:

| Plugin API | Enterprise Use | Plugin(s) |
|---|---|---|
| `api.registerHook('before_model_resolve')` | Enforce model policies, route by data classification | policy-engine |
| `api.registerHook('before_prompt_build')` | Inject classification labels, filter sensitive context | policy-engine |
| `api.registerTool()` | Expose connector tools (email_read, jira_update, etc.) | All connectors, task-intelligence, auto-response, work-tracking, visualization |
| `api.registerService()` | Background services (inbox polling, calendar sync, webhook listeners, doc monitoring) | All connectors, org-intelligence |
| `api.registerHttpRoute()` | Admin API (/api/v1/...), webhook receivers (/hooks/github, /hooks/jira) | audit-enterprise, auth-enterprise, connector-jira, connector-github |
| `api.registerGatewayMethod()` | Policy CRUD RPC, OCIP protocol methods, audit query RPC | policy-engine, ocip-protocol, audit-enterprise |
| `api.registerCommand()` | /briefing, /auto, /status commands | task-intelligence, auto-response |
| `api.registerContextEngine()` | Classification-aware context filtering (future scope) | (deferred to post-MVP) |

**Alternatives considered**:
- Forking OpenClaw core: Violates constitution non-negotiable #1
- Building a standalone service alongside OpenClaw: Loses access to agent tools, session management, and messaging channels

## R3: Multi-Tenancy Architecture

**Decision**: Multi-gateway approach — one OpenClaw Gateway instance per tenant, managed by K8s operator

**Rationale**:
- OpenClaw's trust model is explicitly single-operator — deep session isolation within a single gateway would require invasive upstream changes
- Multi-gateway provides complete data isolation at the infrastructure level
- K8s operator manages lifecycle: one OpenClawInstance CRD per tenant, operator reconciles to Deployment + Service + ConfigMap
- OPA sidecar per gateway instance for tenant-scoped policy evaluation
- PostgreSQL schemas or databases per tenant for data isolation
- Scales to 500 users per deployment (multiple gateways across the deployment)
- Shared infrastructure (PostgreSQL cluster, Redis cluster, OPA bundle server) reduces overhead

**Alternatives considered**:
- Single gateway with session isolation: Requires upstream core changes to OpenClaw's session model; violates Upstream First
- Per-user gateway instances: Resource-intensive (one pod per user); viable for highest-security environments but not the default
- Namespace-per-tenant in K8s: Excessive overhead for K8s control plane at scale

## R4: Connector OAuth Token Management

**Decision**: K8s Secrets with Sealed Secrets for GitOps; optional HashiCorp Vault integration for enterprises requiring centralized secrets management

**Rationale**:
- K8s Secrets is the minimum viable approach — aligns with "boring technology" principle
- Sealed Secrets (Bitnami) enables GitOps workflow for token provisioning
- Vault integration as optional overlay for enterprises with existing Vault infrastructure
- Connector plugins read tokens from K8s Secrets via environment variables or mounted volumes
- Token refresh handled by each connector's background service (registerService)
- Never stored in config files (constitution mandate)

**Alternatives considered**:
- Config file storage: Violates constitution security rules
- AWS Secrets Manager / GCP Secret Manager: Cloud-specific; conflicts with self-hosted-first identity
- Custom secrets service: Over-engineering; K8s already has secrets management

## R5: Task Deduplication and Correlation Strategy

**Decision**: Multi-signal correlation with confidence scoring

**Rationale**:
- Cross-system deduplication is a core differentiator (FR-014, SC-003)
- Correlation uses multiple signals: Jira ticket keys in branch names/PR descriptions, email subject matching, Slack thread references, URL matching, temporal proximity
- Each correlation produces a confidence score (0-1); above 0.8 = auto-merge with single task view; 0.5-0.8 = "possibly related" indicator; below 0.5 = separate tasks
- False-positive rate target: <5% (SC-003)
- Edge case from spec: ambiguous duplicates show both with "possibly related" indicator rather than silently merging

**Alternatives considered**:
- Exact key matching only: Too brittle — misses Slack/email references that don't contain ticket keys
- LLM-based semantic matching: Expensive per invocation at scale; not needed when structural signals (ticket keys, URLs) are available
- Manual linking: Defeats the purpose of automated task discovery

## R6: Data Classification Pipeline

**Decision**: Three-layer classification: per-connector defaults → AI reclassification → admin override

**Rationale**:
- Per-connector defaults provide a safe baseline without manual overhead:
  - Gmail: "internal" (default for business email)
  - GCal: "internal"
  - Jira: "internal"
  - GitHub (private repos): "internal"; (public repos): "public"
  - GDrive: "internal"
- AI reclassification scans extracted content for sensitive patterns (PII, financial data, customer data, source code with secrets) and upgrades classification when detected
- Admin override allows manual classification of specific data sources, channels, or document types
- Classification metadata is attached to every data object and propagated through all processing (FR-009)
- Unknown classification defaults to "restricted" (highest level) — fail closed (constitution)

**Alternatives considered**:
- Manual-only classification: Doesn't scale; users won't classify every email
- AI-only classification: Risk of misclassification; per-connector defaults are safer as a baseline
- No reclassification (defaults only): Misses sensitive content in "internal" default sources

## R7: Audit Log Architecture

**Decision**: PostgreSQL append-only table with partitioning by month; separate from application database

**Rationale**:
- PostgreSQL meets the "boring technology" principle
- Append-only enforced by application-level insert-only permissions (no UPDATE/DELETE grants)
- Partitioning by month enables efficient retention management and query performance
- Separate database/connection from application data (constitution mandate)
- Indexes on: user_id, timestamp, action_type, policy_applied for <10s query time (SC-007)
- At 500 users with ~100 actions/day each = ~50K entries/day = ~18M/year — well within PostgreSQL capacity
- Minimum 1-year retention (constitution), configurable via policy

**Alternatives considered**:
- Elasticsearch: Better for full-text search but adds operational complexity; PostgreSQL with proper indexes is sufficient at this scale
- Dedicated audit service (e.g., AuditBoard): External dependency; conflicts with self-hosted-first
- Blockchain/immutable ledger: Over-engineering for the scale; append-only table with proper access controls achieves the same immutability guarantee

## R8: OCIP Protocol Transport

**Decision**: Extend OpenClaw's existing `sessions_send` with OCIP metadata in message annotations

**Rationale**:
- OpenClaw already has `sessions_send` for inter-session messaging with `reply-back` and `announce` toggles
- OCIP metadata (version, messageType, sourceAgent, classification, exchangeRound, maxRounds, capabilities, replyPolicy) is injected as structured annotations on the message
- The ocip-protocol plugin uses `registerHook()` to intercept `sessions_send` calls and inject/detect OCIP metadata
- No upstream protocol changes needed — metadata is carried in the existing message structure's extensible fields
- If upstream lacks sufficient extensibility in message annotations, we propose an enhancement (tracked in upstream contributions document)

**Alternatives considered**:
- Custom WebSocket channel for OCIP: Adds complexity; loses integration with OpenClaw's session management
- Separate REST API between agents: Bypasses OpenClaw's audit and session infrastructure
- gRPC between agent instances: Over-engineering for the round-count-limited exchanges we support

## R9: Visualization Rendering via Canvas

**Decision**: HTML + D3.js rendered through OpenClaw Canvas using the A2UI pattern

**Rationale**:
- Canvas already supports presenting arbitrary HTML, running JavaScript via `eval`, and capturing snapshots
- A2UI pattern (present → eval → snapshot) is exactly what we need for interactive visualizations
- D3.js for task dependency graphs, mind maps, and Eisenhower matrices
- HTML templates stored in plugin assets/ directory, data injected at render time
- Live reload during development via Canvas's built-in dev mode
- No custom frontend framework needed — standard HTML/CSS/JS

**Alternatives considered**:
- React-based admin UI: Adds a separate frontend application; Canvas is already available and integrated
- Server-side rendered images: Loses interactivity (clicking nodes, expanding branches)
- Mermaid diagrams: Too limited for interactive, data-rich visualizations

## R10: Testing Strategy

**Decision**: Three-tier testing aligned with constitution quality requirements

**Rationale**:
- **Unit tests (Vitest)**: >80% coverage per plugin (constitution mandate). Test individual modules (policy evaluator, classifier, correlation engine) in isolation.
- **Policy tests (OPA test framework)**: Exhaustive tests for every policy domain, hierarchy level, and edge case. Run separately from plugin tests.
- **Integration tests**: End-to-end tests per user story. Verify the agent uses tools correctly through the full plugin stack. Use mock connectors for external APIs.
- **OCIP protocol tests**: End-to-end tests covering all exchange types, loop prevention, and classification enforcement with two agent instances.
- No PR merged without all tests passing (constitution mandate).

**Alternatives considered**:
- Jest: Vitest is faster, ESM-native, and better aligned with modern TypeScript projects
- Playwright for E2E: Good for browser-based testing but Canvas interactions are better tested via OpenClaw's own tool invocation framework
