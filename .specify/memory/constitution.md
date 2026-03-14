<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 (template) -> 1.0.0 (initial ratification)
  Bump rationale: MAJOR — first ratification of project constitution

  Modified principles: N/A (initial creation)

  Added sections:
    - Mission
    - Identity
    - Core Principles (10 principles: Upstream First, Policy Over Code,
      Humans Own Decisions, Data Never Leaves Its Classification,
      Least Privilege By Default, Transparency Is Non-Negotiable,
      Plugin + Skill Pairs, Simple Things Should Be Simple,
      Measure Everything, Enterprise Means Boring)
    - Technical Boundaries
    - Policy Engine Constitution
    - Agent-to-Agent Protocol (OCIP) Constitution
    - Security Constitution
    - Quality Constitution
    - Contribution Constitution
    - Scope Boundaries
    - Release Philosophy
    - Success Metrics
    - Non-Negotiables
    - Governance

  Removed sections: N/A (initial creation)

  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ No update needed
      (Constitution Check section is generic: "[Gates determined
      based on constitution file]")
    - .specify/templates/spec-template.md — ✅ No update needed
      (No constitution-specific references)
    - .specify/templates/tasks-template.md — ✅ No update needed
      (No constitution-specific references)
    - .specify/templates/commands/*.md — ✅ N/A (no files exist)

  Follow-up TODOs: None
-->

# OpenClaw Enterprise Constitution

This is the governing document for the OpenClaw Enterprise project.
It defines what we are, what we believe, what we build, and how we
make decisions. Every contributor, design decision, and PR MUST be
evaluated against this constitution.

## Mission

Make every knowledge worker in an enterprise 10x more effective by
giving them a secure, policy-governed AI assistant that works across
all their tools — without compromising the organization's control
over its data, systems, and processes.

## Identity

**What we are:**

- An enterprise extension layer for OpenClaw — not a fork, not a
  competitor, not a replacement
- A plugin-first architecture that adds enterprise governance,
  security, and intelligence to a proven personal AI assistant
  platform
- An open-source project that enterprises can self-host, audit,
  and customize

**What we are not:**

- We are not building another chatbot
- We are not building another workflow automation tool (Zapier, n8n)
- We are not building another AI coding assistant
- We are not a SaaS product (self-hosted first, always)

## Core Principles

### I. Upstream First

We extend OpenClaw; we MUST NOT fork it. Every design decision MUST
answer: "Can this work as a plugin? Can this be contributed upstream?"

- If a capability requires modifying OpenClaw core, we MUST propose
  it upstream first
- We MUST NOT carry patches that diverge from upstream
- If upstream rejects our proposal, we MUST find an alternative
  architecture that works within the plugin system

### II. Policy Over Code

Enterprise behavior MUST be defined by policy, not hardcoded.

- If a behavior might need to differ for different organizations,
  teams, or users, it MUST be configurable via the policy engine —
  not baked into the code
- The right answer to "should we allow X?" is never `true` or
  `false` — it is "whatever the policy says"

### III. Humans Own Decisions

The assistant acts, but humans decide.

- No action that commits a user to something (scheduling, sending,
  agreeing, closing, deleting) MUST happen without the appropriate
  level of human oversight as defined by policy
- The default is always "ask" — autonomy is earned through policy
  configuration, not assumed

### IV. Data Never Leaves Its Classification

Data has a classification. That classification travels with the data
through every system, every agent exchange, every model call, every
cache.

- An "internal" document summarized by the assistant produces an
  "internal" summary
- Data classification is metadata, not an afterthought

### V. Least Privilege By Default

The safe state is "do nothing."

- Every connector reads by default; write access requires policy
  authorization
- Every agent-to-agent exchange is information-only by default;
  commitments require human approval
- Every tool is deny-by-default for new users

### VI. Transparency Is Non-Negotiable

Users MUST always know:

- What the assistant did on their behalf
- What data the assistant accessed
- Which model processed their data
- When their agent communicated with another agent
- What was shared and what was withheld

Admins MUST always know:

- What every assistant instance is doing
- What policies are in effect
- What data is flowing where
- What models are being used and at what cost

### VII. Plugin + Skill Pairs

Every enterprise capability MUST be built as a **plugin** (platform
capability) paired with a **skill** (agent instructions).

- The plugin registers tools, services, hooks, and routes
- The skill teaches the agent when and how to use them
- Neither is complete without the other

### VIII. Simple Things Should Be Simple

- Setting up OpenClaw Enterprise for a 10-person team MUST take less
  than an hour
- The default configuration MUST be secure, useful, and require
  minimal decisions
- Complexity is available for those who need it, but never required

### IX. Measure Everything

Every feature MUST be measurable.

- "The assistant saved time" is not a metric
- "The assistant completed 47 auto-responses this week, saving an
  estimated 3.2 hours based on average response time" is a metric
- If we cannot measure it, we cannot justify it

### X. Enterprise Means Boring

Enterprise software MUST be reliable, predictable, and supportable.

- Prefer boring technology that works over exciting technology that
  might work
- Prefer clear error messages over silent failures
- Prefer explicit configuration over magic defaults
- Prefer audit logs over trust

## Technical Boundaries

### Language and Runtime

- **Enterprise plugins**: TypeScript, running on Node.js >= 22
  (aligned with OpenClaw)
- **K8s Operator**: Go (standard for Kubernetes operators)
- **Visualization**: HTML + TypeScript + D3.js (rendered via
  OpenClaw Canvas)
- **Policy engine**: OPA (Rego) or Cedar for policy evaluation,
  called from TypeScript
- **No Python in production runtime.** Python may be used for
  scripts, utilities, and data analysis, but the production system
  runs on Node.js to align with OpenClaw.

### Architecture Rules

- All enterprise features MUST be OpenClaw plugins. No exceptions.
- All enterprise agent behavior MUST be defined in OpenClaw skills.
  No exceptions.
- The policy engine is a single plugin that all other enterprise
  plugins depend on. It is the central authority.
- Enterprise connectors are plugins with `registerTool()` +
  `registerService()`, not ChannelPlugins. They are data sources,
  not chat channels.
- State MUST be stored in PostgreSQL. No SQLite in production.
  No filesystem-based state for shared data.
- Async communication between plugins MUST use the Gateway event
  system, not direct function calls.
- Every tool invocation MUST go through the policy engine before
  execution.

### Data Architecture Rules

- All data at rest MUST be encrypted (AES-256).
- All data in transit MUST be encrypted (TLS 1.3).
- Raw user data (email bodies, message content) MUST be processed
  and discarded. Only structured extractions (tasks, summaries,
  classifications) are persisted.
- Audit logs MUST be append-only. No updates. No deletes. Separate
  database/table.
- Vector embeddings for RAG MUST inherit the classification of
  their source data.
- User data MUST NOT be used for model training or fine-tuning.
  This is a hard rule, not a policy toggle.

### API Rules

- Enterprise admin API MUST be REST over HTTP, registered via
  `api.registerHttpRoute()`.
- All API endpoints MUST require authentication (SSO/OIDC token
  or gateway token).
- All API endpoints MUST be versioned (`/api/v1/...`).
- All API responses MUST include request ID for traceability.
- All mutating API calls MUST produce audit log entries.

### What We Will Not Build

- A custom LLM or foundation model
- A model training or fine-tuning pipeline
- A replacement for Jira, GitHub, Slack, or any tool we integrate
  with
- A general-purpose workflow automation engine (use Lobster)
- Mobile apps (use OpenClaw's existing iOS/Android nodes)
- A desktop app (use OpenClaw's existing macOS node)

## Policy Engine Constitution

The policy engine is the heart of the project. These rules govern
its design.

### Policy Hierarchy Is Absolute

```
Enterprise Policy (ceiling — cannot be overridden)
  └── Organization Policy (within enterprise bounds)
       └── Team Policy (within org bounds)
            └── User Preferences (within team bounds)
```

A lower level can restrict further but MUST NOT expand beyond the
parent level. An enterprise policy that says "no external model
calls" cannot be overridden by any org, team, or user.

### Policy Is Declarative

Policies MUST be YAML documents, not code. They MUST be
human-readable, version-controllable, auditable, and diffable.
No policy logic lives in TypeScript. All policy evaluation MUST
be done by OPA or Cedar.

### Policy Changes Are Audited

Every policy change MUST be logged: who changed it, what changed,
when, why (commit message required). Policy changes take effect
via hot-reload but MUST NOT be retroactive.

### Deny Is Always Safe

- If the policy engine is unreachable, the default MUST be deny.
- If a policy is ambiguous, the default MUST be deny.
- If a classification is unknown, the default MUST be the highest
  classification level.
- Fail closed, not open.

### Policy Domains

The policy engine governs exactly these domains:

| Domain | Controls |
|---|---|
| **Models** | Which AI models can be used, data classification routing per model, cost limits |
| **Actions** | Which tool invocations are autonomous/notify/approve/blocked |
| **Integrations** | Which connectors are enabled, what permissions each has (read/write/admin) |
| **Agent-to-Agent** | Whether agents can communicate, exchange types allowed, round limits, classification gates |
| **Features** | Which enterprise features are enabled per scope (org/team/user) |
| **Data** | Classification levels, retention periods, what can be shared externally |
| **Audit** | What is logged, retention period, who can query, alert rules |

## Agent-to-Agent Protocol (OCIP) Constitution

### Agents Always Identify Themselves

Every message from an OpenClaw Enterprise agent MUST carry
machine-readable OCIP metadata. An agent MUST NOT pretend to be
human. No exceptions.

### Classification Is Enforced at the Sender

When Agent A sends data to Agent B, Agent A MUST filter the data
based on the classification level allowed for the exchange. The
receiver MUST NOT see data above its clearance. Filtering MUST
happen before transmission, not after receipt.

### Loops Have Hard Limits

Every agent-to-agent exchange MUST have a maximum round count
defined by policy. When the limit is reached, the exchange MUST
escalate to humans. There is no mechanism to extend the limit
within an exchange.

### Commitments Require Humans

An agent can share information autonomously. An agent MUST NOT
commit its user to anything (meetings, deadlines, agreements,
approvals) without human approval. This is structural, not
configurable.

### All Exchanges Are Auditable

Both sides of every agent-to-agent exchange MUST be logged.
Either user can review the full transcript. Admins can review
any exchange within their scope.

## Security Constitution

### Authentication

- Enterprise deployment MUST require SSO/OIDC. No password-only
  auth in production.
- OIDC claims MUST map to OpenClaw's operator roles and scopes.
- Service-to-service auth MUST use mTLS or signed tokens.
- All OAuth tokens for connectors MUST be stored in a secrets
  manager (K8s Secrets or Vault), never in config files.

### Authorization

- RBAC MUST be based on OIDC claims, mapped through the policy
  engine.
- Four built-in roles: Enterprise Admin, Org Admin, Team Lead,
  User.
- Custom roles are supported but MUST inherit from a built-in role.
- Role permissions MUST be defined in policy, not code.

### Audit

- Every action the assistant takes MUST be logged.
- Every piece of data accessed MUST be logged (source,
  classification, purpose).
- Every model call MUST be logged (model, token count, data
  classification of input).
- Every policy decision MUST be logged (policy applied, result,
  reason).
- Every agent-to-agent exchange MUST be logged (both sides, full
  transcript).
- Audit logs MUST be immutable and append-only.
- Audit log retention MUST be defined by policy (minimum 1 year
  for enterprise).

### Data Residency

- The policy engine can restrict which models are used based on
  data classification.
- Self-hosted models on the organization's infrastructure MUST
  always be available as a routing target.
- No data classified above "internal" MUST be sent to external
  model providers unless explicitly allowed by enterprise policy.
- The system MUST track and report data flows for compliance
  audits.

### Vulnerability Management

- Dependencies MUST be monitored and updated within 7 days for
  critical CVEs.
- Container images MUST be scanned before deployment.
- The security audit tool (`openclaw security audit`) MUST be
  extended with enterprise-specific checks and MUST pass before
  production deployment.

## Quality Constitution

### Testing

- Every plugin MUST have unit tests with >80% coverage.
- Every enterprise skill MUST have integration tests that verify
  the agent uses tools correctly.
- Policy engine MUST have exhaustive tests: every policy domain,
  every hierarchy level, every edge case.
- Agent-to-agent protocol MUST have end-to-end tests covering all
  exchange types, loop prevention, and classification enforcement.
- No PR MUST be merged without passing all tests.

### Documentation

- Every plugin MUST have a README describing: what it does, how to
  configure it, what policies govern it.
- Every enterprise skill MUST have usage examples.
- Every policy domain MUST have a reference document with examples.
- API endpoints MUST have OpenAPI specs.
- Architecture decisions MUST be recorded in ADRs (Architecture
  Decision Records).

### Backward Compatibility

- Policy format changes MUST be versioned. Old policies MUST
  continue to work.
- API changes MUST be versioned. Old API versions MUST be
  supported for at least 2 major releases.
- Plugin interfaces MUST follow semver. Breaking changes require
  a major version bump.
- OpenClaw upstream version compatibility MUST be tested and
  documented per release.

## Contribution Constitution

### Decision Making

- **Technical decisions** MUST be made by the maintainers through
  RFC (Request for Comments) documents.
- **Policy domain decisions** (what the policy engine should
  govern) MUST require an RFC with input from at least one
  enterprise user/operator.
- **Architecture decisions** MUST be recorded as ADRs in the
  repository.
- **Disagreements** are resolved by the project lead after hearing
  all perspectives. The decision and reasoning MUST be documented.

### Code Standards

- All code MUST be TypeScript (strict mode, no `any` types in
  production code).
- All code MUST pass ESLint with the project's configuration.
- All code MUST be formatted with Prettier.
- All commits MUST follow Conventional Commits format.
- All PRs MUST require at least one review from a maintainer.
- All PRs MUST include: tests, documentation updates (if
  applicable), and a clear description of what and why.

### Plugin Development Standards

- Every plugin MUST declare its dependencies on other enterprise
  plugins in its manifest.
- Every plugin MUST handle the policy engine being unavailable
  (fail closed).
- Every plugin MUST emit audit events for all state-changing
  operations.
- Every plugin MUST include a SKILL.md for its paired skill.
- Every plugin MUST include a health check accessible via the
  gateway status system.

### Upstream Contributions

- Before building a workaround for a missing OpenClaw feature,
  we MUST first propose it upstream.
- Upstream contributions MUST be tracked in a dedicated document.
- We MUST maintain a compatibility matrix showing which OpenClaw
  versions we support.

## Scope Boundaries

### In Scope

- Enterprise policy engine with hierarchical governance
- Agent-to-agent protocol (OCIP) with classification enforcement
- Enterprise connectors for: email (Gmail, Outlook), calendar
  (GCal, Outlook), issue tracking (Jira, Linear, GitHub Issues),
  documents (GDrive, Confluence, Notion), code (GitHub, GitLab)
- Task intelligence (cross-system discovery, prioritization,
  daily briefing)
- Auto-response engine (message classification, policy-governed
  responses)
- Work tracking automation (auto-update Jira/GitHub from code
  activity)
- Org news intelligence (filtering, relevance scoring, digest
  generation)
- Document change monitoring (detection, summarization, impact
  assessment)
- Visualization (task graphs, mind maps, workload views via
  Canvas)
- Enterprise security (SSO/OIDC, RBAC, audit logging, data
  classification)
- K8s Operator for deployment and lifecycle management
- Admin UI for policy management, audit review, and system
  monitoring

### Out of Scope

- Modifying OpenClaw core (we extend via plugins only)
- Building mobile or desktop apps (we use OpenClaw's existing
  apps)
- Model hosting or serving (we use existing inference servers)
- General-purpose workflow automation (we use Lobster for
  workflows)
- Data warehousing or analytics (we produce audit data; analysis
  tools consume it)
- End-user onboarding UI (we use OpenClaw's existing onboarding)

### Future Scope (Not Now, But Planned)

- Custom enterprise memory plugin with classification-aware
  retention
- Custom context engine for per-tenant data isolation
- Compliance reporting framework (SOC 2, GDPR, HIPAA)
- Multi-region deployment support
- Enterprise marketplace for sharing skills and plugins across
  organizations

## Release Philosophy

### Versioning

- Semantic versioning (semver) for all releases.
- Major versions for breaking changes (policy format, API, plugin
  interface).
- Minor versions for new features.
- Patch versions for bug fixes and security updates.

### Release Cadence

- Monthly minor releases (features).
- Weekly patch releases (as needed for bugs/security).
- Quarterly major releases (if breaking changes are needed).

### Compatibility

- Each release MUST declare the minimum and maximum OpenClaw
  version it supports.
- Each release MUST declare the OPA/Cedar version it requires.
- Each release MUST declare the K8s version range for the
  operator.
- Upgrade paths MUST be documented. Data migrations MUST be
  automated.

## Success Metrics

The project is succeeding if:

1. **An enterprise can deploy OpenClaw Enterprise in less than
   4 hours** from scratch (including K8s, SSO, and basic
   policies).
2. **Users report net time savings within 2 weeks** of adoption
   (measurable through the assistant's own metrics).
3. **Zero data leakage incidents** caused by classification
   enforcement failures.
4. **Policy changes take effect within 60 seconds** (hot-reload).
5. **The audit log can answer any "what happened?" question**
   about any assistant action, for any user, within the retention
   period.
6. **Agent-to-agent exchanges never produce infinite loops** or
   unauthorized data sharing.
7. **Every enterprise feature works with OpenClaw's existing
   messaging channels** without requiring channel modifications.
8. **Upstream OpenClaw upgrades do not break the enterprise
   layer** (tested in CI against upstream releases).

## Non-Negotiables

These are the things that, if violated, mean we have failed:

1. **Never fork OpenClaw.** If we cannot do it as a plugin, we
   redesign until we can or we contribute the extension point
   upstream.
2. **Never send classified data to an unauthorized model.** The
   policy engine MUST enforce model routing based on data
   classification. Always.
3. **Never act without appropriate oversight.** The graduated
   autonomy model (autonomous / notify / approve / block) MUST
   work correctly. A policy that says "require approval" MUST
   actually require approval.
4. **Never hide what the assistant did.** Users see everything
   their assistant does. Admins see everything within their scope.
   The audit log MUST be complete.
5. **Never store raw user data longer than needed.** Process and
   discard. Keep structured extractions only. The assistant is a
   processor, not a warehouse.

## Governance

This constitution is the supreme governing document for the
OpenClaw Enterprise project. All design decisions, PRs, and
architectural choices MUST comply with it.

### Amendment Procedure

1. Amendments MUST be proposed via an RFC document.
2. Amendments MUST be reviewed by at least two maintainers.
3. Amendments MUST include a migration plan for any existing code
   or policies that become non-compliant.
4. Amendments MUST be documented with rationale and the version
   MUST be incremented according to semver:
   - **MAJOR**: Backward-incompatible governance/principle
     removals or redefinitions.
   - **MINOR**: New principle/section added or materially expanded
     guidance.
   - **PATCH**: Clarifications, wording, typo fixes,
     non-semantic refinements.

### Compliance Review

- All PRs and reviews MUST verify compliance with this
  constitution.
- Complexity beyond what the constitution permits MUST be
  justified in writing.
- The plan template's "Constitution Check" section MUST be used
  to validate alignment before implementation begins.

### Runtime Guidance

For day-to-day development guidance, refer to CLAUDE.md and
project-specific documentation. This constitution provides the
principles; guidance files provide the procedures.

**Version**: 1.0.0 | **Ratified**: 2026-03-13 | **Last Amended**: 2026-03-13
