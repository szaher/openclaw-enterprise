# ADR-001: OPA Over Cedar for Policy Evaluation

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/001-opa-over-cedar.md` |

---

## Context

The system requires a policy evaluation engine to enforce authorization and access control decisions across multiple gateways. Two primary candidates were evaluated: Open Policy Agent (OPA) with Rego, and Cedar. The choice of policy engine has deep implications for ecosystem integration, developer experience, and operational patterns.

Key requirements:

- Policy evaluation must run as a sidecar alongside each tenant's gateway instance.
- The policy engine must integrate naturally with Kubernetes deployments.
- Policy authors need strong tooling for testing and debugging.
- The engine must have long-term community support and ecosystem maturity.

---

## Decision

Use Open Policy Agent (OPA) with Rego for policy evaluation instead of Cedar.

OPA runs as a sidecar container on each tenant gateway pod, accessible at `http://localhost:8181`. Each of the 7 policy domains (models, actions, integrations, agent-to-agent, features, data, audit) has its own Rego package.

---

## Rationale

- **Broader Kubernetes ecosystem**: OPA has wide adoption across the cloud-native landscape with integrations for Kubernetes, Envoy, Terraform, and many other tools. This reduces integration effort and provides proven operational patterns.

- **Kubernetes-native sidecar pattern**: OPA is designed to run as a sidecar container, which fits naturally into the multi-gateway architecture where each gateway tenant has its own policy engine instance (see [ADR-002](./002-multi-gateway-tenancy.md)).

- **CNCF graduated project**: OPA is a CNCF graduated project with a large and active community, ensuring long-term support, a wealth of shared knowledge, and production-proven reliability.

- **Extensive tooling**: OPA includes a built-in testing framework, REPL, and VS Code extension support, enabling a strong developer experience for policy authoring and debugging.

---

## Alternatives Considered

### Cedar

Cedar is a newer policy language developed by AWS with strong formal verification properties. However, it has less ecosystem maturity, fewer integrations with cloud-native tooling, and a smaller community. Its operational patterns are less proven in Kubernetes-native sidecar deployments.

---

## Consequences

### What becomes easier

- Integrating policy evaluation into Kubernetes deployments via the sidecar pattern.
- Leveraging existing OPA tooling for testing and debugging policies.
- Finding community resources, examples, and shared policies.
- Running independent policy evaluation per tenant without shared state.

### What becomes more difficult

- If Cedar matures and offers features that OPA lacks (e.g., formal verification), migrating would require rewriting all 7 Rego policy packages in a new language.
- OPA's Rego language has a learning curve that may be steeper than Cedar's more declarative syntax for some developers.

---

## Implementation

- OPA sidecar URL: `http://localhost:8181`
- Evaluate timeout: 5,000 ms
- Hot-reload interval: 10,000 ms
- 7 Rego packages in `plugins/policy-engine/rego/`
- OPA client: `plugins/policy-engine/src/evaluator/opa-client.ts`
