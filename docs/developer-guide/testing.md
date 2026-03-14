# Testing Guide

OpenClaw Enterprise uses Vitest for all TypeScript plugin tests and the OPA test framework for Rego policy tests. This guide covers test configuration, patterns, mocking strategies, and coverage requirements.

## Vitest Configuration

The root `vitest.config.ts` configures test discovery and coverage for all plugins:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['plugins/*/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['plugins/*/src/**/*.ts'],
      exclude: ['plugins/*/src/**/*.d.ts', 'plugins/shared/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 10000,
  },
});
```

Key points:

- **Test globals** are enabled (`describe`, `it`, `expect` do not need explicit imports, though importing them from `vitest` is recommended for clarity).
- **Test discovery** scans `plugins/*/tests/**/*.test.ts`.
- **Coverage** is collected from `plugins/*/src/**/*.ts`, excluding declaration files and the shared library.
- **Thresholds** enforce 80% minimum for statements, branches, functions, and lines per plugin.
- **Test timeout** is 10 seconds.

## Running Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (re-runs on file change)
pnpm test:watch

# Run tests for a specific plugin
pnpm test -- --filter plugins/connector-gmail

# Run a specific test file
pnpm test -- plugins/connector-gmail/tests/gmail.test.ts

# Run with coverage report
pnpm test -- --coverage
```

## Test File Locations

Tests live alongside their plugin in the `tests/` directory:

```
plugins/
  connector-gmail/
    tests/
      gmail.test.ts
  policy-engine/
    tests/
      hierarchy.test.ts
      evaluate.test.ts
      classify.test.ts
  audit-enterprise/
    tests/
      writer.test.ts
  work-tracking/
    tests/
      work-tracking.test.ts
```

## Mocking the Gateway

The most common mock in enterprise plugin tests is the `GatewayMethods` object. Every connector and feature plugin depends on `policy.evaluate`, `policy.classify`, and `audit.log`.

### Standard Mock Gateway

```typescript
import { vi } from 'vitest';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

function createMockGateway(overrides?: Partial<GatewayMethods>): GatewayMethods {
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
    ...overrides,
  };
}
```

This mock allows all actions by default. Override specific methods to test denial, approval, and classification scenarios.

### Overriding for Policy Denial

```typescript
const gateway = createMockGateway({
  'policy.evaluate': vi.fn().mockResolvedValue({
    decision: 'deny',
    policyApplied: 'restrict-email',
    reason: 'User not authorized for email access',
    constraints: {},
  }),
});
```

### Overriding for Classification

```typescript
const gateway = createMockGateway({
  'policy.classify': vi.fn().mockResolvedValue({
    classification: 'confidential',
    assignedBy: 'ai_reclassification',
    originalLevel: 'internal',
    confidence: 0.95,
  }),
});
```

## Mocking fetch for Connector Tests

Connector plugins use `global.fetch` to call external APIs. Mock it with `vi.fn()`:

```typescript
import { vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('fetches data from the API', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [{ id: 'msg-1', subject: 'Test' }],
    }),
  }) as unknown as typeof fetch;

  const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'token');
  const result = await tools.emailRead({ messageId: 'msg-1' });

  expect(result.connectorStatus).toBe('ok');
});
```

### Simulating API Errors

```typescript
// OAuth revocation (401)
global.fetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
}) as unknown as typeof fetch;

// API unavailability (503)
global.fetch = vi.fn().mockRejectedValue(
  new Error('503 Service Unavailable'),
) as unknown as typeof fetch;

// Network error
global.fetch = vi.fn().mockRejectedValue(
  new Error('ECONNREFUSED'),
) as unknown as typeof fetch;
```

## Policy Denial Tests

Every plugin must test fail-closed behavior. These tests verify that when the policy engine denies an action, the plugin:

1. Does NOT perform the action (no external API call).
2. Returns an appropriate error or empty result.
3. Logs the denial to the audit trail.

### Example: Verifying Fail-Closed Behavior

```typescript
describe('policy denial', () => {
  it('returns denied result when policy denies', async () => {
    const gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'restrict-acme',
        reason: 'Not authorized',
        constraints: {},
      }),
    });

    const tools = new AcmeReadTools(gateway, 'tenant-1', 'user-1', 'token');
    const result = await tools.listTasks({ projectId: 'proj-1' });

    // Action was not performed
    expect(global.fetch).not.toHaveBeenCalled();

    // Result indicates denial
    expect(result.items).toHaveLength(0);
    expect(result.connectorStatus).toBe('error');
    expect(result.errorDetail).toContain('Denied by policy');
  });

  it('fails closed when policy engine is unreachable', async () => {
    const gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockRejectedValue(
        new Error('ECONNREFUSED'),
      ),
    });

    const tools = new AcmeReadTools(gateway, 'tenant-1', 'user-1', 'token');

    // Should throw PolicyEngineUnreachableError, not proceed with the action
    await expect(tools.listTasks({ projectId: 'proj-1' })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

### Verifying Audit Logging on Denial

```typescript
it('logs audit entry for denied write operations', async () => {
  const gateway = createMockGateway({
    'policy.evaluate': vi.fn().mockResolvedValue({
      decision: 'deny',
      policyApplied: 'restrict-write',
      reason: 'Write access not authorized',
      constraints: {},
    }),
  });

  const tools = new AcmeWriteTools(gateway, 'tenant-1', 'user-1', 'token');
  const result = await tools.createTask({ title: 'Test' });

  expect(result.success).toBe(false);
  expect(gateway['audit.log']).toHaveBeenCalledWith(
    expect.objectContaining({
      policyResult: 'deny',
      outcome: 'denied',
    }),
  );
});
```

## OPA Test Framework for Rego Policies

Rego policies in `plugins/policy-engine/rego/` are tested using OPA's built-in test framework.

### Running Rego Tests

```bash
# Install OPA CLI
brew install opa

# Run all Rego tests
opa test plugins/policy-engine/rego/ -v

# Run tests for a specific policy
opa test plugins/policy-engine/rego/models.rego plugins/policy-engine/rego/models_test.rego -v
```

### Writing Rego Tests

Rego test files use the `_test.rego` suffix and define rules prefixed with `test_`:

```rego
# plugins/policy-engine/rego/models_test.rego
package openclaw.enterprise.models_test

import rego.v1
import data.openclaw.enterprise.models

# Test: public data allowed with default policy
test_allow_public_data if {
    models.allow with input as {
        "data_classification": "public",
        "additional": { "provider": "openai" }
    }
}

# Test: confidential data blocked for external models
test_deny_confidential_external if {
    not models.allow with input as {
        "data_classification": "confidential",
        "additional": { "provider": "openai" }
    }
}

# Test: confidential data allowed for self-hosted models
test_allow_confidential_self_hosted if {
    models.allow with input as {
        "data_classification": "confidential",
        "additional": { "provider": "self-hosted" }
    }
    with data.policy as {
        "allowed_classifications": ["public", "internal", "confidential"],
        "max_classification": "confidential"
    }
}
```

## Full Test Example

This is a complete test file from the Gmail connector, demonstrating all key patterns:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailReadTools } from '../src/tools/read.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { OAuthRevocationError } from '@openclaw-enterprise/shared/errors.js';

function createMockGateway(overrides?: Partial<GatewayMethods>): GatewayMethods {
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
    ...overrides,
  };
}

describe('GmailReadTools', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
  });

  it('evaluates policy before reading email', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1', payload: { headers: [] } }),
    }) as unknown as typeof fetch;

    const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'token');
    await tools.emailRead({ messageId: 'msg-1' });

    expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'email_read',
      }),
    );
  });

  it('returns denied result when policy denies', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'restrict-email',
        reason: 'User not authorized',
        constraints: {},
      }),
    });

    const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'token');
    const result = await tools.emailRead({ messageId: 'msg-1' });

    expect(result.items).toHaveLength(0);
    expect(result.connectorStatus).toBe('error');
  });

  it('logs audit entry after successful read', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1', payload: { headers: [] } }),
    }) as unknown as typeof fetch;

    const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'token');
    await tools.emailRead({ messageId: 'msg-1' });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'data_access',
        outcome: 'success',
      }),
    );
  });

  it('throws OAuthRevocationError on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as unknown as typeof fetch;

    const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'bad-token');
    await expect(tools.emailRead({ messageId: 'msg-1' })).rejects.toThrow(OAuthRevocationError);
  });
});
```

## Coverage Targets

The project enforces **80% minimum coverage** for statements, branches, functions, and lines across all plugins. The shared library is excluded from coverage measurement (it is tested indirectly through plugin tests).

To check coverage:

```bash
pnpm test -- --coverage
```

The coverage report is generated in three formats:
- **text** -- printed to the terminal
- **json** -- machine-readable for CI
- **html** -- browsable report in `coverage/`

## Test Categories

| Category | What to Test | Where |
|---|---|---|
| Policy evaluation | Verify policy is called before actions; verify denial behavior | Every plugin |
| Classification | Verify items are classified via `policy.classify` | Connector plugins |
| Audit logging | Verify audit entries for success and denial | Every plugin |
| OAuth revocation | Verify connector disables on 401/invalid_grant | Connector plugins |
| API unavailability | Verify graceful degradation on 503/timeout | Connector plugins |
| Hierarchy | Verify child scopes cannot expand beyond parent | policy-engine |
| Hot-reload | Verify policy changes are detected and applied | policy-engine |
| OCIP envelope | Verify OCIP metadata injection and parsing | ocip-protocol |
| Loop prevention | Verify round limits and human escalation | ocip-protocol |
| Approval queue | Verify pending items, approve, reject flows | auto-response |
