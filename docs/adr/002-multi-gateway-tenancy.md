# ADR-002: Multi-Gateway Approach for Multi-Tenancy

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

The system must support multi-tenancy with strong isolation guarantees. Two approaches were considered: running a single shared gateway with session-level isolation, or deploying one OpenClaw Gateway instance per tenant managed by a Kubernetes operator. The choice affects isolation strength, scaling behavior, failure domains, and resource efficiency.

## Decision

Use a multi-gateway approach where one OpenClaw Gateway is deployed per tenant, managed by a Kubernetes operator, rather than session isolation within a single gateway.

## Rationale

The multi-gateway approach provides the strongest guarantees across several dimensions:

- **Strongest isolation**: Each tenant gets a dedicated gateway instance, eliminating any risk of cross-tenant data leakage or interference at the process level.
- **Independent scaling**: Each tenant's gateway can be scaled independently based on their specific load patterns without affecting other tenants.
- **Independent policy engines**: Each gateway runs its own OPA sidecar, ensuring policy evaluation is completely isolated per tenant.
- **Simpler failure domains**: A failure in one tenant's gateway does not impact other tenants. Blast radius is contained to a single tenant.

## Alternatives Considered

- **Session isolation within a single gateway**: Running a single shared gateway with logical isolation at the session level. This approach uses fewer resources at low tenant counts but introduces shared failure domains, more complex isolation logic, and potential for noisy-neighbor problems. Policy engine state would need to be carefully partitioned, adding complexity.

## Consequences

- **Easier**: Reasoning about tenant isolation, debugging tenant-specific issues, applying per-tenant resource limits, performing tenant-specific upgrades or rollbacks.
- **More difficult**: Higher base resource usage at low tenant counts since each tenant requires at least one gateway pod and its sidecar containers. The Kubernetes operator must manage the lifecycle of many gateway instances as tenant count grows.
