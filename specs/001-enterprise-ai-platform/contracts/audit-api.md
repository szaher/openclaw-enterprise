# Contract: Audit API

**Type**: Gateway RPC Methods + REST HTTP Routes
**Plugin**: audit-enterprise

## Gateway RPC Methods (via registerGatewayMethod)

### audit.log

Write an audit entry. Called by all plugins for state-changing operations.

**Request**:
```json
{
  "method": "audit.log",
  "params": {
    "tenant_id": "string",
    "user_id": "string",
    "action_type": "tool_invocation | data_access | model_call | policy_decision | agent_exchange | policy_change",
    "action_detail": "object",
    "data_accessed": [
      {"source": "string", "classification": "string", "purpose": "string"}
    ],
    "model_used": "string | null",
    "model_tokens": {"input": "number", "output": "number"} | null,
    "data_classification": "string",
    "policy_applied": "string",
    "policy_result": "allow | deny | require_approval",
    "policy_reason": "string",
    "outcome": "success | denied | error | pending_approval",
    "request_id": "string"
  }
}
```

**Response**:
```json
{
  "audit_entry_id": "string",
  "timestamp": "string (ISO 8601)"
}
```

### audit.query

Query audit entries. Requires admin role scoped to the queried tenant/org.

**Request**:
```json
{
  "method": "audit.query",
  "params": {
    "tenant_id": "string",
    "filters": {
      "user_id": "string (optional)",
      "action_type": "string (optional)",
      "from": "string (ISO 8601)",
      "to": "string (ISO 8601)",
      "policy_result": "string (optional)",
      "request_id": "string (optional)"
    },
    "limit": "number (default: 100, max: 1000)",
    "offset": "number (default: 0)"
  }
}
```

**Response**:
```json
{
  "entries": ["array of AuditEntry objects"],
  "total_count": "number",
  "query_time_ms": "number"
}
```

## REST HTTP Routes (via registerHttpRoute)

### GET /api/v1/audit?user_id={}&from={}&to={}&action_type={}

Query audit log with filters. Paginated. Requires admin role.

### GET /api/v1/audit/{id}

Get a single audit entry by ID.

### GET /api/v1/audit/export?from={}&to={}&format=csv|json

Export audit entries for compliance reporting. Requires Enterprise Admin role.

All endpoints:
- Require SSO/OIDC authentication with admin scope
- Include `X-Request-Id` header
- Return results within 10 seconds (SC-007)
- No mutation endpoints (audit log is append-only; entries are created via `audit.log` RPC)
