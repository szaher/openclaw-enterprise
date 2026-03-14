# Contract: Admin API

**Type**: REST HTTP Routes
**Plugin**: auth-enterprise + policy-engine

## Authentication Endpoints

### POST /api/v1/auth/callback

OIDC callback endpoint. Handles SSO login flow and maps OIDC claims to OpenClaw operator roles/scopes.

### GET /api/v1/auth/userinfo

Returns current user's identity, roles, org unit, and effective permissions.

**Response**:
```json
{
  "user_id": "string",
  "email": "string",
  "roles": ["enterprise_admin | org_admin | team_lead | user"],
  "org_unit": "string",
  "tenant_id": "string",
  "effective_permissions": {
    "can_manage_policies": "boolean",
    "policy_scope": "enterprise | org | team",
    "can_query_audit": "boolean",
    "audit_scope": "enterprise | org | team"
  }
}
```

## Tenant Management

### GET /api/v1/tenants

List tenants. Enterprise Admin only.

### GET /api/v1/tenants/{id}/status

Tenant health status: gateway instances, connector status, policy count, user count.

## Connector Management

### GET /api/v1/connectors

List connectors for the current tenant.

### POST /api/v1/connectors

Register a new connector. Requires admin role.

**Request**:
```json
{
  "type": "gmail | gcal | jira | github | gdrive",
  "credentials_secret_ref": "string (K8s Secret name)",
  "config": {
    "polling_interval_seconds": "number (optional, default: 300)",
    "filters": "object (connector-specific, optional)"
  }
}
```

### DELETE /api/v1/connectors/{id}

Disable a connector (revokes access, does not delete historical data).

## System Status

### GET /api/v1/status

System health: gateway status, policy engine status, OPA sidecar status, connector statuses, database connectivity.

### GET /api/v1/metrics

Operational metrics: active users, auto-responses sent, tasks discovered, model calls, policy evaluations, audit entries. For SC-002 (time savings measurement) and Principle IX (Measure Everything).

All endpoints:
- Require SSO/OIDC authentication
- Versioned under /api/v1/
- Include X-Request-Id header
- Produce audit log entries for all mutations
