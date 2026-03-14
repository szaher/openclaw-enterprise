# Upstream Contribution Proposals

OpenClaw Enterprise extends OpenClaw exclusively via plugins. When enterprise features demonstrate broad utility, we propose upstreaming them.

## Principles

- **Upstream First**: We never fork OpenClaw; all functionality is delivered via the plugin API
- **Contribute Back**: Features useful to the community should be proposed upstream
- **Maintain Compatibility**: Enterprise plugins must work with released OpenClaw versions

## Proposed Contributions

### 1. Plugin Dependency Declaration
**Status**: Draft proposal
**Description**: Allow plugins to declare dependencies on other plugins via `package.json` manifest, enabling the gateway to resolve load order and inject gateway methods automatically.
**Benefit**: Enables plugin ecosystems beyond enterprise use cases.

### 2. Canvas A2UI D3.js Integration
**Status**: Planned
**Description**: Standard Canvas component for rendering D3.js visualizations, enabling any plugin to produce interactive graphs/charts.
**Benefit**: Visualization capability available to all OpenClaw plugins.

### 3. Service Lifecycle Management
**Status**: Planned
**Description**: Enhanced `registerService` with health check aggregation, graceful shutdown ordering, and dependency-aware restart.
**Benefit**: More robust plugin services for all users.

### 4. Gateway Method Type Safety
**Status**: Planned
**Description**: TypeScript type generation for gateway methods, allowing compile-time verification of inter-plugin communication.
**Benefit**: Reduces runtime errors in plugin-to-plugin calls.

## Completed Contributions

(None yet — project is in initial development phase)

## Process

1. Identify feature with broad utility
2. Draft proposal with API design
3. Discuss in OpenClaw community channels
4. Submit PR to upstream repository
5. Track status in this document
