# Compatibility Matrix

## Supported Versions

### OpenClaw
| OpenClaw Version | Enterprise Version | Status |
|-----------------|-------------------|--------|
| 1.x (latest)   | 0.1.0             | Supported (development target) |

Enterprise plugins use only the public OpenClaw plugin API. Version compatibility is maintained by:
- Using only stable `registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, `registerContextEngine` APIs
- No internal/private API usage
- Semantic versioning for breaking changes

### OPA (Open Policy Agent)
| OPA Version | Status |
|------------|--------|
| 0.60+      | Supported |
| 0.55-0.59  | Compatible (untested) |
| < 0.55     | Unsupported |

OPA is deployed as a sidecar (localhost:8181). The enterprise plugins use the REST API v1 (`/v1/data/`), which has been stable across OPA versions.

### Kubernetes
| K8s Version | Operator Status |
|------------|----------------|
| 1.28+      | Supported |
| 1.26-1.27  | Compatible (untested) |
| < 1.26     | Unsupported |

The operator uses:
- Custom Resource Definitions v1 (stable since K8s 1.16)
- Admission webhooks v1 (stable since K8s 1.16)
- controller-runtime v0.17+

### PostgreSQL
| PostgreSQL Version | Status |
|-------------------|--------|
| 16.x              | Supported (primary target) |
| 15.x              | Supported |
| 14.x              | Compatible |
| < 14               | Unsupported |

Features used:
- Table partitioning (audit_entries by month)
- JSONB columns and operators
- Row-level security (planned)
- TLS connections (sslmode=verify-full)

### Node.js
| Node.js Version | Status |
|----------------|--------|
| 22.x (LTS)    | Supported (primary target) |
| 20.x (LTS)    | Compatible |
| < 20            | Unsupported |

### Go (Operator)
| Go Version | Status |
|-----------|--------|
| 1.22+     | Supported |
| 1.21      | Compatible |
| < 1.21    | Unsupported |

## Breaking Change Policy

- Enterprise plugin versions follow semver
- Minor version bumps may require configuration changes
- Major version bumps may require migration scripts
- All breaking changes documented in CHANGELOG.md
- Minimum 30-day deprecation notice for API changes
