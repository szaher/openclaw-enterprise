#!/usr/bin/env bash
# Scaffold a new OpenClaw Enterprise plugin
# Usage: ./scripts/scaffold-plugin.sh <plugin-name> [dependency1,dependency2,...]

set -euo pipefail

PLUGIN_NAME="${1:?Usage: scaffold-plugin.sh <plugin-name> [deps]}"
DEPS="${2:-}"
PLUGIN_DIR="plugins/${PLUGIN_NAME}"

if [ -d "$PLUGIN_DIR" ]; then
  echo "Error: Plugin directory ${PLUGIN_DIR} already exists"
  exit 1
fi

echo "Scaffolding plugin: ${PLUGIN_NAME}"

# Create directory structure
mkdir -p "${PLUGIN_DIR}/src"
mkdir -p "${PLUGIN_DIR}/tests"

# Build dependencies JSON
DEP_JSON='"@openclaw-enterprise/shared": "workspace:*"'
if [ -n "$DEPS" ]; then
  IFS=',' read -ra DEP_ARRAY <<< "$DEPS"
  for dep in "${DEP_ARRAY[@]}"; do
    DEP_JSON="${DEP_JSON}, \"@openclaw-enterprise/${dep}\": \"workspace:*\""
  done
fi

# Create package.json
cat > "${PLUGIN_DIR}/package.json" << EOF
{
  "name": "@openclaw-enterprise/${PLUGIN_NAME}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/plugin.js",
  "types": "dist/plugin.d.ts",
  "openclaw": {
    "type": "plugin",
    "name": "${PLUGIN_NAME}",
    "dependencies": [$(echo "$DEPS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/' | grep -v '""' || echo '')]
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    ${DEP_JSON}
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
EOF

# Create tsconfig.json
cat > "${PLUGIN_DIR}/tsconfig.json" << EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
EOF

# Create plugin entry point
cat > "${PLUGIN_DIR}/src/plugin.ts" << EOF
import type { OpenClawPluginAPI } from './openclaw-types.js';

export function activate(api: OpenClawPluginAPI): void {
  // TODO: Register tools, hooks, services, routes
}
EOF

# Create OpenClaw type stubs
cat > "${PLUGIN_DIR}/src/openclaw-types.ts" << EOF
// OpenClaw Plugin API type definitions
// These will be replaced by actual OpenClaw types when available

export interface OpenClawPluginAPI {
  registerTool(tool: ToolRegistration): void;
  registerHook(hook: HookRegistration): void;
  registerService(service: ServiceRegistration): void;
  registerHttpRoute(route: HttpRouteRegistration): void;
  registerGatewayMethod(method: GatewayMethodRegistration): void;
  registerContextEngine(engine: ContextEngineRegistration): void;
}

export interface ToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface HookRegistration {
  event: string;
  handler: (context: Record<string, unknown>) => Promise<void>;
}

export interface ServiceRegistration {
  name: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  healthCheck: () => Promise<{ status: string }>;
}

export interface HttpRouteRegistration {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: unknown, res: unknown) => Promise<void>;
}

export interface GatewayMethodRegistration {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface ContextEngineRegistration {
  name: string;
  getContext: (query: string) => Promise<unknown>;
}
EOF

# Create SKILL.md stub
cat > "${PLUGIN_DIR}/SKILL.md" << EOF
# Skill: ${PLUGIN_NAME}

## When to Use

TODO: Describe when the agent should use this plugin's tools.

## Tools

TODO: List available tools and their purposes.

## Examples

TODO: Add usage examples.
EOF

# Create README.md stub
cat > "${PLUGIN_DIR}/README.md" << EOF
# ${PLUGIN_NAME}

OpenClaw Enterprise plugin.

## What It Does

TODO: Describe plugin capabilities.

## Configuration

TODO: Describe configuration options.

## Policies

TODO: Describe policies that govern this plugin.
EOF

echo "Plugin ${PLUGIN_NAME} scaffolded at ${PLUGIN_DIR}"
