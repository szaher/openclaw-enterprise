# Audit Log Administration

The OpenClaw Enterprise audit log is an immutable, append-only record of every action taken by the system. No UPDATE or DELETE operations are ever performed on audit records. This is a constitutional requirement that cannot be overridden by policy.

> **Design Target:** Answer any "what happened?" query within 10 seconds.

---

## What Gets Logged

Every significant action in the system generates an audit entry:

| Category | Examples |
|---|---|
| Tool Invocations | Email read, calendar query, Jira ticket creation, GitHub PR comment |
| Data Access | Document opened, search executed, data exported |
| Model Calls | Prompt sent to model, response received (with token counts) |
| Policy Decisions | Allow/deny decisions, policy evaluation results, autonomy level applied |
| Agent-to-Agent Exchanges | OCIP messages sent/received, classification filtering applied |
| Policy Changes | Policy created, updated, deprecated (with change reason and admin identity) |
| Authentication Events | Login, logout, token refresh, role mapping |
| Connector Events | Sync completed, OAuth refresh, error encountered |
| Data Classification | AI reclassification, admin override, classification propagation |

---

## Audit Entry Schema

Each audit entry contains the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the audit entry |
| `timestamp` | `datetime` | ISO 8601 timestamp of the action (UTC) |
| `user_id` | `string` | Identity of the user who triggered the action |
| `tenant_id` | `string` | Tenant identifier (for multi-tenant deployments) |
| `org_unit` | `string` | Organizational unit path (e.g., `engineering/platform`) |
| `action_type` | `string` | Category of the action (e.g., `tool_invocation`, `policy_decision`, `data_access`) |
| `action_detail` | `string` | Specific action performed (e.g., `read_email`, `create_jira_ticket`) |
| `data_accessed` | `object[]` | List of data items accessed, each with item ID and classification level |
| `model_used` | `string` | AI model used for this action (if applicable) |
| `token_count` | `object` | Token counts: `{ prompt: number, completion: number, total: number }` |
| `policy_applied` | `string` | ID of the policy that governed this action |
| `policy_result` | `string` | Result of policy evaluation: `allowed`, `denied`, `approval_required` |
| `outcome` | `string` | Final outcome: `success`, `denied`, `error`, `pending_approval` |
| `request_id` | `string` | Correlation ID linking related audit entries across a single request |
| `metadata` | `object` | Additional context-specific data |

### Example Audit Entry

```json
{
  "id": "aud_x7k9m2p4",
  "timestamp": "2026-03-13T14:30:15.123Z",
  "user_id": "alice@example.com",
  "tenant_id": "tenant_acme",
  "org_unit": "engineering/platform",
  "action_type": "tool_invocation",
  "action_detail": "create_jira_ticket",
  "data_accessed": [
    {
      "item_id": "email_abc123",
      "classification": "internal"
    }
  ],
  "model_used": "gpt-4",
  "token_count": {
    "prompt": 1250,
    "completion": 340,
    "total": 1590
  },
  "policy_applied": "pol_eng_actions_01",
  "policy_result": "approval_required",
  "outcome": "pending_approval",
  "request_id": "req_f8g9h0j1",
  "metadata": {
    "jira_project": "ENG",
    "autonomy_level": "approve",
    "approval_queue_id": "apq_k2l3m4n5"
  }
}
```

---

## Immutability Guarantees

The audit log enforces immutability at multiple levels:

| Layer | Mechanism |
|---|---|
| Application | The audit writer plugin only exposes an `append()` method. No update or delete methods exist. |
| Database | PostgreSQL table has no UPDATE or DELETE grants for the application role. A database trigger rejects any UPDATE or DELETE attempt. |
| API | No PUT or DELETE endpoints exist for audit records. |
| Policy | The `audit` policy domain enforces minimum retention and logging requirements. |

> **There is no mechanism to delete or modify audit entries through any supported interface.** This is by design.

---

## Storage and Partitioning

Audit entries are stored in monthly partitioned PostgreSQL tables for query performance:

```
audit_log_2026_01
audit_log_2026_02
audit_log_2026_03
...
```

Benefits of monthly partitioning:

- Queries scoped to a date range only scan relevant partitions.
- Older partitions can be archived to cold storage without affecting active queries.
- Index maintenance is performed per-partition, reducing lock contention.

Partitions are created automatically by the database migration system. The K8s operator monitors partition creation and alerts if a future partition is missing.

---

## Retention

The constitutional minimum retention period is **1 year (365 days)**. This cannot be reduced by any policy.

The `audit` policy domain can increase the retention period:

```json
{
  "domain": "audit",
  "rules": {
    "minimum_retention_days": 730
  },
  "change_reason": "Extend audit retention to 2 years per compliance requirement SOC2-2026"
}
```

After the retention period expires, partitions may be archived to cold storage. Even archived data must remain queryable (though response time targets do not apply to archived data).

---

## Query API

### Basic Query

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit" \
  -H "Authorization: Bearer $TOKEN"
```

### Filtered Query

The query API supports the following filter parameters:

| Parameter | Type | Description |
|---|---|---|
| `userId` | `string` | Filter by user identity |
| `tenantId` | `string` | Filter by tenant |
| `actionType` | `string` | Filter by action type (e.g., `tool_invocation`, `policy_decision`) |
| `actionDetail` | `string` | Filter by specific action (e.g., `create_jira_ticket`) |
| `outcome` | `string` | Filter by outcome (`success`, `denied`, `error`, `pending_approval`) |
| `policyResult` | `string` | Filter by policy result (`allowed`, `denied`, `approval_required`) |
| `dateFrom` | `datetime` | Start of date range (ISO 8601) |
| `dateTo` | `datetime` | End of date range (ISO 8601) |
| `requestId` | `string` | Filter by correlation/request ID |
| `limit` | `number` | Maximum number of results (default: 100, max: 1000) |
| `offset` | `number` | Pagination offset |

### Example: Find All Denied Actions for a User

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit?userId=alice@example.com&outcome=denied&dateFrom=2026-03-01T00:00:00Z&dateTo=2026-03-13T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "total": 3,
  "limit": 100,
  "offset": 0,
  "entries": [
    {
      "id": "aud_a1b2c3d4",
      "timestamp": "2026-03-12T09:15:00Z",
      "user_id": "alice@example.com",
      "action_type": "tool_invocation",
      "action_detail": "send_email",
      "policy_applied": "pol_eng_actions_01",
      "policy_result": "denied",
      "outcome": "denied",
      "metadata": {
        "reason": "Action 'send_email' is blocked by team policy"
      }
    }
  ]
}
```

### Example: Trace a Request Across Services

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit?requestId=req_f8g9h0j1" \
  -H "Authorization: Bearer $TOKEN"
```

This returns all audit entries generated during the processing of a single user request, allowing full traceability across policy evaluation, model invocation, connector access, and data classification.

### Example: Find All Policy Changes

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit?actionType=policy_change&dateFrom=2026-03-01T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Export

Audit data can be exported for external analysis, compliance reporting, or SIEM integration. Export is restricted to the `enterprise_admin` role.

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit/export?dateFrom=2026-03-01T00:00:00Z&dateTo=2026-03-31T23:59:59Z&format=json" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit_export_2026_03.json
```

Supported export formats:

| Format | Content-Type | Use Case |
|---|---|---|
| `json` | `application/json` | Programmatic analysis, SIEM ingestion |
| `csv` | `text/csv` | Spreadsheet analysis, compliance reporting |

> **Access Control:** Only users with the `enterprise_admin` role can access the export endpoint. This is enforced by policy and cannot be delegated to lower roles. The export action itself is logged to the audit trail.

---

## GDPR Support

OpenClaw Enterprise provides GDPR-compliant data handling for audit records.

### User Data Export (Right of Access)

Users can request an export of all audit entries associated with their identity:

```bash
curl -X GET "https://openclaw.example.com/api/v1/user-data/export?userId=alice@example.com" \
  -H "Authorization: Bearer $TOKEN"
```

This returns all audit entries, connector data, and policy decisions associated with the specified user.

### User Data Deletion (Right to Erasure)

When a user exercises their right to erasure, audit entries are **anonymized rather than deleted**. This preserves the integrity of the audit trail while removing personally identifiable information.

```bash
curl -X POST "https://openclaw.example.com/api/v1/user-data/anonymize" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice@example.com",
    "reason": "GDPR right to erasure request GDPR-2026-0042"
  }'
```

After anonymization:

- The `user_id` field is replaced with a non-reversible hash.
- Other PII fields in metadata are redacted.
- The audit entry structure and non-PII fields are preserved.
- The anonymization action is logged with the original user ID (which is itself then anonymized in subsequent passes).

> **Important:** Anonymization is irreversible. Once a user's data is anonymized, it cannot be re-associated with the original identity.

---

## Performance

The audit system is designed to meet the following performance targets:

| Metric | Target |
|---|---|
| Write latency | < 5ms per entry (append-only, no contention) |
| Query latency (filtered, recent data) | < 10 seconds |
| Query latency (filtered, archived data) | Best effort |
| Export throughput | > 10,000 entries/second |

Monthly partitioning and targeted indexes ensure that filtered queries on recent data meet the 10-second target. Queries that span many months or have no filters will be slower.

### Recommended Indexes

The following indexes are created by the database migrations:

- `(tenant_id, timestamp)` -- primary query pattern
- `(user_id, timestamp)` -- user-specific queries
- `(action_type, timestamp)` -- action type filtering
- `(request_id)` -- request correlation
- `(policy_applied, timestamp)` -- policy impact analysis

---

## Troubleshooting

### Slow Audit Queries

1. Ensure your query includes a date range (`dateFrom`/`dateTo`). Queries without date ranges scan all partitions.
2. Add additional filters (`userId`, `actionType`) to narrow the result set.
3. Check that database indexes are healthy: `REINDEX TABLE audit_log_2026_03;`
4. For frequently-run reports, consider using the export endpoint and analyzing offline.

### Missing Audit Entries

Audit entries should never be missing. If they are:

1. Check that the audit writer plugin is running: review plugin health via the admin API.
2. Check PostgreSQL connectivity from the application pods.
3. Check for disk space issues on the PostgreSQL volume.
4. Review application logs for audit write failures (these are logged at ERROR level).

### Disk Space Growth

The audit log grows continuously. To manage disk space:

1. Archive partitions older than the retention period to cold storage (S3, GCS).
2. Monitor partition sizes: `SELECT pg_size_pretty(pg_total_relation_size('audit_log_2026_01'));`
3. Set up alerts for database volume utilization at 80% and 90% thresholds.
