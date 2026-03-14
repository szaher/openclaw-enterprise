# ADR-003: One Plugin Per Enterprise Capability

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

The project requires multiple enterprise capabilities (14 in total) to be implemented as extensions. A decision is needed on whether to bundle all capabilities into a single monolithic enterprise plugin or to structure the project as one plugin per capability. This decision affects modularity, testability, deployment flexibility, and dependency management.

## Decision

Structure the project as one plugin per enterprise capability (14 plugins) rather than a monolithic enterprise plugin.

## Rationale

The one-plugin-per-capability approach aligns with the project's architectural principles:

- **Aligns with constitution principle VII (Plugin + Skill Pairs)**: Each plugin encapsulates a single capability and its associated skills, following the established architectural contract.
- **Independent testing and deployment**: Each plugin can be tested in isolation and deployed independently, enabling faster iteration and reducing the risk of changes in one capability breaking another.
- **Clear dependency graph**: The dependency relationships between plugins are explicit, with policy-engine serving as the root dependency. This makes the architecture easier to reason about and prevents hidden coupling.

## Alternatives Considered

- **Monolithic enterprise plugin**: Bundling all 14 capabilities into a single plugin. This would simplify deployment at the cost of tight coupling, larger blast radius for changes, slower test cycles, and an opaque dependency structure. It would violate the Plugin + Skill Pairs principle by mixing unrelated concerns.

## Consequences

- **Easier**: Testing individual capabilities in isolation, deploying capability updates independently, understanding the dependency graph, onboarding developers to work on a single capability.
- **More difficult**: Coordinating cross-cutting changes that span multiple plugins, managing 14 separate plugin repositories or modules, ensuring version compatibility across the plugin dependency graph.
