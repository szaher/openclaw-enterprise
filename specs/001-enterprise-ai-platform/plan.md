# Implementation Plan: OpenClaw Enterprise — Secure Enterprise AI Assistant Platform

**Branch**: `001-enterprise-ai-platform` | **Date**: 2026-03-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-enterprise-ai-platform/spec.md`

## Summary

Build an enterprise extension layer for OpenClaw as a suite of OpenClaw plugins, each paired with a skill. The system provides: a hierarchical policy engine (OPA/Cedar-backed), enterprise connectors (Gmail, GCal, Jira, GitHub, GDrive for MVP), cross-system task intelligence with daily briefings, a graduated auto-response engine, work tracking auto-updates, an agent-to-agent protocol (OCIP) with classification enforcement, org news intelligence, document change monitoring, interactive visualizations, and enterprise security (SSO/OIDC, RBAC, immutable audit logging). All features are built as OpenClaw plugins — no upstream fork. State lives in PostgreSQL. Deployment is managed by a K8s operator. Target scale: 500 concurrent users per deployment.

## Technical Context

**Language/Version**: TypeScript (strict mode) on Node.js >= 22 for all enterprise plugins; Go for K8s Operator
**Primary Dependencies**: OpenClaw plugin API (registerTool/Hook/Service/HttpRoute/GatewayMethod/ContextEngine), OPA (Open Policy Agent) for policy evaluation (decided over Cedar per research R1), D3.js for visualization
**Storage**: PostgreSQL (task store, policy store, audit log), pgvector (RAG embeddings), Redis (cache, session state)
**Testing**: Vitest (unit), Playwright or similar (integration), OPA test framework (policy tests)
**Target Platform**: Kubernetes (Linux containers), self-hosted enterprise environments
**Project Type**: Plugin suite (multiple OpenClaw plugins + paired skills + K8s operator)
**Performance Goals**: Policy evaluation <60s hot-reload, audit log queries <10s, briefing generation within cron window, auto-response within 30s of message arrival
**Constraints**: All features MUST be OpenClaw plugins (no fork), fail-closed on policy engine unavailability, no raw user data persisted, data classification propagates through all processing
**Scale/Scope**: 500 concurrent users per deployment, 5 MVP connectors (Gmail, GCal, Jira, GitHub, GDrive), 90-day task retention

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Upstream First | All features are OpenClaw plugins; no core modifications | PASS |
| II | Policy Over Code | All configurable behavior goes through policy engine; no hardcoded behavior switches | PASS |
| III | Humans Own Decisions | Graduated autonomy model (autonomous/notify/approve/block); default is "ask" | PASS |
| IV | Data Never Leaves Its Classification | Classification propagates through summaries, caches, model calls, agent exchanges | PASS |
| V | Least Privilege By Default | Connectors read-only by default; tools deny-by-default; agent exchanges information-only | PASS |
| VI | Transparency Is Non-Negotiable | Full audit log; user activity review; admin visibility | PASS |
| VII | Plugin + Skill Pairs | Every capability = plugin + SKILL.md | PASS |
| VIII | Simple Things Should Be Simple | 10-person team setup < 1 hour; secure defaults | PASS |
| IX | Measure Everything | SC-001 through SC-012 define measurable outcomes for every feature | PASS |
| X | Enterprise Means Boring | TypeScript + PostgreSQL + OPA + K8s — proven, boring stack | PASS |
| — | No Python in production | All plugins are TypeScript; Go for K8s operator only | PASS |
| — | PostgreSQL only (no SQLite) | All state in PostgreSQL; Redis for cache only | PASS |
| — | Audit logs append-only | Separate table, no updates, no deletes | PASS |
| — | API versioned + authenticated | All HTTP routes via registerHttpRoute(), versioned /api/v1/, SSO/OIDC required | PASS |
| — | Plugin dependencies declared | Each plugin manifest declares dependencies (all depend on policy-engine plugin) | PASS |
| — | Plugins handle policy engine unavailability | Fail closed (deny all actions) | PASS |
| — | Every plugin emits audit events | All state-changing operations produce audit entries | PASS |
| — | Every plugin includes health check | Via gateway status system | PASS |

All gates pass. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-enterprise-ai-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── policy-api.md
│   ├── admin-api.md
│   ├── audit-api.md
│   ├── connector-interface.md
│   └── ocip-protocol.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
plugins/
├── policy-engine/           # Core policy plugin (all others depend on this)
│   ├── src/
│   │   ├── plugin.ts        # Plugin entry: registerHook, registerGatewayMethod, registerHttpRoute, registerService
│   │   ├── evaluator/       # OPA/Cedar integration
│   │   ├── hierarchy/       # Policy hierarchy resolution
│   │   ├── hot-reload/      # Policy change detection and reload
│   │   └── classification/  # Data classification engine
│   ├── SKILL.md             # Paired skill for agent
│   └── tests/
│
├── audit-enterprise/        # Immutable audit logging
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── writer/          # Append-only log writer
│   │   └── query/           # Audit log query engine
│   ├── SKILL.md
│   └── tests/
│
├── auth-enterprise/         # SSO/OIDC integration
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── oidc/            # OIDC token validation
│   │   └── rbac/            # Role mapping (OIDC claims → operator scopes)
│   ├── SKILL.md
│   └── tests/
│
├── connector-gmail/         # Gmail connector (MVP)
│   ├── src/
│   │   ├── plugin.ts        # registerTool + registerService
│   │   ├── tools/           # email_read, email_search, email_draft, email_send
│   │   └── services/        # Inbox polling service
│   ├── SKILL.md
│   └── tests/
│
├── connector-gcal/          # Google Calendar connector (MVP)
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── tools/           # calendar_read, calendar_create, calendar_modify
│   │   └── services/        # Calendar sync service
│   ├── SKILL.md
│   └── tests/
│
├── connector-jira/          # Jira connector (MVP)
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── tools/           # jira_read, jira_comment, jira_transition, jira_create
│   │   └── services/        # Webhook receiver via registerHttpRoute
│   ├── SKILL.md
│   └── tests/
│
├── connector-github/        # GitHub connector (MVP)
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── tools/           # github_pr, github_issue, github_actions
│   │   └── services/        # Webhook receiver via registerHttpRoute
│   ├── SKILL.md
│   └── tests/
│
├── connector-gdrive/        # Google Drive connector (MVP)
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── tools/           # gdrive_read, gdrive_search, gdrive_watch
│   │   └── services/        # Document change polling service
│   ├── SKILL.md
│   └── tests/
│
├── task-intelligence/       # Cross-system task discovery and briefing
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── discovery/       # Task scanner across connectors
│   │   ├── correlation/     # Cross-system deduplication
│   │   ├── scoring/         # Priority scoring engine
│   │   └── briefing/        # Daily briefing generator
│   ├── SKILL.md
│   └── tests/
│
├── auto-response/           # Message classification and auto-response
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── classifier/      # Message classification (critical/needs-response/informational/noise)
│   │   ├── responder/       # Response generation with AI disclosure
│   │   └── approval/        # Approval queue for pending responses
│   ├── SKILL.md
│   └── tests/
│
├── work-tracking/           # Jira/GitHub auto-update from code activity
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── correlation/     # PR ↔ Jira ticket correlation
│   │   ├── updater/         # Comment + transition logic
│   │   └── standup/         # End-of-day standup generator
│   ├── SKILL.md
│   └── tests/
│
├── ocip-protocol/           # Agent-to-agent protocol
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── envelope/        # OCIP metadata injection/detection
│   │   ├── classification/  # Sender-side classification filtering
│   │   ├── loop-prevention/ # Round counting and escalation
│   │   └── exchange-log/    # Dual-sided exchange logging
│   ├── SKILL.md
│   └── tests/
│
├── org-intelligence/        # Org news + document change monitoring
│   ├── src/
│   │   ├── plugin.ts
│   │   ├── news/            # Org news aggregation and scoring
│   │   ├── digest/          # Personalized digest generator
│   │   ├── doc-monitor/     # Document change detection and diffing
│   │   └── consistency/     # Cross-document consistency checker
│   ├── SKILL.md
│   └── tests/
│
└── visualization/           # Task graphs, mind maps, workload views
    ├── src/
    │   ├── plugin.ts
    │   ├── graphs/          # D3.js task dependency graphs
    │   ├── mindmap/         # Mind map generation
    │   └── matrix/          # Priority matrix / Eisenhower
    ├── SKILL.md
    ├── assets/              # HTML/CSS/JS for Canvas rendering
    └── tests/

operator/                    # K8s Operator (Go)
├── cmd/
│   └── manager/
├── api/
│   └── v1/                  # CRD types (OpenClawInstance, Policy CRDs)
├── internal/
│   ├── controller/          # Reconciliation logic
│   └── webhook/             # Admission webhooks for policy validation
├── config/
│   ├── crd/                 # CRD manifests
│   ├── rbac/                # RBAC for operator
│   └── samples/             # Example CR manifests
└── tests/

db/
├── migrations/              # PostgreSQL migrations (task store, policy store, audit log)
└── seeds/                   # Default policies, sample data for development
```

**Structure Decision**: Plugin-per-capability monorepo. Each plugin is an independent OpenClaw plugin with its own SKILL.md, tests, and manifest. The policy-engine plugin is the dependency root — all other plugins depend on it. The K8s operator is a separate Go module. Database migrations are shared. This structure aligns with constitution principles VII (Plugin + Skill Pairs) and the architecture rule that all features MUST be plugins.

## Complexity Tracking

No violations. All gates pass without justification needed.
