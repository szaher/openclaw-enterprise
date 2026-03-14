---
title: OpenClaw Enterprise
description: Enterprise extension layer for the OpenClaw open-source AI assistant
---

# OpenClaw Enterprise

**Turn a personal AI assistant into an enterprise-ready platform** -- without forking, without SaaS, without compromising control.

OpenClaw Enterprise is a self-hosted, open-source extension layer that adds enterprise governance, security, and intelligence to the [OpenClaw](https://openclaw.io) personal AI assistant. Built entirely as plugins, it layers policy-governed automation on top of OpenClaw's proven personal assistant platform, giving every knowledge worker a secure, auditable AI assistant that works across all their tools.

---

## Feature Highlights

<div class="grid cards" markdown>

-   **Policy Engine**

    ---

    Hierarchical policy governance (Enterprise > Org > Team > User) powered by OPA. Graduated autonomy levels -- autonomous, notify, approve, block -- for every action. Deny-by-default. Fail-closed. Policy changes hot-reload within 60 seconds.

    [:octicons-arrow-right-24: Learn more](admin-guide/policy-engine.md)

-   **Task Intelligence**

    ---

    Cross-system task discovery and deduplication across Gmail, Calendar, Jira, GitHub, and GDrive. Priority scoring based on deadlines, sender seniority, blocking relationships, and SLA timers. Daily briefings with time-block suggestions.

    [:octicons-arrow-right-24: Learn more](user-guide/daily-briefing.md)

-   **Auto-Response**

    ---

    Graduated auto-response engine that classifies incoming messages (critical, needs-response, informational, noise) and acts according to policy -- respond autonomously, queue for approval, or block. Every auto-response is logged and reviewable.

    [:octicons-arrow-right-24: Learn more](user-guide/auto-response.md)

-   **Work Tracking**

    ---

    Automatic Jira updates from GitHub activity. PR merges trigger ticket transitions, summary comments, and cross-references. End-of-day standup summaries generated from actual activity across all connected systems.

    [:octicons-arrow-right-24: Learn more](user-guide/work-tracking.md)

-   **OCIP Protocol**

    ---

    Open Claw Interchange Protocol for secure agent-to-agent communication. Classification-enforced data filtering, round limits with human escalation, dual-sided audit logging. Agents always identify themselves -- no impersonation.

    [:octicons-arrow-right-24: Learn more](user-guide/agent-to-agent.md)

-   **Org Intelligence**

    ---

    Personalized weekly digests of org-wide announcements scored by relevance. Document change monitoring with impact assessment. Consistency checking across related documents. Cosmetic changes are suppressed automatically.

    [:octicons-arrow-right-24: Learn more](user-guide/org-intelligence.md)

-   **Visualizations**

    ---

    Interactive D3.js visualizations rendered via OpenClaw Canvas. Task dependency graphs, Eisenhower priority matrices, workload views, and project mind maps organized by theme -- not by source system.

    [:octicons-arrow-right-24: Learn more](user-guide/visualizations.md)

-   **Audit and Compliance**

    ---

    Immutable, append-only audit log of every action, data access, model call, policy decision, and agent-to-agent exchange. Query any user's activity within seconds. Full data export and deletion support.

    [:octicons-arrow-right-24: Learn more](admin-guide/audit-log.md)

</div>

---

## Quick Links

| Section | Description |
|---|---|
| [Getting Started](getting-started/index.md) | What OpenClaw Enterprise is, how it works, and how to deploy it |
| [User Guide](user-guide/index.md) | Day-to-day usage of enterprise features |
| [Admin Guide](admin-guide/index.md) | Policy management, audit review, and system administration |
| [Deployment Guide](deployment/index.md) | Kubernetes operator, CRDs, scaling, and operations |
| [Architecture Decision Records](reference/adr/index.md) | Design decisions and their rationale |

---

## Why OpenClaw Enterprise?

### Self-Hosted and Open-Source

OpenClaw Enterprise is not a SaaS product. It runs on your infrastructure, under your control. The source code is open, auditable, and customizable. Your data never leaves your environment unless you explicitly configure it to.

### Plugin-First Architecture

Every enterprise capability is built as an OpenClaw plugin. There is no fork of OpenClaw core. This means you get upstream OpenClaw updates without breaking your enterprise layer, and you can enable or disable enterprise features independently.

### Policy Over Code

Enterprise behavior is defined by declarative policies evaluated by OPA -- not hardcoded in application logic. If a behavior might differ across organizations, teams, or users, it is governed by the policy engine. The answer to "should we allow X?" is always "whatever the policy says."

### Upstream Compatibility

OpenClaw Enterprise is tested against upstream OpenClaw releases in CI. Plugin APIs (`registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, `registerContextEngine`) are the only integration points. When upstream evolves, enterprise plugins evolve with it -- no patch maintenance, no divergence.

### Designed for Enterprise Scale

Built for up to 500 concurrent users per deployment with a multi-gateway tenancy model (one OpenClaw Gateway per tenant, managed by a Kubernetes operator). PostgreSQL for state, Redis for caching, OPA sidecars for policy evaluation -- all orchestrated by CRD-based configuration.
