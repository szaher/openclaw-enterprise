# OpenClaw Enterprise -- Reference Documentation

This section provides comprehensive technical reference for OpenClaw Enterprise (codename: Redclaw). These documents describe the data model, API surface, policy engine domains, inter-agent protocol, and architecture decisions in full detail.

## Contents

| Document | Description |
|----------|-------------|
| [Data Model](./data-model.md) | Complete entity definitions, field types, validation rules, retention policies, relationships, and database indexes |
| [API Reference](./api.md) | REST API endpoints grouped by plugin, authentication, request/response formats, error codes, and rate limiting |
| [Policy Domains](./policy-domains.md) | Detailed reference for all 7 policy domains with YAML examples, scope hierarchy, and OPA Rego evaluation rules |
| [OCIP Protocol](./ocip-protocol.md) | OpenClaw Interchange Protocol specification: envelope format, exchange semantics, classification enforcement, loop prevention, and cross-org rules |
| [Architecture Decision Records](./adr/index.md) | Index of all 8 ADRs with status, rationale, and consequences |

## Architecture Overview

OpenClaw Enterprise is a plugin-first extension layer for OpenClaw. It is self-hosted and open-source. The system is composed of:

- **15 TypeScript plugins** running on Node.js >= 22 in strict mode
- **1 Go Kubernetes operator** managing per-tenant gateway instances
- **7 PostgreSQL migrations** defining the operational and audit data stores
- **7 OPA Rego policies** covering all policy domains
- **OCIP protocol** for structured agent-to-agent communication

All behavior is governed by a policy engine (OPA) rather than hardcoded logic. Every capability is delivered as an independent plugin paired with its own SKILL.md file.

## Key Design Principles

1. **Upstream First** -- extend OpenClaw via plugins, never fork
2. **Policy Over Code** -- behavior defined by policy engine, not hardcoded
3. **Plugin + Skill Pairs** -- every capability = plugin + skill
4. **Least Privilege By Default** -- deny-by-default, fail closed
5. **Data Classification Travels With Data** -- classification metadata is attached at ingestion and persists through every operation

## Related Resources

- Source code: `plugins/` directory (TypeScript plugins), `operator/` directory (Go K8s operator)
- Database schemas: `db/migrations/`
- OPA policies: `plugins/policy-engine/rego/`
- Architecture decisions: `docs/adr/`
