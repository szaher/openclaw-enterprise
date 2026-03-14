# Building Plugins

This guide walks through building a new OpenClaw Enterprise plugin from scratch, including the entry point, tools, services, tests, and the paired SKILL.md.

## Prerequisites

- Node.js >= 22
- pnpm >= 9.15
- Familiarity with TypeScript strict mode and ESM
- Understanding of the [Plugin Architecture](./plugin-architecture.md)

## Plugin Entry Point

Every plugin exports an `activate` function in `src/plugin.ts`. This is the only required export. The runtime calls it once during initialization and passes the `OpenClawPluginAPI` object.

```typescript
// plugins/connector-example/src/plugin.ts
import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

export function activate(api: OpenClawPluginAPI): void {
  // Register tools
  api.registerTool({
    name: 'example_read',
    description: 'Read data from the example service.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item identifier' },
      },
      required: ['id'],
    },
    execute: async (params) => {
      const { id, _gateway, _tenantId, _userId } = params as {
        id: string;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
      };
      // Implementation here
    },
  });

  // Register services
  api.registerService({
    name: 'example-poller',
    start: async () => { /* start polling */ },
    stop: async () => { /* stop polling */ },
    healthCheck: async () => ({ status: 'healthy' }),
  });
}
```

> **Important:** The `_gateway`, `_tenantId`, and `_userId` fields are injected at runtime by the OpenClaw gateway on a per-request basis. During registration, you define the tool shape; the execution context is bound when the tool is actually invoked.

## Example: Building a Connector Plugin

This section builds a complete connector plugin that integrates with a hypothetical "Acme Tasks" API.

### Step 1: Create the plugin directory

```
plugins/connector-acme/
  src/
    plugin.ts
    openclaw-types.ts
    tools/
      read.ts
    services/
      poller.ts
  tests/
    acme.test.ts
  SKILL.md
  package.json
  tsconfig.json
```

### Step 2: Set up package.json

```json
{
  "name": "@openclaw-enterprise/connector-acme",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/plugin.js",
  "types": "dist/plugin.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@openclaw-enterprise/shared": "workspace:*"
  }
}
```

### Step 3: Set up tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### Step 4: Implement the tool using ConnectorBase

The `ConnectorBase` abstract class provides the standard pipeline for all connector operations: policy check, fetch, extract, classify, audit. Use it by extending the class and implementing the fetch and extract functions.

```typescript
// plugins/connector-acme/src/tools/read.ts
import { ConnectorBase } from '@openclaw-enterprise/shared/connector-base.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';

interface AcmeTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  status: string;
  updatedAt: string;
}

interface AcmeApiResponse {
  tasks: AcmeTask[];
}

export class AcmeReadTools extends ConnectorBase {
  private readonly apiToken: string;

  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    apiToken: string,
  ) {
    // ConnectorType must be one of the defined types, but for a custom
    // connector you would extend the ConnectorType union in shared/types.ts
    super('acme' as any, gateway, tenantId, userId);
    this.apiToken = apiToken;
  }

  async listTasks(params: { projectId: string }): Promise<ConnectorReadResult> {
    return this.executeRead<AcmeApiResponse>(
      'acme_list_tasks',
      params,
      // fetchRaw: get raw data from the external API
      async () => {
        const response = await fetch(
          `https://api.acme.dev/v1/projects/${params.projectId}/tasks`,
          { headers: { Authorization: `Bearer ${this.apiToken}` } },
        );
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<AcmeApiResponse>;
      },
      // extract: convert raw data to ConnectorReadResult (raw is discarded after this)
      (raw) => ({
        items: raw.tasks.map((task) => ({
          id: `acme-${task.id}`,
          source: 'acme',
          sourceId: task.id,
          title: task.title,
          summary: task.description.slice(0, 200),
          classification: 'internal', // Will be reclassified by policy.classify
          url: `https://acme.dev/tasks/${task.id}`,
          metadata: { assignee: task.assignee, status: task.status },
          timestamp: task.updatedAt,
        })),
        connectorStatus: 'ok',
      }),
    );
  }
}
```

### The ConnectorBase Pipeline

The `executeRead<T>()` method runs a five-step pipeline on every read operation:

1. **Policy evaluation** -- Calls `policy.evaluate` via GatewayMethod. If denied, returns immediately with an error status and zero items.
2. **Fetch raw data** -- Calls your `fetchRaw` function to retrieve data from the external API.
3. **Extract structured data** -- Calls your `extract` function to convert raw API response into `ConnectorReadResult`. The raw data is discarded after this point (never persisted).
4. **Classify each item** -- Calls `policy.classify` via GatewayMethod for each item. Items may be reclassified above the connector default.
5. **Audit log** -- Calls `audit.log` via GatewayMethod to record the data access.

The `executeWrite()` method follows a similar pattern: policy check, perform write, audit log.

> **Important:** Raw user data (email bodies, message content, document text) is processed in the extract step and then discarded. Only structured extractions (titles, summaries, metadata) are persisted. This is a constitutional requirement.

### Step 5: Wire up the plugin entry point

```typescript
// plugins/connector-acme/src/plugin.ts
import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { AcmeReadTools } from './tools/read.js';

export function activate(api: OpenClawPluginAPI): void {
  api.registerTool({
    name: 'acme_list_tasks',
    description: 'List tasks from an Acme project. Returns structured data (title, description summary, assignee, status).',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The Acme project ID' },
      },
      required: ['projectId'],
    },
    execute: async (params) => {
      const { projectId, _gateway, _tenantId, _userId, _apiToken } = params as {
        projectId: string;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
        _apiToken: string;
      };

      const tools = new AcmeReadTools(_gateway, _tenantId, _userId, _apiToken);
      return tools.listTasks({ projectId });
    },
  });

  api.registerService({
    name: 'acme-poller',
    start: async () => { /* Start polling for task updates */ },
    stop: async () => { /* Stop polling */ },
    healthCheck: async () => ({ status: 'healthy' }),
  });
}
```

### Step 6: Using GatewayMethods for Policy and Audit

If you are not using `ConnectorBase` (for example, in a non-connector plugin), you call GatewayMethods directly:

```typescript
// Evaluate policy before performing an action
const policyResult = await gateway['policy.evaluate']({
  tenantId,
  userId,
  action: 'my_custom_action',
  context: {
    dataClassification: 'internal',
    targetSystem: 'acme',
    additional: { projectId: 'proj-1' },
  },
});

if (policyResult.decision === 'deny') {
  throw new PolicyDeniedError('my_custom_action', policyResult.policyApplied, policyResult.reason);
}

// Log the action to the audit trail
await gateway['audit.log']({
  tenantId,
  userId,
  actionType: 'tool_invocation',
  actionDetail: { tool: 'my_custom_action' },
  dataClassification: 'internal',
  policyApplied: policyResult.policyApplied,
  policyResult: policyResult.decision,
  policyReason: policyResult.reason,
  outcome: 'success',
});
```

> **Warning:** Every plugin MUST handle the policy engine being unreachable. The default behavior is **fail closed** -- deny all actions. Use the `PolicyEngineUnreachableError` error class for this case.

## Creating the Paired SKILL.md

Every plugin needs a `SKILL.md` that teaches the agent how to use the plugin's tools. The skill file is placed at the root of the plugin directory.

```markdown
# Acme Tasks Skill

You have access to the Acme Tasks integration.

## Available Tools

### acme_list_tasks
Lists tasks from an Acme project. Use this when the user asks about their
Acme tasks, project status, or task assignments.

**When to use:**
- User asks "What are my tasks in Acme?"
- User asks about project status
- User asks about task assignments

**Parameters:**
- projectId (required): The Acme project ID

**Important:**
- Results are filtered by policy. Some tasks may be excluded based on
  data classification.
- If access is denied, inform the user that their policy does not allow
  Acme access and suggest contacting their admin.
```

## Adding Tests with Vitest

Tests go in `plugins/{name}/tests/` and use the `.test.ts` extension. See the [Testing Guide](./testing.md) for full details.

```typescript
// plugins/connector-acme/tests/acme.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcmeReadTools } from '../src/tools/read.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

function createMockGateway(): GatewayMethods {
  return {
    'policy.evaluate': vi.fn().mockResolvedValue({
      decision: 'allow',
      policyApplied: 'test-policy',
      reason: 'Allowed by test',
      constraints: {},
    }),
    'policy.classify': vi.fn().mockResolvedValue({
      classification: 'internal',
      assignedBy: 'connector_default',
      originalLevel: null,
      confidence: 1.0,
    }),
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-001' }),
  };
}

describe('AcmeReadTools', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
  });

  it('evaluates policy before reading tasks', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [] }),
    }) as unknown as typeof fetch;

    const tools = new AcmeReadTools(gateway, 'tenant-1', 'user-1', 'token');
    await tools.listTasks({ projectId: 'proj-1' });

    expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'acme_list_tasks',
      }),
    );
  });

  it('returns empty result when policy denies', async () => {
    gateway = {
      ...createMockGateway(),
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'restrict-acme',
        reason: 'Not authorized',
        constraints: {},
      }),
    };

    const tools = new AcmeReadTools(gateway, 'tenant-1', 'user-1', 'token');
    const result = await tools.listTasks({ projectId: 'proj-1' });

    expect(result.items).toHaveLength(0);
    expect(result.connectorStatus).toBe('error');
  });
});
```

## TypeScript and ESM Requirements

All plugins must follow these TypeScript and module conventions:

- **Strict mode**: TypeScript strict mode is enabled via `tsconfig.base.json`. No `any` types in production code.
- **ESM modules**: The project uses `"type": "module"` in `package.json`. All imports must use `.js` extensions:

```typescript
// Correct
import { PolicyDeniedError } from '@openclaw-enterprise/shared/errors.js';
import type { PolicyScope } from '@openclaw-enterprise/shared/types.js';
import { AcmeReadTools } from './tools/read.js';

// Incorrect -- will fail at runtime
import { PolicyDeniedError } from '@openclaw-enterprise/shared/errors';
import { AcmeReadTools } from './tools/read';
```

- **`verbatimModuleSyntax`**: Enabled in tsconfig. Use `import type` for type-only imports:

```typescript
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
```

- **Target**: ES2024 with Node16 module resolution.

## Registering Health Checks

Every plugin must provide a health check. For plugins using `ConnectorBase`, the base class provides a `healthCheck()` method that reports disabled status. For other plugins, implement health checks via the service registration:

```typescript
import type { HealthCheckResult } from '@openclaw-enterprise/shared/health.js';

api.registerService({
  name: 'my-service',
  start: async () => { /* ... */ },
  stop: async () => { /* ... */ },
  healthCheck: async (): Promise<HealthCheckResult> => {
    try {
      // Check connectivity, dependencies, etc.
      return { status: 'healthy' };
    } catch (error) {
      return {
        status: 'unhealthy',
        detail: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
```

Health check results are aggregated by the gateway into `GET /api/v1/status`. See the [Shared Library Reference](./shared-library.md) for `aggregateHealth` and `safeHealthCheck` utilities.

## Error Handling

Use the shared error classes from `@openclaw-enterprise/shared/errors.js`. These provide consistent error codes and messages across all plugins.

| Error Class | Code | When to Use |
|---|---|---|
| `PolicyEngineUnreachableError` | `POLICY_ENGINE_UNREACHABLE` | Cannot connect to OPA sidecar |
| `PolicyDeniedError` | `POLICY_DENIED` | Policy explicitly denies an action |
| `PolicyApprovalRequiredError` | `POLICY_APPROVAL_REQUIRED` | Policy requires human approval |
| `PolicyHierarchyViolationError` | `POLICY_HIERARCHY_VIOLATION` | Child scope tries to expand beyond parent |
| `ClassificationViolationError` | `CLASSIFICATION_VIOLATION` | Data exceeds allowed classification |
| `ConnectorUnavailableError` | `CONNECTOR_UNAVAILABLE` | External API is unreachable |
| `OAuthRevocationError` | `OAUTH_REVOKED` | OAuth token has been revoked |
| `ExchangeRoundLimitError` | `EXCHANGE_ROUND_LIMIT` | Agent exchange exceeded max rounds |
| `CommitmentRequiresHumanError` | `COMMITMENT_REQUIRES_HUMAN` | Agent exchange requires human approval for commitment |
| `CrossEnterpriseBlockedError` | `CROSS_ENTERPRISE_BLOCKED` | Cross-enterprise exchange blocked by policy |
| `AuditWriteError` | `AUDIT_WRITE_FAILED` | Failed to write to audit log |

```typescript
import {
  PolicyDeniedError,
  PolicyEngineUnreachableError,
  ConnectorUnavailableError,
} from '@openclaw-enterprise/shared/errors.js';

try {
  const result = await gateway['policy.evaluate'](request);
  if (result.decision === 'deny') {
    throw new PolicyDeniedError(action, result.policyApplied, result.reason);
  }
} catch (error) {
  if (error instanceof PolicyDeniedError) {
    // Known denial -- return gracefully
  } else {
    // Policy engine unreachable -- fail closed
    throw new PolicyEngineUnreachableError(
      error instanceof Error ? error.message : undefined,
    );
  }
}
```

## Checklist for a New Plugin

- [ ] `src/plugin.ts` with `activate(api)` function
- [ ] Tools registered with `api.registerTool()`
- [ ] Policy evaluation before every action (via `ConnectorBase` or direct GatewayMethod call)
- [ ] Audit logging for all state-changing operations
- [ ] Health check via `api.registerService()` with `healthCheck` callback
- [ ] `SKILL.md` teaching the agent when and how to use the tools
- [ ] Tests in `tests/` with >80% coverage
- [ ] `package.json` with `@openclaw-enterprise/shared` dependency
- [ ] `tsconfig.json` extending `../../tsconfig.base.json`
- [ ] ESM imports with `.js` extensions
- [ ] No `any` types in production code
- [ ] Error handling using shared error classes
- [ ] Fail-closed behavior when policy engine is unreachable
