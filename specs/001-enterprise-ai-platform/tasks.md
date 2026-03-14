# Tasks: OpenClaw Enterprise — Secure Enterprise AI Assistant Platform

**Input**: Design documents from `/specs/001-enterprise-ai-platform/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Constitution mandates >80% unit test coverage per plugin and exhaustive tests for policy engine and OCIP. Test tasks are included per constitution Quality requirements.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo initialization, shared configuration, project scaffolding, architectural records

- [x] T001 Initialize monorepo with root package.json, pnpm-workspace.yaml for plugins/, operator/, and db/ workspaces
- [x] T002 Configure TypeScript strict mode with shared tsconfig.base.json at repo root
- [x] T003 [P] Configure ESLint and Prettier with project rules at repo root (.eslintrc.cjs, .prettierrc)
- [x] T004 [P] Configure Vitest at repo root with workspace-aware vitest.config.ts
- [x] T005 [P] Create shared types package in plugins/shared/src/types.ts (PolicyScope, PolicyDomain, DataClassificationLevel, ActionAutonomyLevel, ConnectorType, AuditActionType, ExchangeType, ExchangeOutcome, TaskStatus enums and shared interfaces)
- [x] T006 [P] Create shared constants and errors in plugins/shared/src/constants.ts and plugins/shared/src/errors.ts
- [x] T007 [P] Scaffold K8s operator Go module in operator/ with go.mod, cmd/manager/main.go stub, Makefile
- [x] T008 Create plugin scaffold script or template for consistent plugin structure (src/plugin.ts, SKILL.md, README.md, tests/, package.json with OpenClaw plugin manifest including dependency declarations)
- [x] T009 Create ADR template in docs/adr/000-template.md and initial ADRs: docs/adr/001-opa-over-cedar.md (R1), docs/adr/002-multi-gateway-tenancy.md (R3), docs/adr/003-plugin-per-capability.md, docs/adr/004-multi-signal-task-correlation.md (R5), docs/adr/005-three-layer-classification.md (R6), docs/adr/006-append-only-audit.md (R7), docs/adr/007-ocip-via-sessions-send.md (R8), docs/adr/008-d3-canvas-visualization.md (R9)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete. The policy engine, audit system, and auth are exercised by every user story.

### Database Migrations

- [x] T010 Create PostgreSQL migration 001: policies table (id, scope, scope_id, domain, name, version, content, status, created_by, created_at, updated_at, change_reason) with index on (scope, scope_id, domain, status) in db/migrations/001_policies.sql
- [x] T011 [P] Create PostgreSQL migration 002: tasks table (id, user_id, title, description, priority_score, status, sources JSONB, correlation_id, correlation_confidence, deadline, urgency_signals JSONB, classification, discovered_at, completed_at, archived_at, purge_at) with indexes on (user_id, status, priority_score DESC) and (purge_at) in db/migrations/002_tasks.sql
- [x] T012 [P] Create PostgreSQL migration 003: connectors table (id, type, tenant_id, user_id, permissions, default_classification, status, credentials_ref, last_sync_at, error_details, config JSONB) in db/migrations/003_connectors.sql
- [x] T013 [P] Create PostgreSQL migration 004: audit_entries table (id ULID, tenant_id, user_id, timestamp, action_type, action_detail JSONB, data_accessed JSONB, model_used, model_tokens JSONB, data_classification, policy_applied, policy_result, policy_reason, outcome, request_id) partitioned by month with indexes on (tenant_id, user_id, timestamp DESC), (tenant_id, action_type, timestamp DESC), and (request_id) in db/migrations/004_audit_entries.sql
- [x] T014 [P] Create PostgreSQL migration 005: exchanges table (exchange_id, conversation_id, initiator_agent_id, initiator_user_id, responder_agent_id, responder_user_id, exchange_type, current_round, max_rounds, classification_level, outcome, escalation_reason, data_shared JSONB, data_withheld JSONB, policy_applied, transcript JSONB, channel, started_at, ended_at) with indexes on (initiator_user_id, started_at DESC) and (responder_user_id, started_at DESC) in db/migrations/005_exchanges.sql
- [x] T015 [P] Create PostgreSQL migration 006: briefings table (id, user_id, tenant_id, generated_at, tasks JSONB, time_blocks JSONB, auto_response_summary JSONB, org_news_items JSONB, doc_change_alerts JSONB, alerts JSONB, connector_status JSONB, delivery_channel, delivered_at) in db/migrations/006_briefings.sql
- [x] T016 [P] Create PostgreSQL migration 007: data_classifications table (data_ref, level, assigned_by, original_level, override_by, override_reason, assessed_at) in db/migrations/007_data_classifications.sql
- [x] T017 Create seed data with default enterprise policies for all 7 domains (models, actions, integrations, agent-to-agent, features, data, audit) in db/seeds/001_default_policies.sql

### Infrastructure Security

- [x] T018 Configure PostgreSQL TLS connections and encryption at rest (AES-256) in db/migrations/000_security.sql and document connection string requirements with sslmode=verify-full
- [x] T019 Configure mTLS between gateway pods and OPA sidecar, and signed token auth for PostgreSQL/Redis connections in plugins/shared/src/infra/mtls.ts and plugins/shared/src/infra/db-auth.ts
- [x] T020 Implement X-Request-Id middleware for all HTTP routes in plugins/shared/src/middleware/request-id.ts

### Policy Engine Plugin

- [x] T021 Scaffold policy-engine plugin with package.json (declaring no enterprise plugin dependencies — this is the root), src/plugin.ts entry point, OpenClaw plugin manifest declaring registerHook, registerGatewayMethod, registerHttpRoute, registerService in plugins/policy-engine/
- [x] T022 Implement OPA sidecar client in plugins/policy-engine/src/evaluator/opa-client.ts (REST calls to OPA sidecar at localhost:8181, timeout handling, fail-closed on unreachable)
- [x] T023 Implement policy hierarchy resolver in plugins/policy-engine/src/hierarchy/resolver.ts (enterprise -> org -> team -> user flattening; lower levels restrict, never expand)
- [x] T024 Implement policy.evaluate gateway method in plugins/policy-engine/src/evaluator/evaluate.ts (per policy-api.md contract: accept tenant_id, user_id, action, context; return decision, policy_applied, reason, constraints)
- [x] T025 Implement policy.resolve gateway method in plugins/policy-engine/src/hierarchy/resolve-method.ts (per policy-api.md contract: resolve effective policy for scope + domain)
- [x] T026 Implement policy.classify gateway method in plugins/policy-engine/src/classification/classify.ts (per policy-api.md contract: per-connector defaults + AI reclassification; return classification, assigned_by, confidence)
- [x] T027 Implement hot-reload service in plugins/policy-engine/src/hot-reload/watcher.ts (detect policy changes in PostgreSQL, reload OPA policies within 60 seconds, registerService)
- [x] T028 Implement policy CRUD REST routes in plugins/policy-engine/src/routes.ts (POST/GET/PUT/DELETE /api/v1/policies per policy-api.md contract, with hierarchy validation on create/update)
- [x] T029 Implement before_tool_execute hook in plugins/policy-engine/src/hooks.ts (intercept every tool invocation, call policy.evaluate, deny if policy denies, require approval if policy says so)
- [x] T030 Create base Rego policies for each domain in plugins/policy-engine/rego/ (models.rego, actions.rego, integrations.rego, agent-exchange.rego, features.rego, data.rego, audit.rego)
- [x] T031 Implement policy hierarchy validation in plugins/policy-engine/src/hierarchy/validator.ts (reject policies that expand beyond parent scope ceiling, return clear error messages)
- [x] T032 Write SKILL.md for policy-engine in plugins/policy-engine/SKILL.md
- [x] T033 Write exhaustive unit tests for policy-engine in plugins/policy-engine/tests/ (every policy domain, every hierarchy level, every edge case: fail-closed, ambiguous policies default deny, unknown classification defaults highest level, hierarchy ceiling enforcement)
- [x] T034 [P] Write OpenAPI spec for policy engine REST endpoints in plugins/policy-engine/openapi.yaml
- [x] T035 [P] Write README for policy-engine in plugins/policy-engine/README.md (what it does, configuration, policies that govern it)

### Audit Enterprise Plugin

- [x] T036 Scaffold audit-enterprise plugin with package.json (depends on policy-engine), src/plugin.ts entry point in plugins/audit-enterprise/
- [x] T037 Implement append-only audit writer in plugins/audit-enterprise/src/writer/writer.ts (PostgreSQL INSERT only, no UPDATE/DELETE, ULID generation, per audit-api.md contract)
- [x] T038 Implement audit.log gateway method in plugins/audit-enterprise/src/writer/log-method.ts (per audit-api.md contract: accept full audit entry params, write to audit_entries table)
- [x] T039 Implement audit.query gateway method in plugins/audit-enterprise/src/query/query-method.ts (per audit-api.md contract: filtered queries with pagination, <10s response time)
- [x] T040 Implement audit REST routes in plugins/audit-enterprise/src/routes.ts (GET /api/v1/audit, GET /api/v1/audit/{id}, GET /api/v1/audit/export per audit-api.md contract)
- [x] T041 Write SKILL.md for audit-enterprise in plugins/audit-enterprise/SKILL.md
- [x] T042 Write unit tests for audit-enterprise in plugins/audit-enterprise/tests/ (append-only enforcement, query filtering, pagination, export formats, ULID ordering, partition-aware queries)
- [x] T043 [P] Write OpenAPI spec for audit REST endpoints in plugins/audit-enterprise/openapi.yaml
- [x] T044 [P] Write README for audit-enterprise in plugins/audit-enterprise/README.md

### Auth Enterprise Plugin

- [x] T045 Scaffold auth-enterprise plugin with package.json (depends on policy-engine, audit-enterprise), src/plugin.ts entry point in plugins/auth-enterprise/
- [x] T046 Implement OIDC token validation in plugins/auth-enterprise/src/oidc/validator.ts (validate JWT from SSO provider, extract claims)
- [x] T047 Implement RBAC role mapping in plugins/auth-enterprise/src/rbac/mapper.ts (map OIDC claims to 4 built-in roles: enterprise_admin, org_admin, team_lead, user)
- [x] T048 Implement POST /api/v1/auth/callback and GET /api/v1/auth/userinfo routes in plugins/auth-enterprise/src/routes.ts (per admin-api.md contract)
- [x] T049 Implement auth middleware hook in plugins/auth-enterprise/src/hooks.ts (intercept HTTP requests, validate SSO token, attach user context)
- [x] T050 Write SKILL.md for auth-enterprise in plugins/auth-enterprise/SKILL.md
- [x] T051 Write unit tests for auth-enterprise in plugins/auth-enterprise/tests/ (OIDC validation, claims mapping, role hierarchy, middleware rejection for invalid tokens)
- [x] T052 [P] Write README for auth-enterprise in plugins/auth-enterprise/README.md

### Connector Base

- [x] T053 Create shared connector base module in plugins/shared/src/connector-base.ts (ConnectorReadResult, ConnectorWriteResult interfaces per connector-interface.md contract; base class with policy.evaluate + audit.log calls, classification propagation enforcement ensuring derived data inherits source classification, ephemeral raw data handling that discards raw content after structured extraction, and OAuth revocation detection with graceful connector disablement)

**Checkpoint**: Foundation ready — policy engine evaluates actions, audit logs immutably, auth validates SSO tokens, encryption configured, service-to-service auth in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Policy-Governed Task Briefing (Priority: P1) MVP

**Goal**: Knowledge workers receive a prioritized daily briefing from tasks discovered across Gmail, GCal, Jira, GitHub, and GDrive — deduplicated, priority-scored, and fully audited. Slack messages are accessed via OpenClaw's existing Slack ChannelPlugin (not an enterprise connector).

**Independent Test**: Deploy a single-user instance with 5 MVP connectors. Verify morning briefing with correlated, deduplicated, priority-ranked tasks. Verify every connector read and model call is logged in the audit trail and every action passes through the policy engine.

### Gmail Connector

- [x] T054 [P] [US1] Scaffold connector-gmail plugin in plugins/connector-gmail/ (package.json declares dependency on policy-engine, audit-enterprise)
- [x] T055 [P] [US1] Implement email_read and email_search tools in plugins/connector-gmail/src/tools/read.ts (return ConnectorReadResult with classification, call policy.evaluate before access, discard raw email body after extraction)
- [x] T056 [US1] Implement inbox polling service in plugins/connector-gmail/src/services/poller.ts (registerService, configurable interval, OAuth token refresh, graceful degradation on API unavailability, detect revoked OAuth)
- [x] T057 [US1] Write SKILL.md for connector-gmail in plugins/connector-gmail/SKILL.md
- [x] T058 [P] [US1] Write unit tests for connector-gmail in plugins/connector-gmail/tests/ (read tool policy check, classification assignment, polling service, OAuth refresh, revocation handling)
- [x] T059 [P] [US1] Write README for connector-gmail in plugins/connector-gmail/README.md

### GCal Connector

- [x] T060 [P] [US1] Scaffold connector-gcal plugin in plugins/connector-gcal/
- [x] T061 [P] [US1] Implement calendar_read and calendar_search tools in plugins/connector-gcal/src/tools/read.ts (return ConnectorReadResult with classification)
- [x] T062 [US1] Implement calendar sync service in plugins/connector-gcal/src/services/sync.ts (registerService, configurable interval, OAuth token refresh)
- [x] T063 [US1] Write SKILL.md for connector-gcal in plugins/connector-gcal/SKILL.md
- [x] T064 [P] [US1] Write unit tests for connector-gcal in plugins/connector-gcal/tests/
- [x] T065 [P] [US1] Write README for connector-gcal in plugins/connector-gcal/README.md

### Jira Connector

- [x] T066 [P] [US1] Scaffold connector-jira plugin in plugins/connector-jira/
- [x] T067 [P] [US1] Implement jira_read and jira_search tools in plugins/connector-jira/src/tools/read.ts (return ConnectorReadResult with classification)
- [x] T068 [US1] Implement Jira webhook receiver in plugins/connector-jira/src/services/webhook.ts (registerHttpRoute for incoming Jira webhooks)
- [x] T069 [US1] Write SKILL.md for connector-jira in plugins/connector-jira/SKILL.md
- [x] T070 [P] [US1] Write unit tests for connector-jira in plugins/connector-jira/tests/
- [x] T071 [P] [US1] Write README for connector-jira in plugins/connector-jira/README.md

### GitHub Connector

- [x] T072 [P] [US1] Scaffold connector-github plugin in plugins/connector-github/
- [x] T073 [P] [US1] Implement github_pr_read and github_issue_read tools in plugins/connector-github/src/tools/read.ts (return ConnectorReadResult with classification; read-only MVP)
- [x] T074 [US1] Implement GitHub webhook receiver in plugins/connector-github/src/services/webhook.ts (registerHttpRoute for incoming GitHub webhooks)
- [x] T075 [US1] Write SKILL.md for connector-github in plugins/connector-github/SKILL.md
- [x] T076 [P] [US1] Write unit tests for connector-github in plugins/connector-github/tests/
- [x] T077 [P] [US1] Write README for connector-github in plugins/connector-github/README.md

### GDrive Connector

- [x] T078 [P] [US1] Scaffold connector-gdrive plugin in plugins/connector-gdrive/
- [x] T079 [P] [US1] Implement gdrive_read and gdrive_search tools in plugins/connector-gdrive/src/tools/read.ts (return ConnectorReadResult with classification)
- [x] T080 [US1] Implement document change polling service in plugins/connector-gdrive/src/services/poller.ts (registerService, detect document changes)
- [x] T081 [US1] Write SKILL.md for connector-gdrive in plugins/connector-gdrive/SKILL.md
- [x] T082 [P] [US1] Write unit tests for connector-gdrive in plugins/connector-gdrive/tests/
- [x] T083 [P] [US1] Write README for connector-gdrive in plugins/connector-gdrive/README.md

### Task Intelligence

- [x] T084 [US1] Scaffold task-intelligence plugin in plugins/task-intelligence/ (depends on policy-engine, audit-enterprise)
- [x] T085 [US1] Implement task discovery scanner in plugins/task-intelligence/src/discovery/scanner.ts (scan all active connectors via their read tools, extract task-like items, include Slack messages from OpenClaw session data)
- [x] T086 [US1] Implement cross-system task correlation in plugins/task-intelligence/src/correlation/correlator.ts (multi-signal deduplication: confidence >= 0.8 auto-merge, 0.5-0.8 "possibly related", <0.5 separate)
- [x] T087 [US1] Implement priority scoring engine in plugins/task-intelligence/src/scoring/scorer.ts (score 0-100 using urgency signals: deadlines, sender seniority, follow-up frequency, SLA timers, blocking relationships)
- [x] T088 [US1] Implement daily briefing generator in plugins/task-intelligence/src/briefing/generator.ts (compose Briefing entity: prioritized tasks, time-block suggestions from calendar free slots, connector status, alerts; org_news_items and doc_change_alerts populated as empty until US5)
- [x] T089 [US1] Implement briefing scheduler as registered service in plugins/task-intelligence/src/briefing/scheduler.ts (registerService, cron-based morning briefing, refresh during day)
- [x] T090 [US1] Implement task retention lifecycle service in plugins/task-intelligence/src/discovery/retention.ts (archive completed tasks after 30 days, purge archived after 90 days, purge active tasks after 90 days)
- [x] T091 [US1] Write SKILL.md for task-intelligence in plugins/task-intelligence/SKILL.md
- [x] T092 [US1] Write unit tests for task-intelligence in plugins/task-intelligence/tests/ (discovery scanning, correlation confidence thresholds, priority scoring signals, briefing composition, retention lifecycle transitions)
- [x] T093 [P] [US1] Write README for task-intelligence in plugins/task-intelligence/README.md

**Checkpoint**: User Story 1 complete. Daily briefing generates with tasks from 5 connectors + Slack channel data, deduplicated, priority-ranked, time-blocked. Task lifecycle enforced. All actions policy-checked and audit-logged.

---

## Phase 4: User Story 2 — Graduated Auto-Response Engine (Priority: P2)

**Goal**: The assistant classifies incoming messages and auto-responds, queues for approval, or blocks — based on graduated autonomy policy.

**Independent Test**: Send various Slack messages and emails. Verify classification, policy-checked autonomy level, and appropriate action (auto-respond with AI disclosure, queue for approval, or block). Verify all responses logged and reviewable.

- [x] T094 [US2] Scaffold auto-response plugin in plugins/auto-response/ (depends on policy-engine, audit-enterprise)
- [x] T095 [US2] Implement message classifier in plugins/auto-response/src/classifier/classifier.ts (classify as critical / needs-response / informational / noise using model calls, log classification to audit)
- [x] T096 [US2] Implement response generator in plugins/auto-response/src/responder/responder.ts (generate response via model, inject AI disclosure label per FR-018, check policy.evaluate for autonomy level)
- [x] T097 [US2] Implement approval queue in plugins/auto-response/src/approval/queue.ts (store pending responses for "approve" autonomy level, expose via gateway method for user review)
- [x] T098 [US2] Implement auto-response hook in plugins/auto-response/src/hooks.ts (registerHook on incoming messages, route through classifier -> policy check -> responder or queue; support per-channel, per-contact, and per-classification scope configuration from policy per FR-020)
- [x] T099 [US2] Implement auto-response summary for briefings in plugins/auto-response/src/responder/summary.ts (aggregate auto-responses since last briefing for inclusion in daily briefing)
- [x] T100 [US2] Write SKILL.md for auto-response in plugins/auto-response/SKILL.md
- [x] T101 [US2] Write unit tests for auto-response in plugins/auto-response/tests/ (classification accuracy, graduated autonomy routing, AI disclosure injection, approval queue, per-channel scope, per-contact scope)
- [x] T102 [P] [US2] Write README for auto-response in plugins/auto-response/README.md

**Checkpoint**: User Story 2 complete. Messages classified with graduated autonomy. Auto-responses carry AI disclosure. Approval queue works. Per-channel/contact scope configurable. All responses in audit log.

---

## Phase 5: User Story 3 — Work Tracking Auto-Updates (Priority: P3)

**Goal**: When a PR is merged on GitHub, the assistant auto-updates linked Jira tickets with summary comments and status transitions — governed by policy.

**Independent Test**: Merge a PR with a Jira ticket key in the branch name. Verify Jira comment added, ticket transitioned, and policy authorized each write action.

- [x] T103 [US3] Implement Jira write tools (jira_comment, jira_transition, jira_create) in plugins/connector-jira/src/tools/write.ts (ConnectorWriteResult per contract, policy.evaluate before each write)
- [x] T104 [US3] Scaffold work-tracking plugin in plugins/work-tracking/ (depends on policy-engine, audit-enterprise)
- [x] T105 [US3] Implement PR-to-Jira correlation in plugins/work-tracking/src/correlation/pr-jira.ts (extract ticket keys from branch names and PR descriptions, support multiple ticket references)
- [x] T106 [US3] Implement ticket updater in plugins/work-tracking/src/updater/updater.ts (add summary comment to linked Jira ticket, transition status per policy constraints, link PR URL)
- [x] T107 [US3] Implement webhook event handler in plugins/work-tracking/src/hooks.ts (registerHook on GitHub webhook events for PR merge/open/close, trigger correlation + update)
- [x] T108 [US3] Implement end-of-day standup summary generator in plugins/work-tracking/src/standup/generator.ts (aggregate code activity, PR events, ticket updates into daily standup)
- [x] T109 [US3] Write SKILL.md for work-tracking in plugins/work-tracking/SKILL.md
- [x] T110 [US3] Write unit tests for work-tracking in plugins/work-tracking/tests/ (PR-Jira correlation parsing, multi-ticket references, transition policy constraints, standup aggregation)
- [x] T111 [P] [US3] Write README for work-tracking in plugins/work-tracking/README.md

**Checkpoint**: User Story 3 complete. PR merges auto-update Jira tickets. Standup summaries generated. All writes policy-authorized and audit-logged.

---

## Phase 6: User Story 4 — Agent-to-Agent Information Exchange (Priority: P4)

**Goal**: Two OpenClaw Enterprise assistants exchange information via OCIP protocol with classification enforcement, loop prevention, and dual-sided audit logging.

**Independent Test**: Set up two instances. Agent A queries Agent B for project status. Verify OCIP metadata present, classification filtering excludes confidential data, round limits enforced, both sides logged.

- [x] T112 [US4] Scaffold ocip-protocol plugin in plugins/ocip-protocol/ (depends on policy-engine, audit-enterprise)
- [x] T113 [US4] Implement OCIP envelope builder in plugins/ocip-protocol/src/envelope/builder.ts (construct OCIP metadata per ocip-protocol.md contract: version, message_type, source_agent, classification, exchange_round, max_rounds, capabilities, reply_policy)
- [x] T114 [US4] Implement OCIP envelope parser in plugins/ocip-protocol/src/envelope/parser.ts (detect and parse OCIP metadata from incoming sessions_send messages, treat missing/malformed as human-generated)
- [x] T115 [US4] Implement sender-side classification filter in plugins/ocip-protocol/src/classification/filter.ts (filter data before transmission based on receiver's can_share levels, log data_withheld)
- [x] T116 [US4] Implement loop prevention in plugins/ocip-protocol/src/loop-prevention/counter.ts (increment exchange_round per message, escalate to humans when > max_rounds, include conversation summary in escalation)
- [x] T117 [US4] Implement commitment detection in plugins/ocip-protocol/src/envelope/commitment.ts (detect requires_commitment exchanges, always escalate to human for approval per FR-027)
- [x] T118 [US4] Implement dual-sided exchange logger in plugins/ocip-protocol/src/exchange-log/logger.ts (log full transcript, data_shared, data_withheld, policy_applied, outcome on both initiator and responder side)
- [x] T119 [US4] Implement cross-org policy check in plugins/ocip-protocol/src/classification/cross-org.ts (allow intra-enterprise cross-org per org-level policies per FR-028a, block cross-enterprise unconditionally)
- [x] T120 [US4] Implement OCIP hooks in plugins/ocip-protocol/src/hooks.ts (registerHook on sessions_send to inject OCIP metadata on outgoing, parse on incoming, enforce policy)
- [x] T121 [US4] Write SKILL.md for ocip-protocol in plugins/ocip-protocol/SKILL.md
- [x] T122 [US4] Write end-to-end tests for ocip-protocol in plugins/ocip-protocol/tests/ (all exchange types, loop prevention at max_rounds, classification enforcement at sender, commitment escalation, cross-org allow, cross-enterprise block, malformed header handling, dual-sided logging verification)
- [x] T123 [P] [US4] Write README for ocip-protocol in plugins/ocip-protocol/README.md

**Checkpoint**: User Story 4 complete. Agent-to-agent exchanges work with OCIP metadata, classification filtering, loop prevention, commitment escalation, and dual-sided audit logging.

---

## Phase 7: User Story 5 — Org News Intelligence and Document Change Monitoring (Priority: P5)

**Goal**: Users receive personalized org news digests (must-read/should-read/nice-to-know/skip) and are notified of substantive changes in watched documents with impact assessment.

**Independent Test**: Post org-wide announcements, modify a watched document. Verify personalized digest with relevance scoring and document change detection with summary and impact assessment.

- [x] T124 [US5] Scaffold org-intelligence plugin in plugins/org-intelligence/ (depends on policy-engine, audit-enterprise)
- [x] T125 [US5] Implement org news aggregator in plugins/org-intelligence/src/news/aggregator.ts (scan monitored channels and email lists via connector read tools)
- [x] T126 [US5] Implement relevance scorer in plugins/org-intelligence/src/news/scorer.ts (score each item against user's role, team, and active projects; classify as must-read / should-read / nice-to-know / skip)
- [x] T127 [US5] Implement personalized digest generator in plugins/org-intelligence/src/digest/generator.ts (compose weekly/daily digests with scored items, respecting data classification)
- [x] T128 [US5] Implement document change detector in plugins/org-intelligence/src/doc-monitor/detector.ts (compare current vs cached version via GDrive connector, classify as cosmetic / minor / substantive / critical; handle missing cached version by flagging no-diff-available)
- [x] T129 [US5] Implement change summarizer in plugins/org-intelligence/src/doc-monitor/summarizer.ts (summarize what changed: added/modified/removed, assess impact per user)
- [x] T130 [US5] Implement cross-document consistency checker in plugins/org-intelligence/src/consistency/checker.ts (detect contradictions between related documents when one changes per FR-033)
- [x] T131 [US5] Implement notification service in plugins/org-intelligence/src/services/notifier.ts (registerService, deliver change notifications based on urgency, suppress cosmetic changes per policy)
- [x] T132 [US5] Write SKILL.md for org-intelligence in plugins/org-intelligence/SKILL.md
- [x] T133 [US5] Write unit tests for org-intelligence in plugins/org-intelligence/tests/ (relevance scoring, digest composition, change classification, consistency checking, cosmetic suppression)
- [x] T134 [P] [US5] Write README for org-intelligence in plugins/org-intelligence/README.md

**Checkpoint**: User Story 5 complete. Personalized digests generated. Document changes detected, summarized, and impact-assessed. Cross-document contradictions flagged.

---

## Phase 8: User Story 6 — Visualization and Mind Mapping (Priority: P6)

**Goal**: Users request interactive task dependency graphs, priority matrices, and mind maps rendered via OpenClaw Canvas.

**Independent Test**: Request a task dependency graph for a user with 10+ tasks. Verify interactive D3.js visual with correct dependencies. Request a project mind map and verify cross-system data organized by theme.

- [x] T135 [US6] Scaffold visualization plugin in plugins/visualization/ (depends on policy-engine, audit-enterprise)
- [x] T136 [US6] Implement task dependency graph generator in plugins/visualization/src/graphs/dependency.ts (query tasks with blocking relationships, generate D3.js force-directed graph data, render via Canvas A2UI)
- [x] T137 [US6] Implement priority matrix (Eisenhower) generator in plugins/visualization/src/matrix/eisenhower.ts (plot tasks by urgency and importance using real signals)
- [x] T138 [US6] Implement mind map generator in plugins/visualization/src/mindmap/generator.ts (gather cross-system data for a project, organize by theme not source, generate D3.js tree layout)
- [x] T139 [US6] Create HTML/CSS/JS Canvas assets in plugins/visualization/assets/ (responsive D3.js visualizations: force graph, quadrant matrix, tree/radial map with interactive nodes)
- [x] T140 [US6] Implement visualization tool registrations in plugins/visualization/src/plugin.ts (registerTool for generate_dependency_graph, generate_priority_matrix, generate_mind_map)
- [x] T141 [US6] Write SKILL.md for visualization in plugins/visualization/SKILL.md
- [x] T142 [US6] Write unit tests for visualization in plugins/visualization/tests/ (graph data generation, matrix plotting, mind map theming, Canvas asset rendering)
- [x] T143 [P] [US6] Write README for visualization in plugins/visualization/README.md

**Checkpoint**: User Story 6 complete. Interactive visualizations render via Canvas. Task graphs, priority matrices, and mind maps display correctly.

---

## Phase 9: User Story 7 — Enterprise Administration and Policy Management (Priority: P7)

**Goal**: Enterprise admins manage the policy hierarchy, configure model routing, action autonomy, integration permissions, and query the audit log — all through the admin API. (Note: Admin UI is deferred to post-MVP; this phase delivers the API layer.)

**Independent Test**: As enterprise admin, create a model policy blocking external models for confidential data. Verify it takes effect within 60 seconds. As org admin, attempt to expand beyond enterprise ceiling — verify rejection. Query audit log for a specific user — verify complete results.

- [x] T144 [US7] Implement tenant management routes in plugins/auth-enterprise/src/routes.ts (GET /api/v1/tenants, GET /api/v1/tenants/{id}/status per admin-api.md contract)
- [x] T145 [US7] Implement connector management routes in plugins/auth-enterprise/src/routes.ts (GET/POST/DELETE /api/v1/connectors per admin-api.md contract, require admin role)
- [x] T146 [US7] Implement system status route in plugins/auth-enterprise/src/routes.ts (GET /api/v1/status: gateway health, policy engine status, OPA sidecar status, connector statuses, DB connectivity per admin-api.md contract)
- [x] T147 [US7] Implement operational metrics route in plugins/auth-enterprise/src/routes.ts (GET /api/v1/metrics: active users, auto-responses sent, tasks discovered, model calls, policy evaluations, audit entries per admin-api.md contract and SC-002/SC-009)
- [x] T148 [US7] Implement audit export endpoint in plugins/audit-enterprise/src/routes.ts (GET /api/v1/audit/export?from=&to=&format=csv|json per audit-api.md contract, require enterprise_admin role)
- [x] T149 [US7] Implement model routing policy enforcement in plugins/policy-engine/src/evaluator/model-router.ts (registerHook on before_model_resolve, route based on data classification per policy: block external models for confidential data, route to self-hosted)
- [x] T150 [US7] Write OpenAPI spec for admin API endpoints in plugins/auth-enterprise/openapi.yaml
- [x] T151 [US7] Write unit tests for admin endpoints in plugins/auth-enterprise/tests/admin/ (tenant listing, connector CRUD, status aggregation, metrics collection, role authorization)

**Checkpoint**: User Story 7 complete. Admins manage policies, connectors, tenants via API. Policy hierarchy enforced. Audit log queryable and exportable. Model routing governed by classification.

---

## Phase 10: K8s Operator

**Purpose**: Kubernetes operator for deploying and managing OpenClaw Enterprise instances

- [x] T152 Implement CRD types for OpenClawInstance and PolicyBundle in operator/api/v1/types.go (per quickstart.md CR structure: deployment mode, replicas, auth config, storage refs, integrations)
- [x] T153 Generate CRD manifests from types using controller-gen in operator/config/crd/
- [x] T154 Implement OpenClawInstance reconciler in operator/internal/controller/instance_controller.go (create/update gateway pods, OPA sidecars, configure storage secrets, manage replicas)
- [x] T155 Implement PolicyBundle reconciler in operator/internal/controller/policy_controller.go (validate and apply PolicyBundle CRs, trigger hot-reload)
- [x] T156 [P] Implement admission webhook for policy validation in operator/internal/webhook/policy_webhook.go (validate hierarchy constraints before CR admission)
- [x] T157 [P] Create sample CR manifests in operator/config/samples/ (openclaw-instance.yaml, enterprise-policy.yaml per quickstart.md)
- [x] T158 [P] Create operator RBAC configuration in operator/config/rbac/ (service account, cluster role, role bindings)
- [x] T159 Create operator Dockerfile with container image scanning configuration and deployment manifest in operator/config/manager/
- [x] T160 Write unit tests for operator reconcilers in operator/tests/ (instance creation, replica scaling, policy validation, webhook rejection)

---

## Phase 11: Polish and Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, production readiness, and documentation

### Connector Write Tools

- [x] T161 [P] Implement email_draft and email_send write tools in plugins/connector-gmail/src/tools/write.ts (ConnectorWriteResult per contract, policy-gated, AI disclosure on sent emails)
- [x] T162 [P] Implement calendar_create and calendar_modify write tools in plugins/connector-gcal/src/tools/write.ts (ConnectorWriteResult per contract, policy-gated)

### Health and Production Readiness

- [x] T163 [P] Implement health check for every plugin via gateway status system (plugins/*/src/health.ts)
- [x] T164 [P] Implement data export and deletion for user data per FR-041 in plugins/audit-enterprise/src/export/user-data.ts
- [x] T165 Configure dependency audit and vulnerability scanning in CI pipeline (constitution: update within 7 days for critical CVEs)

### Documentation

- [x] T166 [P] Create UPSTREAM.md documenting upstream contribution proposals and status
- [x] T167 [P] Create COMPATIBILITY.md documenting supported OpenClaw versions, OPA versions, and K8s version ranges
- [x] T168 Run quickstart.md validation: deploy instance per steps 1-6 and verify all checklist items pass
- [x] T169 Perform load testing for 500 concurrent users per FR-045 and document results

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phases 3-9)**: All depend on Foundational phase completion
  - US1 (Phase 3): Can start after Phase 2 — no dependencies on other stories
  - US2 (Phase 4): Can start after Phase 2 — uses connectors from US1 but independently testable
  - US3 (Phase 5): Depends on Jira read tools from US1 (T067) for write tool context
  - US4 (Phase 6): Can start after Phase 2 — independent protocol layer
  - US5 (Phase 7): Uses connectors from US1 for data sources — independently testable
  - US6 (Phase 8): Uses task data from US1 — independently testable with mock data
  - US7 (Phase 9): Can start after Phase 2 — extends policy/audit/auth from foundational
- **K8s Operator (Phase 10)**: Can start after Phase 1 (Go module) — independent of plugin development
- **Polish (Phase 11)**: Depends on relevant user stories being complete

### Within Each User Story

- Plugin scaffold before implementation
- Read tools before write tools
- Services before hooks
- Core implementation before SKILL.md
- Tests after implementation (verify >80% coverage)
- README after implementation
- All implementations call policy.evaluate and audit.log

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T003-T007)
- All database migrations marked [P] can run in parallel (T011-T016)
- All connector scaffolds can run in parallel (T054, T060, T066, T072, T078)
- All connector read tool implementations can run in parallel (T055, T061, T067, T073, T079)
- All connector test and README tasks marked [P] can run in parallel
- K8s Operator (Phase 10) can proceed in parallel with plugin phases (Phases 3-9)
- US4 (OCIP) can proceed in parallel with US2 and US3
- US7 (Admin) can proceed in parallel with US5 and US6

---

## Parallel Example: User Story 1

```bash
# Launch all connector scaffolds in parallel:
Task: "Scaffold connector-gmail plugin in plugins/connector-gmail/"
Task: "Scaffold connector-gcal plugin in plugins/connector-gcal/"
Task: "Scaffold connector-jira plugin in plugins/connector-jira/"
Task: "Scaffold connector-github plugin in plugins/connector-github/"
Task: "Scaffold connector-gdrive plugin in plugins/connector-gdrive/"

# Launch all connector read tools in parallel:
Task: "Implement email_read and email_search tools in plugins/connector-gmail/src/tools/read.ts"
Task: "Implement calendar_read and calendar_search tools in plugins/connector-gcal/src/tools/read.ts"
Task: "Implement jira_read and jira_search tools in plugins/connector-jira/src/tools/read.ts"
Task: "Implement github_pr_read and github_issue_read tools in plugins/connector-github/src/tools/read.ts"
Task: "Implement gdrive_read and gdrive_search tools in plugins/connector-gdrive/src/tools/read.ts"

# Launch all connector tests and READMEs in parallel:
Task: "Write unit tests for connector-gmail in plugins/connector-gmail/tests/"
Task: "Write unit tests for connector-gcal in plugins/connector-gcal/tests/"
Task: "Write unit tests for connector-jira in plugins/connector-jira/tests/"
Task: "Write unit tests for connector-github in plugins/connector-github/tests/"
Task: "Write unit tests for connector-gdrive in plugins/connector-gdrive/tests/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (5 connectors + task intelligence)
4. **STOP and VALIDATE**: Test daily briefing independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> Deploy/Demo (MVP!)
3. Add User Story 2 -> Test independently -> Deploy/Demo
4. Add User Story 3 -> Test independently -> Deploy/Demo
5. Add User Story 4 -> Test independently -> Deploy/Demo
6. Add User Story 5 -> Test independently -> Deploy/Demo
7. Add User Story 6 -> Test independently -> Deploy/Demo
8. Add User Story 7 -> Test independently -> Deploy/Demo
9. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (connectors + task intelligence)
   - Developer B: User Story 4 (OCIP — independent protocol layer)
   - Developer C: K8s Operator (Go — independent codebase)
3. After US1 completes:
   - Developer A: User Story 2 (auto-response)
   - Developer D: User Story 3 (work tracking — needs Jira write tools)
4. After US2/US3:
   - Developer A: User Story 5 (org intelligence)
   - Developer D: User Story 6 (visualization)
5. User Story 7 (admin) can run in parallel with US5/US6

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All plugins depend on policy-engine and audit-enterprise from Phase 2
- K8s Operator is Go and can develop in parallel with TypeScript plugins
- Admin UI is deferred to post-MVP; this plan delivers the API layer first
- Slack data is accessed via OpenClaw's existing ChannelPlugin, not an enterprise connector
