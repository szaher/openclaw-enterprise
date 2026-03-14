---
title: What Is OpenClaw Enterprise?
description: Overview of OpenClaw, OpenClaw Enterprise, and the principles behind the project
---

# What Is OpenClaw Enterprise?

## OpenClaw: The Foundation

OpenClaw is an open-source personal AI assistant. It connects to your tools -- email, calendar, code repositories, documents, messaging -- and helps you manage your work through natural language conversation. OpenClaw runs as a Gateway that loads plugins, each plugin providing tools the AI agent can use on your behalf.

OpenClaw is powerful for individuals. But enterprises need more: governance, security, audit trails, cross-team coordination, and centralized policy control. That is what OpenClaw Enterprise provides.

## OpenClaw Enterprise: The Extension Layer

OpenClaw Enterprise is a set of plugins that extend OpenClaw with enterprise-grade capabilities. It is not a fork. It is not a separate product. It is a layer that loads into the same OpenClaw Gateway and adds:

- **Hierarchical policy governance** -- enterprise, org, team, and user-level policies that control what the assistant can and cannot do
- **Data classification** -- every piece of data the assistant touches is labeled (public, internal, confidential, restricted) and that classification travels with the data everywhere
- **Graduated autonomy** -- configurable levels of human oversight (autonomous, notify, approve, block) for every action
- **Immutable audit logging** -- every action, data access, model call, and policy decision is recorded in an append-only log
- **Cross-system task intelligence** -- task discovery, deduplication, and priority scoring across all connected systems
- **Agent-to-agent communication** -- secure, policy-governed exchanges between assistants using the Open Claw Interchange Protocol (OCIP)
- **Enterprise connectors** -- policy-governed access to Gmail, Google Calendar, Jira, GitHub, and Google Drive (MVP), with more planned
- **Kubernetes-native deployment** -- a custom operator with CRD-based configuration for managing multi-tenant deployments

The result: every knowledge worker gets a personal AI assistant that operates within the boundaries defined by their enterprise, their organization, and their team.

## Key Value Proposition

OpenClaw Enterprise turns a personal AI assistant into an enterprise-ready platform. It solves the fundamental tension between individual productivity and organizational control:

- **For knowledge workers**: the assistant scans all your tools, prioritizes your work, handles routine communications, keeps your tickets updated, and gives you a clear picture of what matters most -- every day, automatically.
- **For enterprise administrators**: every assistant action is governed by policy, classified by data sensitivity, logged immutably, and auditable. You define the boundaries; the assistant operates within them.
- **For security teams**: data classification is enforced at every layer. Raw user data is processed and discarded. Model routing respects classification. Fail-closed behavior ensures safety when systems are degraded.

## Core Principles

OpenClaw Enterprise is built on five core principles that guide every design decision:

### Upstream First

We extend OpenClaw via its plugin system. We do not fork it. Every enterprise feature is built using OpenClaw's public APIs: `registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, and `registerContextEngine`. If a capability requires modifying OpenClaw core, we propose it upstream first. We do not carry divergent patches.

### Policy Over Code

Enterprise behavior is defined by declarative policies evaluated by OPA (Open Policy Agent), not hardcoded in application logic. If a behavior might differ across organizations, teams, or users, it belongs in the policy engine. The answer to "should we allow X?" is always "whatever the policy says" -- never a boolean constant in source code.

### Plugin and Skill Pairs

Every enterprise capability is built as a **plugin** (registers tools, services, hooks, and routes on the platform) paired with a **skill** (a SKILL.md document that teaches the AI agent when and how to use those tools). Neither is complete without the other. The plugin provides the capability; the skill provides the intelligence.

### Least Privilege By Default

The safe state is "do nothing." Every connector is read-only by default; write access requires explicit policy authorization. Every tool is deny-by-default for new users. Every agent-to-agent exchange is information-only; commitments require human approval. When the policy engine is unreachable, all actions are denied.

### Transparency Is Non-Negotiable

Users always know what the assistant did on their behalf, what data it accessed, which model processed their data, when it communicated with another agent, and what was shared versus withheld. Admins always know what every assistant instance is doing, what policies are in effect, and what data is flowing where.

## Self-Hosted, Open-Source, No SaaS

OpenClaw Enterprise is not a SaaS product. It is designed to run on your infrastructure:

- **Self-hosted**: deploy on your own Kubernetes cluster, behind your own firewall, connected to your own identity provider
- **Open-source**: the source code is available for audit, customization, and contribution
- **No vendor lock-in**: your data stays on your infrastructure; there is no phone-home, no telemetry sent externally, no cloud dependency
- **Your models**: route AI requests to any model provider you choose -- or to self-hosted models on your own infrastructure

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Enterprise plugins | TypeScript (strict mode), Node.js 22+ | All enterprise capabilities |
| Kubernetes operator | Go | Deployment lifecycle management |
| Policy evaluation | OPA with Rego policies | Declarative policy enforcement |
| Primary database | PostgreSQL 16+ | Tasks, policies, audit logs, state |
| Cache | Redis 7+ | Session caching, policy caching |
| Visualizations | D3.js via OpenClaw Canvas | Interactive graphs, matrices, mind maps |
| Authentication | SSO/OIDC | Enterprise identity integration |

!!! note "No Python in production"
    The production runtime is Node.js, aligned with OpenClaw core. Python may be used for scripts and utilities but is not part of the production system.

## What's Next

- [Architecture Overview](architecture.md) -- see how the components fit together
- [Key Concepts](concepts.md) -- learn the vocabulary used throughout the documentation
- [Quickstart Guide](quickstart.md) -- deploy a working instance
