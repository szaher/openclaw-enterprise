# policy-engine

The central policy engine for OpenClaw Enterprise. Every tool invocation, model call, and data access passes through this plugin for policy evaluation.

## What It Does

- Evaluates every action against the enterprise policy hierarchy (enterprise > org > team > user)
- Classifies data using a three-layer pipeline: connector defaults, AI reclassification, admin override
- Enforces graduated autonomy (autonomous / notify / approve / block)
- Hot-reloads policy changes from PostgreSQL within 60 seconds
- Provides CRUD REST API for policy management
- Delegates evaluation to OPA (Open Policy Agent) running as a sidecar

## Architecture

- **OPA Sidecar**: Runs at localhost:8181 alongside each gateway pod
- **Rego Policies**: 7 policy domains (models, actions, integrations, agent-exchange, features, data, audit)
- **Hierarchy**: Enterprise ceiling, lower scopes restrict only
- **Fail-Closed**: If OPA is unreachable, all actions are denied

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| OPA_SIDECAR_URL | OPA sidecar address | http://localhost:8181 |
| OPA_EVALUATE_TIMEOUT_MS | Timeout for OPA calls | 5000 |
| POLICY_HOT_RELOAD_INTERVAL_MS | Poll interval for changes | 10000 |

## API Endpoints

- `POST /api/v1/policies` — Create a policy
- `GET /api/v1/policies` — List policies (filter by scope, domain)
- `GET /api/v1/policies/:id` — Get a policy
- `PUT /api/v1/policies/:id` — Update a policy (requires change_reason)
- `DELETE /api/v1/policies/:id` — Deprecate a policy

See `openapi.yaml` for full specification.

## Dependencies

None (this is the root plugin — all other enterprise plugins depend on it).
