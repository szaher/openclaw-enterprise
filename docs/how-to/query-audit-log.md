# How To: Query the Audit Log

This guide explains how to search, filter, and export audit log entries using the OpenClaw Enterprise REST API.

## Overview

The audit log is an **append-only, immutable** record of every action taken by the assistant. Every tool invocation, data access, model call, policy decision, agent exchange, and policy change is logged with full context.

Audit log entries are stored in PostgreSQL and retained for a minimum of 1 year (configurable by enterprise policy). Entries cannot be updated or deleted.

## API Endpoint

```
GET /api/v1/audit
```

All requests require authentication via Bearer token. The audit scope visible to a user depends on their role:

| Role | Visible Scope |
|---|---|
| `enterprise_admin` | All entries across the enterprise |
| `org_admin` | All entries within their organization |
| `team_lead` | All entries within their team |
| `user` | Only their own entries |

## Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `userId` | string | Filter by user ID |
| `actionType` | string | Filter by action type: `tool_invocation`, `data_access`, `model_call`, `policy_decision`, `agent_exchange`, `policy_change` |
| `policyResult` | string | Filter by policy result: `allow`, `deny`, `require_approval` |
| `outcome` | string | Filter by outcome: `success`, `denied`, `error`, `pending_approval` |
| `dataClassification` | string | Filter by data classification: `public`, `internal`, `confidential`, `restricted` |
| `startDate` | ISO 8601 | Start of date range (inclusive) |
| `endDate` | ISO 8601 | End of date range (inclusive) |
| `requestId` | string | Filter by specific request ID |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (default: 100, max: 1000) |

## Example Queries

### List All Actions for a User

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?userId=user-123&pageSize=10" \
  | jq '.'
```

Response:

```json
{
  "entries": [
    {
      "id": "audit-a1b2c3",
      "tenantId": "acme-corp",
      "userId": "user-123",
      "timestamp": "2026-03-13T14:30:00.000Z",
      "actionType": "data_access",
      "actionDetail": {
        "tool": "email_read",
        "params": { "messageId": "msg-456" },
        "itemCount": 1
      },
      "dataAccessed": [
        {
          "source": "gmail:msg-456",
          "classification": "internal",
          "purpose": "connector_read"
        }
      ],
      "modelUsed": null,
      "modelTokens": null,
      "dataClassification": "internal",
      "policyApplied": "connector-read-write-policy",
      "policyResult": "allow",
      "policyReason": "Connector access allowed",
      "outcome": "success",
      "requestId": "req-789"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalEntries": 247,
    "totalPages": 25
  }
}
```

### Find All Policy Denials

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?policyResult=deny&startDate=2026-03-01T00:00:00Z" \
  | jq '.entries[] | {timestamp, userId, action: .actionDetail.tool, reason: .policyReason}'
```

### Find All Model Calls with Confidential Data

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=model_call&dataClassification=confidential" \
  | jq '.entries[] | {timestamp, userId, model: .modelUsed, tokens: .modelTokens}'
```

### Find All Agent-to-Agent Exchanges

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange" \
  | jq '.entries[] | {timestamp, userId, detail: .actionDetail}'
```

### Find Actions in a Date Range

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?startDate=2026-03-10T00:00:00Z&endDate=2026-03-13T23:59:59Z&pageSize=50" \
  | jq '.entries | length'
```

### Trace a Specific Request

Use the `requestId` to trace all audit entries for a single user interaction:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?requestId=req-789" \
  | jq '.'
```

### Find Policy Changes

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=policy_change" \
  | jq '.entries[] | {timestamp, userId, detail: .actionDetail}'
```

## Export Endpoint

Enterprise admins can export audit logs for compliance reporting:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit/export?startDate=2026-01-01T00:00:00Z&endDate=2026-03-31T23:59:59Z&format=json" \
  -o audit-export-q1-2026.json
```

Supported export formats:

| Format | Content-Type | Description |
|---|---|---|
| `json` | `application/json` | JSON array of all matching entries |
| `csv` | `text/csv` | CSV with one row per entry |
| `jsonl` | `application/x-ndjson` | Newline-delimited JSON (streaming) |

> **Note:** Export is restricted to users with the `enterprise_admin` or `org_admin` role. The export scope is limited to the admin's organizational scope.

### Export with Filters

All query parameters apply to exports:

```bash
# Export all denied actions for Q1 2026
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit/export?policyResult=deny&startDate=2026-01-01T00:00:00Z&endDate=2026-03-31T23:59:59Z&format=csv" \
  -o denied-actions-q1.csv
```

## Understanding Audit Entry Fields

### Core Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique audit entry identifier |
| `tenantId` | string | Tenant (enterprise) identifier |
| `userId` | string | User who triggered the action |
| `timestamp` | ISO 8601 | When the action occurred |
| `requestId` | string | Correlation ID for the user interaction |

### Action Fields

| Field | Type | Description |
|---|---|---|
| `actionType` | string | Category of action (see below) |
| `actionDetail` | object | Action-specific details (tool name, params, etc.) |

Action types:

| actionType | Description |
|---|---|
| `tool_invocation` | Agent called a registered tool |
| `data_access` | Data was read from a connector |
| `model_call` | An AI model was called |
| `policy_decision` | A policy was evaluated |
| `agent_exchange` | Agent-to-agent OCIP exchange |
| `policy_change` | A policy was created/updated |

### Data Fields

| Field | Type | Description |
|---|---|---|
| `dataAccessed` | array | List of data sources accessed, with classification and purpose |
| `dataClassification` | string | Highest classification level in this action |
| `modelUsed` | string or null | Model identifier (for model_call actions) |
| `modelTokens` | object or null | Token counts: `{ input, output }` |

### Policy Fields

| Field | Type | Description |
|---|---|---|
| `policyApplied` | string | Name of the policy that was evaluated |
| `policyResult` | string | Decision: `allow`, `deny`, or `require_approval` |
| `policyReason` | string | Human-readable reason for the decision |
| `outcome` | string | Final outcome: `success`, `denied`, `error`, `pending_approval` |

## Pagination

The audit API uses page-based pagination:

```bash
# Page 1 (default)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?pageSize=100&page=1"

# Page 2
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?pageSize=100&page=2"
```

Default page size is 100. Maximum page size is 1000. The response includes pagination metadata:

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalEntries": 5432,
    "totalPages": 55
  }
}
```

> **Note:** Audit queries have a 10-second timeout (`AUDIT_QUERY_TIMEOUT_MS`). If your query is too broad, narrow it with filters or reduce the page size.

## Troubleshooting

| Symptom | Possible Cause | Resolution |
|---|---|---|
| Empty results | User role limits visible scope | Check your role; `user` role only sees own entries |
| 403 Forbidden | Insufficient permissions | Export requires `enterprise_admin` or `org_admin` role |
| Query timeout | Too broad a date range without filters | Add filters (userId, actionType, policyResult) to narrow results |
| Missing entries | Entries from before deployment | Audit log only contains entries from after OpenClaw Enterprise deployment |
