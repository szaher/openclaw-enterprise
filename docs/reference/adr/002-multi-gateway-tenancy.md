# ADR-002: Multi-Gateway Approach for Multi-Tenancy

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/002-multi-gateway-tenancy.md` |

---

## Context

The system must support multi-tenancy with strong isolation guarantees. Two approaches were considered: running a single shared gateway with session-level isolation, or deploying one OpenClaw Gateway instance per tenant managed by a Kubernetes operator. The choice affects isolation strength, scaling behavior, failure domains, and resource efficiency.

Key forces:

- Enterprise customers require strong tenant isolation for compliance.
- Each tenant may have different load patterns and scaling requirements.
- Policy evaluation must be isolated per tenant.
- Failure in one tenant must not affect others.

---

## Decision

Use a multi-gateway approach where one OpenClaw Gateway is deployed per tenant, managed by a Kubernetes operator, rather than session isolation within a single gateway.

The Go-based Kubernetes operator (`operator/`) manages the lifecycle of gateway instances using Custom Resource Definitions (CRDs). Each tenant gateway pod includes an OPA sidecar for policy evaluation.

---

## Rationale

- **Strongest isolation**: Each tenant gets a dedicated gateway instance, eliminating any risk of cross-tenant data leakage or interference at the process level.

- **Independent scaling**: Each tenant's gateway can be scaled independently based on their specific load patterns without affecting other tenants.

- **Independent policy engines**: Each gateway runs its own OPA sidecar (see [ADR-001](./001-opa-over-cedar.md)), ensuring policy evaluation is completely isolated per tenant.

- **Simpler failure domains**: A failure in one tenant's gateway does not impact other tenants. Blast radius is contained to a single tenant.

---

## Alternatives Considered

### Session isolation within a single gateway

Running a single shared gateway with logical isolation at the session level. This approach uses fewer resources at low tenant counts but introduces shared failure domains, more complex isolation logic, and potential for noisy-neighbor problems. Policy engine state would need to be carefully partitioned, adding complexity.

---

## Consequences

### What becomes easier

- Reasoning about tenant isolation.
- Debugging tenant-specific issues.
- Applying per-tenant resource limits.
- Performing tenant-specific upgrades or rollbacks.
- Ensuring policy evaluation is completely independent per tenant.

### What becomes more difficult

- Higher base resource usage at low tenant counts since each tenant requires at least one gateway pod and its sidecar containers.
- The Kubernetes operator must manage the lifecycle of many gateway instances as tenant count grows.
- Cross-tenant operations (e.g., enterprise-wide metrics) require aggregating data from multiple gateway instances.

---

## Implementation

- Kubernetes operator: `operator/` (Go)
- CRDs define tenant gateway specifications
- Reconciler manages gateway pod lifecycle
- Admission webhook validates tenant configurations
- RBAC rules enforce least-privilege for operator service account
