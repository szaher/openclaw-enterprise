# Shared Library Reference

The shared library (`plugins/shared/`) provides types, constants, error classes, the ConnectorBase abstract class, and health check utilities used by all enterprise plugins.

**Package name:** `@openclaw-enterprise/shared`

**Import pattern:**

```typescript
import type { PolicyScope } from '@openclaw-enterprise/shared/types.js';
import { CORRELATION_AUTO_MERGE_THRESHOLD } from '@openclaw-enterprise/shared/constants.js';
import { PolicyDeniedError } from '@openclaw-enterprise/shared/errors.js';
import { ConnectorBase } from '@openclaw-enterprise/shared/connector-base.js';
import { aggregateHealth, safeHealthCheck } from '@openclaw-enterprise/shared/health.js';
```

> **Note:** Always use `.js` extensions in imports. Always use `import type` for type-only imports (enforced by `verbatimModuleSyntax`).

---

## types.ts

All shared type definitions for the enterprise layer. Located at `plugins/shared/src/types.ts`.

### Policy Types

| Type | Values / Shape |
|---|---|
| `PolicyScope` | `'enterprise' \| 'org' \| 'team' \| 'user'` |
| `PolicyDomain` | `'models' \| 'actions' \| 'integrations' \| 'agent-to-agent' \| 'features' \| 'data' \| 'audit'` |
| `PolicyStatus` | `'active' \| 'draft' \| 'deprecated'` |
| `PolicyResult` | `'allow' \| 'deny' \| 'require_approval'` |
| `Policy` | Interface with `id`, `scope`, `scopeId`, `domain`, `name`, `version`, `content`, `status`, `createdBy`, `createdAt`, `updatedAt`, `changeReason` |

### Data Classification Types

| Type | Values / Shape |
|---|---|
| `DataClassificationLevel` | `'public' \| 'internal' \| 'confidential' \| 'restricted'` |
| `ClassificationAssigner` | `'connector_default' \| 'ai_reclassification' \| 'admin_override'` |
| `DataClassification` | Interface with `dataRef`, `level`, `assignedBy`, `originalLevel`, `overrideBy`, `overrideReason`, `assessedAt` |

### Action Types

| Type | Values / Shape |
|---|---|
| `ActionAutonomyLevel` | `'autonomous' \| 'notify' \| 'approve' \| 'block'` |

### Connector Types

| Type | Values / Shape |
|---|---|
| `ConnectorType` | `'gmail' \| 'gcal' \| 'jira' \| 'github' \| 'gdrive'` |
| `ConnectorPermission` | `'read' \| 'write' \| 'admin'` |
| `ConnectorStatus` | `'active' \| 'disabled' \| 'error'` |
| `Connector` | Interface with `id`, `type`, `tenantId`, `userId`, `permissions`, `defaultClassification`, `status`, `credentialsRef`, `lastSyncAt`, `errorDetails`, `config` |

### Audit Types

| Type | Values / Shape |
|---|---|
| `AuditActionType` | `'tool_invocation' \| 'data_access' \| 'model_call' \| 'policy_decision' \| 'agent_exchange' \| 'policy_change'` |
| `AuditOutcome` | `'success' \| 'denied' \| 'error' \| 'pending_approval'` |
| `AuditEntry` | Interface with `id`, `tenantId`, `userId`, `timestamp`, `actionType`, `actionDetail`, `dataAccessed`, `modelUsed`, `modelTokens`, `dataClassification`, `policyApplied`, `policyResult`, `policyReason`, `outcome`, `requestId` |
| `DataAccessRecord` | Interface with `source`, `classification`, `purpose` |

### Task Types

| Type | Values / Shape |
|---|---|
| `TaskStatus` | `'discovered' \| 'active' \| 'completed' \| 'archived' \| 'purged'` |
| `Task` | Interface with `id`, `userId`, `title`, `description`, `priorityScore`, `status`, `sources`, `correlationId`, `correlationConfidence`, `deadline`, `urgencySignals`, `classification`, `discoveredAt`, `completedAt`, `archivedAt`, `purgeAt` |
| `TaskSource` | Interface with `system`, `id`, `url` |
| `UrgencySignals` | Interface with `senderSeniority`, `followUpCount`, `slaTimer`, `blockingRelationships` |

### Exchange Types (OCIP)

| Type | Values / Shape |
|---|---|
| `ExchangeType` | `'information_query' \| 'commitment_request' \| 'meeting_scheduling'` |
| `ExchangeOutcome` | `'in_progress' \| 'resolved' \| 'escalated' \| 'denied' \| 'expired'` |
| `OcipMessageType` | `'agent-generated' \| 'agent-assisted' \| 'human'` |
| `ReplyPolicy` | `'agent-ok' \| 'human-only' \| 'no-reply-needed'` |
| `AgentIdentity` | Interface with `instanceId`, `userId`, `tenantId`, `orgUnit`, `canReceiveQueries`, `canAutoRespond`, `canMakeCommitments`, `maxClassificationShared`, `supportedExchangeTypes`, `maxRoundsAccepted` |
| `Exchange` | Interface with `exchangeId`, `conversationId`, `initiatorAgentId`, `initiatorUserId`, `responderAgentId`, `responderUserId`, `exchangeType`, `currentRound`, `maxRounds`, `classificationLevel`, `outcome`, `escalationReason`, `dataShared`, `dataWithheld`, `policyApplied`, `transcript`, `channel`, `startedAt`, `endedAt` |

### Briefing Types

| Type | Values / Shape |
|---|---|
| `DeliveryChannel` | `'slack' \| 'email' \| 'web_ui'` |
| `NewsRelevance` | `'must-read' \| 'should-read' \| 'nice-to-know' \| 'skip'` |
| `Briefing` | Interface with `id`, `userId`, `tenantId`, `generatedAt`, `tasks`, `timeBlocks`, `autoResponseSummary`, `orgNewsItems`, `docChangeAlerts`, `alerts`, `connectorStatus`, `deliveryChannel`, `deliveredAt` |

### RBAC Types

| Type | Values / Shape |
|---|---|
| `BuiltInRole` | `'enterprise_admin' \| 'org_admin' \| 'team_lead' \| 'user'` |
| `UserContext` | Interface with `userId`, `email`, `roles`, `orgUnit`, `tenantId`, `effectivePermissions` |

### Connector Interface Contracts

| Type | Purpose |
|---|---|
| `ConnectorReadResult` | Returned by `executeRead()` -- contains `items[]`, `connectorStatus`, `errorDetail?` |
| `ConnectorWriteResult` | Returned by `executeWrite()` -- contains `success`, `sourceId`, `action`, `policyApplied`, `auditEntryId` |

### Policy Evaluation Contracts

| Type | Purpose |
|---|---|
| `PolicyEvaluateRequest` | Input to `policy.evaluate` -- contains `tenantId`, `userId`, `action`, `context` |
| `PolicyEvaluateResponse` | Output from `policy.evaluate` -- contains `decision`, `policyApplied`, `reason`, `constraints` |
| `ClassifyRequest` | Input to `policy.classify` -- contains `connectorType`, `contentSummary`, `sourceId` |
| `ClassifyResponse` | Output from `policy.classify` -- contains `classification`, `assignedBy`, `originalLevel`, `confidence` |

### Message and Document Types

| Type | Values / Shape |
|---|---|
| `MessageClassification` | `'critical' \| 'needs-response' \| 'informational' \| 'noise'` |
| `ChangeClassification` | `'cosmetic' \| 'minor' \| 'substantive' \| 'critical'` |

---

## constants.ts

Shared constants used across plugins. Located at `plugins/shared/src/constants.ts`.

### Policy Constants

| Constant | Value | Purpose |
|---|---|---|
| `POLICY_SCOPE_HIERARCHY` | `['enterprise', 'org', 'team', 'user']` | Scope order (index 0 = highest authority) |
| `POLICY_DOMAINS` | `['models', 'actions', 'integrations', 'agent-to-agent', 'features', 'data', 'audit']` | All policy domains |
| `CLASSIFICATION_LEVELS` | `['public', 'internal', 'confidential', 'restricted']` | Ordered from lowest to highest sensitivity |
| `CONNECTOR_DEFAULT_CLASSIFICATION` | `{ gmail: 'internal', gcal: 'internal', jira: 'internal', github: 'public', gdrive: 'internal' }` | Default classification per connector |

### Task Intelligence Constants

| Constant | Value | Purpose |
|---|---|---|
| `CORRELATION_AUTO_MERGE_THRESHOLD` | `0.8` | Confidence above which tasks are auto-merged |
| `CORRELATION_POSSIBLY_RELATED_THRESHOLD` | `0.5` | Confidence above which tasks are flagged as related |
| `TASK_ACTIVE_RETENTION_DAYS` | `90` | Days before active tasks are considered stale |
| `TASK_ARCHIVE_AFTER_DAYS` | `30` | Days after completion before archiving |
| `TASK_PURGE_AFTER_ARCHIVE_DAYS` | `90` | Days after archiving before purging |

### Policy Hot-Reload Constants

| Constant | Value | Purpose |
|---|---|---|
| `POLICY_HOT_RELOAD_INTERVAL_MS` | `10000` | Base polling interval for policy changes |
| `POLICY_HOT_RELOAD_MAX_DELAY_MS` | `60000` | Maximum delay between policy reload attempts |

### Audit Constants

| Constant | Value | Purpose |
|---|---|---|
| `AUDIT_MIN_RETENTION_YEARS` | `1` | Minimum retention period for audit logs |
| `AUDIT_QUERY_TIMEOUT_MS` | `10000` | Timeout for audit log queries |
| `AUDIT_DEFAULT_PAGE_SIZE` | `100` | Default page size for audit queries |
| `AUDIT_MAX_PAGE_SIZE` | `1000` | Maximum page size for audit queries |

### OCIP Constants

| Constant | Value | Purpose |
|---|---|---|
| `OCIP_PROTOCOL_VERSION` | `'1.0'` | Current OCIP protocol version |
| `OCIP_DEFAULT_MAX_ROUNDS` | `3` | Default max rounds for agent exchanges |

### Infrastructure Constants

| Constant | Value | Purpose |
|---|---|---|
| `OPA_SIDECAR_URL` | `'http://localhost:8181'` | Default OPA sidecar endpoint |
| `OPA_EVALUATE_TIMEOUT_MS` | `5000` | Timeout for OPA policy evaluation |
| `API_VERSION` | `'v1'` | Current API version |
| `API_BASE_PATH` | `'/api/v1'` | Base path for all HTTP routes |
| `AI_DISCLOSURE_LABEL` | `"Sent by user's OpenClaw assistant"` | Label added to AI-generated messages |

---

## errors.ts

Error class hierarchy for consistent error handling. Located at `plugins/shared/src/errors.ts`.

All errors extend `OpenClawEnterpriseError`, which extends the built-in `Error` class and adds a `code` property.

### Error Hierarchy

```
Error
  └── OpenClawEnterpriseError (code: string)
        ├── PolicyEngineUnreachableError       code: POLICY_ENGINE_UNREACHABLE
        ├── PolicyDeniedError                  code: POLICY_DENIED
        ├── PolicyApprovalRequiredError        code: POLICY_APPROVAL_REQUIRED
        ├── PolicyHierarchyViolationError      code: POLICY_HIERARCHY_VIOLATION
        ├── ClassificationViolationError       code: CLASSIFICATION_VIOLATION
        ├── ConnectorUnavailableError          code: CONNECTOR_UNAVAILABLE
        ├── OAuthRevocationError               code: OAUTH_REVOKED
        ├── ExchangeRoundLimitError            code: EXCHANGE_ROUND_LIMIT
        ├── CommitmentRequiresHumanError       code: COMMITMENT_REQUIRES_HUMAN
        ├── CrossEnterpriseBlockedError        code: CROSS_ENTERPRISE_BLOCKED
        └── AuditWriteError                    code: AUDIT_WRITE_FAILED
```

### Usage Examples

```typescript
import {
  PolicyDeniedError,
  PolicyEngineUnreachableError,
} from '@openclaw-enterprise/shared/errors.js';

// Throw a policy denial
throw new PolicyDeniedError('email_send', 'restrict-email-write', 'Write access not authorized');

// Catch and inspect
try {
  await gateway['policy.evaluate'](request);
} catch (error) {
  if (error instanceof PolicyDeniedError) {
    console.log(error.action);        // 'email_send'
    console.log(error.policyApplied); // 'restrict-email-write'
    console.log(error.reason);        // 'Write access not authorized'
    console.log(error.code);          // 'POLICY_DENIED'
  }
}
```

---

## connector-base.ts

The `ConnectorBase` abstract class and the `GatewayMethods` interface. Located at `plugins/shared/src/connector-base.ts`.

### GatewayMethods Interface

```typescript
export interface GatewayMethods {
  'policy.evaluate': (params: PolicyEvaluateRequest) => Promise<PolicyEvaluateResponse>;
  'policy.classify': (params: ClassifyRequest) => Promise<ClassifyResponse>;
  'audit.log': (params: Record<string, unknown>) => Promise<{ id: string }>;
}
```

### ConnectorBase Class

Abstract base class for all enterprise connectors. Provides:

- **Policy evaluation** before every data access
- **Audit logging** for every operation
- **Classification propagation** (derived data inherits source classification)
- **Ephemeral raw data handling** (raw content discarded after extraction)
- **OAuth revocation detection** with graceful disablement

#### Constructor

```typescript
constructor(
  connectorType: ConnectorType,
  gateway: GatewayMethods,
  tenantId: string,
  userId: string,
)
```

#### Protected Methods

| Method | Signature | Purpose |
|---|---|---|
| `executeRead<T>` | `(toolName, params, fetchRaw, extract) => Promise<ConnectorReadResult>` | Execute a read operation with the full policy/classify/audit pipeline |
| `executeWrite` | `(toolName, params, performWrite, dataClassification) => Promise<ConnectorWriteResult>` | Execute a write operation with policy check and audit |
| `isOAuthRevocationError` | `(error: unknown) => boolean` | Detect OAuth revocation (override in subclass for API-specific detection) |
| `isApiUnavailableError` | `(error: unknown) => boolean` | Detect temporary API unavailability (override in subclass) |

#### Public Methods

| Method | Signature | Purpose |
|---|---|---|
| `healthCheck` | `() => Promise<{ status: string; detail?: string }>` | Reports connector health; returns `disabled` if OAuth was revoked |

#### Pipeline Details

The `executeRead<T>()` pipeline:

1. `ensureNotDisabled()` -- Throws `ConnectorUnavailableError` if connector was disabled by OAuth revocation.
2. `policy.evaluate` -- Checks authorization. Returns empty result with `connectorStatus: 'error'` if denied.
3. `fetchRaw()` -- Calls the provided function to fetch raw data from the external API.
4. `extract(raw)` -- Calls the provided function to convert raw data to `ConnectorReadResult`. Raw data leaves scope after this call.
5. `policy.classify` -- Classifies each item in the result by calling the GatewayMethod.
6. `enforceClassificationPropagation` -- Ensures batch-level classification is the highest of all items.
7. `audit.log` -- Records the data access in the audit trail.

On error:
- OAuth revocation (401, invalid_grant, token revoked) causes the connector to be disabled.
- API unavailability (503, ECONNREFUSED, timeout) returns an error status without disabling.

---

## health.ts

Health check utilities for plugin health reporting. Located at `plugins/shared/src/health.ts`.

### HealthCheckResult Interface

```typescript
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'stopped';
  detail?: string;
  lastChecked?: string;
  dependencies?: Record<string, HealthCheckResult>;
}
```

### PluginHealthProvider Interface

```typescript
export interface PluginHealthProvider {
  name: string;
  healthCheck: () => Promise<HealthCheckResult>;
}
```

### aggregateHealth

Aggregates health check results from multiple plugins. The overall status is the worst status across all inputs: `unhealthy` > `degraded`/`disabled` > `healthy`.

```typescript
import { aggregateHealth } from '@openclaw-enterprise/shared/health.js';

const results = {
  'policy-engine': { status: 'healthy' },
  'connector-gmail': { status: 'degraded', detail: 'Gmail API slow' },
  'audit-enterprise': { status: 'healthy' },
};

const overall = aggregateHealth(results);
// { status: 'degraded', lastChecked: '2026-...', dependencies: { ... } }
```

### safeHealthCheck

Wraps a health check call with a timeout and error handling. If the health check times out or throws, it returns `{ status: 'unhealthy' }`.

```typescript
import { safeHealthCheck } from '@openclaw-enterprise/shared/health.js';

const result = await safeHealthCheck(
  { name: 'my-plugin', healthCheck: () => myPlugin.healthCheck() },
  5000, // timeout in ms (default: 5000)
);
```
