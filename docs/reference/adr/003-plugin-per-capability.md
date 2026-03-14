# ADR-003: One Plugin Per Enterprise Capability

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/003-plugin-per-capability.md` |

---

## Context

The project requires multiple enterprise capabilities to be implemented as extensions to OpenClaw. A decision is needed on whether to bundle all capabilities into a single monolithic enterprise plugin or to structure the project as one plugin per capability. This decision affects modularity, testability, deployment flexibility, and dependency management.

---

## Decision

Structure the project as one plugin per enterprise capability rather than a monolithic enterprise plugin. The system comprises 15 TypeScript plugins and 1 Go Kubernetes operator.

Each plugin:
- Encapsulates a single capability
- Has its own SKILL.md file
- Can be tested in isolation
- Can be deployed independently
- Declares explicit dependencies on other plugins

---

## Rationale

- **Aligns with Constitution Principle VII (Plugin + Skill Pairs)**: Each plugin encapsulates a single capability and its associated skills, following the established architectural contract.

- **Independent testing and deployment**: Each plugin can be tested in isolation and deployed independently, enabling faster iteration and reducing the risk of changes in one capability breaking another.

- **Clear dependency graph**: The dependency relationships between plugins are explicit, with `policy-engine` serving as the root dependency. This makes the architecture easier to reason about and prevents hidden coupling.

---

## Alternatives Considered

### Monolithic enterprise plugin

Bundling all capabilities into a single plugin. This would simplify deployment at the cost of tight coupling, larger blast radius for changes, slower test cycles, and an opaque dependency structure. It would violate the Plugin + Skill Pairs principle by mixing unrelated concerns.

---

## Consequences

### What becomes easier

- Testing individual capabilities in isolation.
- Deploying capability updates independently.
- Understanding the dependency graph.
- Onboarding developers to work on a single capability.
- Disabling specific capabilities per tenant via feature flags.

### What becomes more difficult

- Coordinating cross-cutting changes that span multiple plugins.
- Managing 15 separate plugin modules.
- Ensuring version compatibility across the plugin dependency graph.

---

## Plugin Inventory

| Plugin | Capability |
|--------|-----------|
| `shared` | Types, constants, errors, connector-base, health utilities |
| `policy-engine` | OPA client, hierarchy resolver, evaluator, Rego policies |
| `audit-enterprise` | Append-only writer, query, export, user data handling |
| `auth-enterprise` | OIDC validator, RBAC mapper, admin API routes |
| `connector-gmail` | Gmail read/write tools, poller service |
| `connector-gcal` | Google Calendar read/write tools, sync service |
| `connector-jira` | Jira read/write tools, webhook service |
| `connector-github` | GitHub read tools, webhook service |
| `connector-gdrive` | Google Drive read tools, poller service |
| `task-intelligence` | Scanner, correlator, scorer, briefing, retention |
| `auto-response` | Classifier, responder, approval queue |
| `work-tracking` | PR-Jira correlation, ticket updater, standup generator |
| `ocip-protocol` | OCIP envelope, classification filter, loop prevention |
| `org-intelligence` | News aggregation, document monitor, consistency checker |
| `visualization` | D3.js dependency graphs, Eisenhower matrix, mind maps |
