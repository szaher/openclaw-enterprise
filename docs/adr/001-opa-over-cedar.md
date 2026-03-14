# ADR-001: Use OPA Over Cedar for Policy Evaluation

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

The system requires a policy evaluation engine to enforce authorization and access control decisions across multiple gateways. Two primary candidates were evaluated: Open Policy Agent (OPA) with Rego, and Cedar. The choice of policy engine has deep implications for ecosystem integration, developer experience, and operational patterns.

## Decision

Use Open Policy Agent (OPA) with Rego for policy evaluation instead of Cedar.

## Rationale

OPA provides several advantages that make it the stronger choice for this project:

- **Broader ecosystem**: OPA has wide adoption across the cloud-native landscape with integrations for Kubernetes, Envoy, Terraform, and many other tools.
- **Kubernetes-native sidecar pattern**: OPA is designed to run as a sidecar container, which fits naturally into the multi-gateway architecture where each gateway tenant has its own policy engine instance.
- **Extensive tooling**: OPA includes a built-in testing framework, REPL, and VS Code extension support, enabling a strong developer experience for policy authoring and debugging.
- **Larger community**: OPA is a CNCF graduated project with a large and active community, ensuring long-term support and a wealth of shared knowledge and policies.

## Alternatives Considered

- **Cedar**: Cedar is a newer policy language developed by AWS with strong formal verification properties. However, it has less ecosystem maturity, fewer integrations with cloud-native tooling, and a smaller community. Its operational patterns are less proven in Kubernetes-native sidecar deployments.

## Consequences

- **Easier**: Integrating policy evaluation into Kubernetes deployments via the sidecar pattern. Leveraging existing OPA tooling for testing and debugging policies. Finding community resources and examples.
- **More difficult**: If Cedar matures and offers features that OPA lacks (e.g., formal verification), migrating would require rewriting all policies in a new language. OPA's Rego language has a learning curve that may be steeper than Cedar's more declarative syntax for some developers.
