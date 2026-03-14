# OpenClaw Enterprise Admin Guide

This guide covers the administration of OpenClaw Enterprise (codename: Redclaw), the enterprise extension layer for the OpenClaw open-source AI assistant. OpenClaw Enterprise is self-hosted and open-source, designed around a plugin-first architecture that extends OpenClaw via plugins rather than forking.

## Core Admin Capabilities

OpenClaw Enterprise provides the following administrative capabilities:

| Capability | Description | Guide |
|---|---|---|
| Policy Engine | Hierarchical OPA-based policy engine with 7 domains and graduated autonomy | [Policy Engine](policy-engine.md) |
| Data Classification | Four-level classification system with propagation and model routing | [Data Classification](data-classification.md) |
| Connectors | OAuth-based integrations with Gmail, GCal, Jira, GitHub, GDrive | [Connectors](connectors.md) |
| Audit Logging | Immutable, append-only audit trail for all actions | [Audit Log](audit-log.md) |
| RBAC and SSO | OIDC-based SSO with four built-in roles | [RBAC and SSO](rbac-sso.md) |

## Architecture Overview

OpenClaw Enterprise follows several key architectural principles:

- **Upstream First** -- All functionality is delivered via the OpenClaw plugin API (`registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, `registerContextEngine`). The upstream OpenClaw codebase is never forked.
- **Policy Over Code** -- Behavior is defined by a hierarchical policy engine (OPA with Rego policies), not hardcoded logic. Administrators control what the system can and cannot do through policy, not source code changes.
- **Least Privilege By Default** -- All actions are deny-by-default. Connectors start read-only. The policy engine fails closed (if OPA is unreachable, all actions are denied).
- **Data Classification Travels With Data** -- Every piece of data carries its classification level. Summaries, derivatives, and agent-to-agent exchanges all inherit classification from their source material.

## Deployment Components

A production OpenClaw Enterprise deployment includes:

- **15 TypeScript plugins** running on Node.js >= 22 (strict mode)
- **1 Go-based Kubernetes operator** managing CRDs, reconcilers, webhooks, and RBAC
- **OPA sidecar** for policy evaluation (localhost:8181)
- **PostgreSQL database** (no SQLite in production) with 7 migrations
- **7 Rego policy files** covering all policy domains

## Getting Started

1. Deploy the Kubernetes operator and CRDs (see operator documentation)
2. Configure [SSO/OIDC authentication](rbac-sso.md) with your identity provider
3. Set up [enterprise policies](policy-engine.md) for your organization
4. Configure [data classification](data-classification.md) defaults
5. Enable and configure [connectors](connectors.md) for your integrations
6. Verify [audit logging](audit-log.md) is operational

## Quick Reference: Admin API Endpoints

| Endpoint | Method | Description | Required Role |
|---|---|---|---|
| `/api/v1/policies` | GET, POST, PUT, DELETE | Policy management | `org_admin`+ |
| `/api/v1/connectors` | GET | Connector status and configuration | `org_admin`+ |
| `/api/v1/audit` | GET | Query audit log | `org_admin`+ |
| `/api/v1/audit/export` | GET | Export audit data | `enterprise_admin` |
| `/api/v1/admin/tenants` | GET, POST, PUT | Tenant management | `enterprise_admin` |
| `/api/v1/admin/status` | GET | System status | `enterprise_admin` |
| `/api/v1/admin/metrics` | GET | System metrics | `enterprise_admin` |
