# OpenClaw Enterprise -- Developer Guide

Welcome to the OpenClaw Enterprise developer documentation. This guide covers architecture, plugin development, testing, and contribution workflows for the enterprise extension layer.

## Guides

- [Plugin Architecture](./plugin-architecture.md) -- How the plugin system works, the dependency graph, lifecycle, and inter-plugin communication via GatewayMethods.
- [Building Plugins](./building-plugins.md) -- Step-by-step guide to building a new plugin, from entry point to tests to SKILL.md.
- [Shared Library Reference](./shared-library.md) -- Types, constants, errors, ConnectorBase, and health utilities provided by `@openclaw-enterprise/shared`.
- [Testing](./testing.md) -- Vitest configuration, test patterns, mocking strategies, OPA/Rego testing, and coverage targets.
- [Contributing](./contributing.md) -- Repository setup, development workflow, code style, PR process, and constitution principles.

## Related Resources

- [How-To Guides](../how-to/index.md) -- Task-oriented guides for operators and administrators.
- [Architecture Decision Records](../reference/adr/index.md) -- ADRs documenting key design decisions.

## Quick Reference

| Topic | Command |
|---|---|
| Run all tests | `pnpm test` |
| Watch mode | `pnpm test:watch` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Type check | `pnpm typecheck` |
| Build all plugins | `pnpm build` |

## Technology Stack

| Component | Technology |
|---|---|
| Plugins | TypeScript (strict mode), Node.js >= 22, ESM |
| K8s Operator | Go |
| Policy Engine | OPA (Rego) |
| Visualization | D3.js via OpenClaw Canvas |
| Database | PostgreSQL |
| Testing | Vitest |
| Package Manager | pnpm (workspaces) |
