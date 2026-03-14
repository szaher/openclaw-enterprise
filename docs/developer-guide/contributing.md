# Contributing Guide

This guide covers how to set up the development environment, the project structure, code style requirements, and the pull request process for OpenClaw Enterprise.

## Repository Structure

```
redclaw/
  plugins/
    shared/              # Shared types, constants, errors, connector-base, health
    policy-engine/       # Central policy authority (OPA/Rego)
    audit-enterprise/    # Append-only audit logging
    auth-enterprise/     # SSO/OIDC, RBAC
    connector-gmail/     # Gmail integration
    connector-gcal/      # Google Calendar integration
    connector-jira/      # Jira integration
    connector-github/    # GitHub integration
    connector-gdrive/    # Google Drive integration
    task-intelligence/   # Cross-system task discovery and prioritization
    auto-response/       # Policy-governed auto-responses
    work-tracking/       # PR-Jira correlation and standup generation
    ocip-protocol/       # Agent-to-agent exchange protocol
    org-intelligence/    # News aggregation and document monitoring
    visualization/       # D3.js graphs and charts via Canvas
  operator/              # Go K8s operator (CRDs, reconcilers, webhooks)
  db/
    migrations/          # PostgreSQL migration files (000-007)
  docs/
    adr/                 # Architecture Decision Records
    developer-guide/     # This guide
    how-to/              # Operator how-to guides
  scripts/               # Build and utility scripts
  specs/                 # Feature specifications
  .specify/              # Speckit configuration and constitution
```

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | >= 22.0.0 | Plugin runtime |
| pnpm | >= 9.15.0 | Package manager (workspaces) |
| Go | >= 1.22 | K8s operator development |
| OPA | Latest | Rego policy testing |
| Docker | Latest | Running PostgreSQL, OPA sidecar locally |

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/szaher/openclaw-enterprise.git
cd openclaw-enterprise

# Install dependencies
pnpm install

# Build all plugins
pnpm build

# Run tests
pnpm test

# Run lint
pnpm lint

# Type check
pnpm typecheck
```

### Running Locally

For local development, you need PostgreSQL and an OPA sidecar:

```bash
# Start PostgreSQL (via Docker)
docker run -d \
  --name openclaw-postgres \
  -e POSTGRES_DB=openclaw_enterprise \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=dev-password \
  -p 5432:5432 \
  postgres:16

# Apply migrations
psql -h localhost -U openclaw -d openclaw_enterprise \
  -f db/migrations/000_security.sql \
  -f db/migrations/001_policies.sql \
  -f db/migrations/002_tasks.sql \
  -f db/migrations/003_connectors.sql \
  -f db/migrations/004_audit_entries.sql \
  -f db/migrations/005_exchanges.sql \
  -f db/migrations/006_briefings.sql \
  -f db/migrations/007_data_classifications.sql

# Start OPA sidecar
docker run -d \
  --name openclaw-opa \
  -p 8181:8181 \
  openpolicyagent/opa:latest run --server
```

## Available Scripts

All scripts are defined in the root `package.json` and run via pnpm:

| Command | Description |
|---|---|
| `pnpm build` | Build all plugins (runs `tsc` in each workspace) |
| `pnpm test` | Run all Vitest tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run ESLint across all files |
| `pnpm lint:fix` | Run ESLint with auto-fix |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm typecheck` | Run TypeScript type checking (`tsc --noEmit`) |

## Code Style

### TypeScript

- **Strict mode** is enabled via `tsconfig.base.json`. This includes `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noPropertyAccessFromIndexSignature`.
- **No `any` types** in production code. Use `unknown` and narrow with type guards.
- **ESM modules** with `.js` extensions in all imports:

```typescript
// Correct
import { PolicyDeniedError } from '@openclaw-enterprise/shared/errors.js';
import { AcmeReadTools } from './tools/read.js';

// Incorrect
import { PolicyDeniedError } from '@openclaw-enterprise/shared/errors';
```

- **`import type`** for type-only imports (enforced by `verbatimModuleSyntax`):

```typescript
import type { PolicyScope } from '@openclaw-enterprise/shared/types.js';
```

- **Target**: ES2024
- **Module resolution**: Node16

### Formatting

Prettier is configured via `.prettierrc`. Run `pnpm format` before committing. CI checks formatting with `pnpm format:check`.

### Linting

ESLint is configured via `eslint.config.js`. Run `pnpm lint` to check for issues. Run `pnpm lint:fix` for auto-fixable issues.

### Commit Messages

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat(connector-gmail): add email_search tool
fix(policy-engine): handle unreachable OPA sidecar
test(audit-enterprise): add writer denial tests
docs(adr): add ADR-009 for OCIP loop prevention
chore: update dependencies
```

## Pull Request Process

1. **Branch from `main`**. Use a descriptive branch name: `feat/connector-slack`, `fix/policy-hierarchy-edge-case`.

2. **Make your changes.** Follow the code style requirements above.

3. **Run the full check suite locally:**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

4. **Write or update tests.** Every plugin must maintain >80% coverage.

5. **Update documentation** if your change affects:
   - Plugin behavior (update the plugin README and SKILL.md)
   - Shared types or constants (update the shared library reference)
   - Policy domains (update the policy reference)
   - API endpoints (update OpenAPI specs)

6. **Open a PR** with a clear description of what and why. Include:
   - What the change does
   - Why the change is needed
   - How it was tested
   - Any related issues or ADRs

7. **PR requires at least one maintainer review** before merge.

8. **CI must pass** (typecheck, lint, format, tests).

## Constitution Principles to Follow

Every contribution must comply with the project constitution. The key principles relevant to day-to-day development:

### Upstream First
Use only the public OpenClaw plugin API (`registerTool`, `registerHook`, `registerService`, `registerHttpRoute`, `registerGatewayMethod`, `registerContextEngine`). Do not modify or patch OpenClaw core. If a capability requires a core change, propose it upstream first.

### Policy Over Code
If a behavior might differ across organizations, teams, or users, it must be configurable via the policy engine. Do not hardcode business rules.

### Fail Closed
If the policy engine is unreachable, the default must be deny. If a classification is unknown, default to the highest level (restricted). Never fail open.

### Plugin + Skill Pairs
Every plugin must have a paired `SKILL.md`. Neither is complete without the other.

### No Raw Data Persistence
Raw user data (email bodies, message content) must be processed and discarded. Only structured extractions (titles, summaries, metadata) are persisted.

### Audit Everything
Every state-changing operation must produce an audit log entry via `audit.log`.

### Health Checks
Every plugin must include a health check accessible via the gateway status system.

## K8s Operator Development

The K8s operator in `operator/` is a separate Go project. It manages two Custom Resource Definitions:

- **OpenClawInstance** -- Represents a deployed OpenClaw Enterprise instance.
- **PolicyBundle** -- Represents a collection of policies to load into the policy engine.

### Building the Operator

```bash
cd operator
go build ./cmd/manager/
go test ./tests/...
```

### Operator Structure

```
operator/
  api/v1/types.go             # CRD type definitions
  internal/controller/         # Reconciler implementations
  internal/webhook/            # Admission webhooks
  cmd/manager/main.go          # Entry point
  tests/                       # Controller tests
```

## Adding a New Plugin

See the [Building Plugins](./building-plugins.md) guide for a complete walkthrough. Summary checklist:

- [ ] Create `plugins/{name}/` directory structure
- [ ] Add `package.json` with workspace dependency on `@openclaw-enterprise/shared`
- [ ] Add `tsconfig.json` extending `../../tsconfig.base.json`
- [ ] Implement `src/plugin.ts` with `activate(api)` function
- [ ] Register tools, hooks, services, routes as needed
- [ ] Add policy evaluation and audit logging
- [ ] Create `SKILL.md` for the agent
- [ ] Write tests in `tests/` with >80% coverage
- [ ] Add `README.md` documenting the plugin
- [ ] Update dependency graph documentation if adding inter-plugin dependencies
