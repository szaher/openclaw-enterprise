# Compatibility Matrix

This page documents supported dependency versions, features used per dependency, and the breaking change policy.

## Supported Versions

### OpenClaw

| OpenClaw Version | Enterprise Version | Status |
|-----------------|-------------------|--------|
| 1.x (latest) | 0.1.0 | Supported (development target) |

Enterprise plugins use only the public OpenClaw plugin API. Version compatibility is maintained by:

- Using only stable `registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, `registerContextEngine` APIs
- No internal or private API usage
- Semantic versioning for breaking changes

### OPA (Open Policy Agent)

| OPA Version | Status |
|------------|--------|
| 0.60+ | Supported |
| 0.55--0.59 | Compatible (untested) |
| < 0.55 | Unsupported |

OPA is deployed as a sidecar at `localhost:8181`. The enterprise plugins use the REST API v1 (`/v1/data/`), which has been stable across OPA versions.

### Kubernetes

| K8s Version | Operator Status |
|------------|----------------|
| 1.28+ | Supported |
| 1.26--1.27 | Compatible (untested) |
| < 1.26 | Unsupported |

### PostgreSQL

| PostgreSQL Version | Status |
|-------------------|--------|
| 16.x | Supported (primary target) |
| 15.x | Supported |
| 14.x | Compatible |
| < 14 | Unsupported |

### Node.js

| Node.js Version | Status |
|----------------|--------|
| 22.x (LTS) | Supported (primary target) |
| 20.x (LTS) | Compatible |
| < 20 | Unsupported |

### Go (Operator)

| Go Version | Status |
|-----------|--------|
| 1.22+ | Supported |
| 1.21 | Compatible |
| < 1.21 | Unsupported |

## Status Definitions

| Status | Meaning |
|--------|---------|
| **Supported** | Actively tested in CI. Bugs are treated as high priority. |
| **Compatible** | Expected to work based on API stability. Not tested in CI. Best-effort support. |
| **Unsupported** | Known or expected incompatibilities. No support provided. |

## Features Used per Dependency

### Kubernetes Features

| Feature | Minimum K8s Version | Used By |
|---------|---------------------|---------|
| Custom Resource Definitions v1 | 1.16 | Operator (OpenClawInstance, PolicyBundle CRDs) |
| Admission Webhooks v1 | 1.16 | Operator (PolicyBundle validation) |
| `autoscaling/v2` HPA | 1.23 | HPA for gateway pods |
| `policy/v1` PodDisruptionBudget | 1.21 | Gateway availability during disruptions |
| `controller-runtime` v0.17+ | 1.28 | Operator framework |

### PostgreSQL Features

| Feature | Minimum PG Version | Used By |
|---------|---------------------|---------|
| Table partitioning (PARTITION BY RANGE) | 10 | Audit log (audit_entries partitioned by month) |
| JSONB columns and operators | 9.4 | Connector data, task intelligence, policy metadata |
| Row-level security | 9.5 | Planned for multi-tenant data isolation |
| TLS connections (`sslmode=verify-full`) | 9.1 | All database connections in production |
| `pg_stat_statements` | 9.2 | Performance monitoring (optional) |

### OPA Features

| Feature | Minimum OPA Version | Used By |
|---------|---------------------|---------|
| REST API v1 (`/v1/data/`) | 0.10 | Policy evaluation from gateway |
| Bundle API | 0.12 | Policy loading from ConfigMaps |
| Health endpoint (`/health`) | 0.17 | Liveness probe |
| Decision logging | 0.14 | Audit trail for policy decisions |
| Rego v1 syntax | 0.55 | All policy definitions |

### Node.js Features

| Feature | Minimum Node.js Version | Used By |
|---------|------------------------|---------|
| ES Modules (stable) | 16 | All enterprise plugins |
| `fetch` API (built-in) | 18 | Connector HTTP clients |
| `node:test` runner | 20 | Unit and integration tests |
| TypeScript 5.x strict mode | 22 (LTS) | All plugin source code |

### Go Features (Operator)

| Feature | Minimum Go Version | Used By |
|---------|---------------------|---------|
| Generics | 1.18 | Internal utility functions |
| `slog` structured logging | 1.21 | Operator logging |
| `controller-runtime` v0.17+ | 1.22 | Operator framework |

## Full Compatibility Summary

The following table shows the full matrix of dependencies and their version requirements:

| Dependency | Primary | Supported | Compatible | Unsupported |
|-----------|---------|-----------|------------|-------------|
| OpenClaw | 1.x latest | 1.x | -- | < 1.0 |
| OPA | 0.60+ | 0.60+ | 0.55--0.59 | < 0.55 |
| Kubernetes | 1.28+ | 1.28+ | 1.26--1.27 | < 1.26 |
| PostgreSQL | 16.x | 15.x--16.x | 14.x | < 14 |
| Node.js | 22.x | 22.x | 20.x | < 20 |
| Go | 1.22+ | 1.22+ | 1.21 | < 1.21 |

## Breaking Change Policy

OpenClaw Enterprise follows [Semantic Versioning 2.0.0](https://semver.org/):

- **Patch versions** (0.1.x): Bug fixes and security patches. No configuration changes required.
- **Minor versions** (0.x.0): New features. May require configuration changes (new environment variables, CR spec fields). Backward-compatible.
- **Major versions** (x.0.0): Breaking changes. May require migration scripts, CR spec updates, or data migrations.

### Deprecation Process

1. **Announcement:** Deprecated features are documented in the CHANGELOG and release notes.
2. **Grace period:** Minimum **30-day deprecation notice** before removal for API changes.
3. **Migration guide:** Breaking changes include a migration guide with step-by-step instructions.
4. **Tooling:** Where feasible, automated migration scripts are provided.

### What Constitutes a Breaking Change

| Category | Breaking | Non-Breaking |
|----------|---------|-------------|
| CR spec fields | Removing a field, changing field type | Adding an optional field with a default |
| Environment variables | Removing a variable, changing semantics | Adding a new variable with a default |
| API routes | Removing an endpoint, changing response schema | Adding a new endpoint |
| Policy engine | Changing evaluation semantics | Adding new policy domains |
| Database schema | Removing columns, changing types | Adding columns with defaults |

### Upgrade Path

Always upgrade one minor version at a time. For example, to upgrade from 0.1.x to 0.3.x:

```
0.1.x -> 0.2.x (apply 0.2.x migration) -> 0.3.x (apply 0.3.x migration)
```

Check the CHANGELOG for each version's migration requirements before upgrading.
