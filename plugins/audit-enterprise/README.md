# audit-enterprise

Enterprise audit logging plugin for OpenClaw. Provides an append-only, immutable audit trail for all state-changing operations across the platform.

## What It Does

Every tool invocation, data access, model call, policy decision, agent-to-agent exchange, and policy change is recorded with full context: who performed the action, what data was touched, which policy governed the decision, and the outcome.

## Append-Only Guarantees

- The `AuditWriter` class exposes **only** an `insert` method. There are no update or delete methods.
- The database schema (`004_audit_entries.sql`) enforces immutability via PostgreSQL triggers that reject all UPDATE and DELETE operations.
- Entries use timestamp-prefixed sortable IDs (ULID-like) for chronological ordering.
- The table is partitioned by month for efficient range queries and retention management.

## Gateway Methods

### `audit.log`

Write an audit entry. Called by all plugins for state-changing operations.

```json
{
  "method": "audit.log",
  "params": {
    "tenant_id": "acme-corp",
    "user_id": "user-42",
    "action_type": "tool_invocation",
    "action_detail": { "tool": "send_email" },
    "data_accessed": [{ "source": "gmail", "classification": "internal", "purpose": "read inbox" }],
    "model_used": "gpt-4",
    "model_tokens": { "input": 100, "output": 50 },
    "data_classification": "internal",
    "policy_applied": "default-actions-v1",
    "policy_result": "allow",
    "policy_reason": "Allowed by default actions policy",
    "outcome": "success",
    "request_id": "req-abc-123"
  }
}
```

### `audit.query`

Query audit entries with filters and pagination.

```json
{
  "method": "audit.query",
  "params": {
    "tenant_id": "acme-corp",
    "filters": {
      "user_id": "user-42",
      "action_type": "data_access",
      "from": "2026-03-01T00:00:00Z",
      "to": "2026-03-13T23:59:59Z"
    },
    "page_size": 50,
    "page": 1
  }
}
```

## REST Endpoints

All endpoints require SSO/OIDC authentication with admin scope.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit` | List entries with filters, paginated |
| GET | `/api/v1/audit/:id` | Get single entry by ID |
| GET | `/api/v1/audit/export` | Export as CSV or JSON |

### Query Examples

```bash
# List recent entries
curl -H "Authorization: Bearer $TOKEN" \
  "https://openclaw.example.com/api/v1/audit?page_size=50"

# Filter by user and date range
curl -H "Authorization: Bearer $TOKEN" \
  "https://openclaw.example.com/api/v1/audit?user_id=user-42&from=2026-03-01T00:00:00Z&to=2026-03-13T23:59:59Z"

# Export as CSV
curl -H "Authorization: Bearer $TOKEN" \
  "https://openclaw.example.com/api/v1/audit/export?format=csv&from=2026-03-01T00:00:00Z" \
  -o audit-export.csv
```

## Configuration

The plugin requires a PostgreSQL connection pool passed during activation. Configuration is handled by the platform runtime:

- **Database**: PostgreSQL with the `audit` schema and `audit_entries` table (created by migration `004_audit_entries.sql`)
- **Query timeout**: 10 seconds (enforced via `SET LOCAL statement_timeout`)
- **Pagination defaults**: page_size=100, max=1000
- **Retention**: Minimum 1 year (per enterprise compliance requirements)

## Development

```bash
pnpm install
pnpm run typecheck
pnpm test
```
