# OpenClaw Enterprise -- API Reference

This document describes the REST API surface exposed by OpenClaw Enterprise plugins. All endpoints are registered via the OpenClaw `registerHttpRoute` plugin API.

---

## Table of Contents

- [General Information](#general-information)
- [Authentication](#authentication)
- [Error Response Format](#error-response-format)
- [Rate Limiting](#rate-limiting)
- [Policy Engine Endpoints](#policy-engine-endpoints)
- [Audit Endpoints](#audit-endpoints)
- [Auth Endpoints](#auth-endpoints)
- [Connector Endpoints](#connector-endpoints)
- [Admin Endpoints](#admin-endpoints)

---

## General Information

| Property | Value |
|----------|-------|
| Base path | `/api/v1` |
| Protocol | HTTPS (mTLS between internal services) |
| Content type | `application/json` (unless otherwise noted) |
| Request ID | All responses include an `X-Request-Id` header for tracing |

---

## Authentication

All API endpoints require authentication via one of the following methods:

1. **Bearer Token (SSO/OIDC)**: Pass a valid OIDC ID token in the `Authorization` header.
2. **Session Cookie**: After successful OIDC callback, a `session` cookie is set with `HttpOnly; Secure; SameSite=Strict` attributes.

```
Authorization: Bearer <id_token>
```

Or:

```
Cookie: session=<session_id>
```

Unauthenticated requests receive a `401` response. Requests with insufficient role privileges receive a `403` response.

### Role-Based Access

| Role | Scope | Capabilities |
|------|-------|-------------|
| `enterprise_admin` | Full system | Manage policies at all scopes, export audit, manage tenants, view metrics |
| `org_admin` | Organization | Manage org/team/user policies, manage connectors, query audit within org |
| `team_lead` | Team | Manage team/user policies within their team |
| `user` | Self | View own policies, query own audit entries |

---

## Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error description",
  "detail": "Additional context (optional)"
}
```

### Standard Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `POLICY_HIERARCHY_VIOLATION` | Policy content violates scope hierarchy constraints |
| 400 | `missing_type` | Required field missing from request body |
| 400 | `invalid_type` | Invalid value for a typed field |
| 401 | `authentication_required` | No valid authentication credentials provided |
| 401 | `no_session` | No session cookie present |
| 401 | `session_expired` | Session has expired |
| 401 | `invalid_token` | OIDC token validation failed |
| 403 | `forbidden` | User lacks the required role |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 404 | `tenant_not_found` | Tenant ID not found |
| 502 | `token_exchange_failed` | Failed to exchange authorization code with IdP |

---

## Rate Limiting

Rate limiting is applied per tenant to prevent resource exhaustion:

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Policy mutations (POST, PUT, DELETE) | 60 requests | per minute |
| Audit queries (GET) | 120 requests | per minute |
| Export (GET /audit/export) | 10 requests | per minute |
| Admin endpoints | 60 requests | per minute |
| System status | 300 requests | per minute |

When a rate limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating seconds until the limit resets.

---

## Policy Engine Endpoints

Provided by: `plugins/policy-engine`

### POST /api/v1/policies

Create a new policy. Validates hierarchy constraints before persisting.

**Required Role:** `enterprise_admin`, `org_admin`, or `team_lead` (scope-dependent)

**Request Body:**

```json
{
  "scope": "org",
  "scopeId": "engineering",
  "domain": "models",
  "name": "Engineering Model Policy",
  "version": "1.0.0",
  "content": "allowed_classifications:\n  - public\n  - internal\nmax_classification: internal",
  "changeReason": "Initial policy for engineering org"
}
```

**Response (201 Created):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "scope": "org",
  "scopeId": "engineering",
  "domain": "models",
  "name": "Engineering Model Policy",
  "version": "1.0.0",
  "content": "allowed_classifications:\n  - public\n  - internal\nmax_classification: internal",
  "status": "active",
  "createdBy": "user-123",
  "createdAt": "2026-03-13T10:00:00.000Z",
  "updatedAt": "2026-03-13T10:00:00.000Z",
  "changeReason": "Initial policy for engineering org"
}
```

**Error (400 -- Hierarchy Violation):**

```json
{
  "error": "POLICY_HIERARCHY_VIOLATION",
  "detail": ["Org policy cannot expand max_classification beyond enterprise limit"]
}
```

### GET /api/v1/policies

List policies with optional filters.

**Required Role:** Authenticated user (results scoped by role)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | string | No | Filter by scope: `enterprise`, `org`, `team`, `user` |
| `domain` | string | No | Filter by domain: `models`, `actions`, etc. |

**Response (200 OK):**

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "scope": "enterprise",
    "scopeId": "acme-corp",
    "domain": "models",
    "name": "Enterprise Model Policy",
    "version": "2.0.0",
    "content": "...",
    "status": "active",
    "createdBy": "admin-001",
    "createdAt": "2026-03-01T08:00:00.000Z",
    "updatedAt": "2026-03-10T14:30:00.000Z",
    "changeReason": "Updated allowed providers"
  }
]
```

### GET /api/v1/policies/:id

Retrieve a single policy by ID.

**Required Role:** Authenticated user

**Response (200 OK):** Single policy object (same shape as list items).

**Response (404 Not Found):**

```json
{
  "error": "NOT_FOUND",
  "detail": "Policy a1b2c3d4-... not found"
}
```

### PUT /api/v1/policies/:id

Update an existing policy. Re-validates hierarchy constraints if `content` is changed.

**Required Role:** `enterprise_admin`, `org_admin`, or `team_lead` (scope-dependent)

**Request Body:**

```json
{
  "content": "allowed_classifications:\n  - public\nmax_classification: public",
  "changeReason": "Restricted to public-only models"
}
```

**Response (200 OK):** Updated policy object.

### DELETE /api/v1/policies/:id

Deprecate a policy. This sets the status to `deprecated` rather than deleting the record.

**Required Role:** `enterprise_admin`, `org_admin`, or `team_lead` (scope-dependent)

**Response (200 OK):** Deprecated policy object with `"status": "deprecated"`.

---

## Audit Endpoints

Provided by: `plugins/audit-enterprise`

### GET /api/v1/audit

Query audit entries with filters and pagination.

**Required Role:** Authenticated user (results scoped by tenant)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | No | Filter by user ID |
| `action_type` | string | No | Filter by action type |
| `from` | string | No | Start of time range (ISO 8601) |
| `to` | string | No | End of time range (ISO 8601) |
| `page` | integer | No | Page number (default: 1) |
| `page_size` | integer | No | Results per page (default: 100, max: 1000) |

**Response (200 OK):**

```json
{
  "entries": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "tenantId": "acme-corp",
      "userId": "user-123",
      "timestamp": "2026-03-13T09:15:00.000Z",
      "actionType": "model_call",
      "actionDetail": {
        "model": "gpt-4",
        "purpose": "task_summarization"
      },
      "dataAccessed": [
        {
          "source": "jira",
          "classification": "internal",
          "purpose": "summarize ticket"
        }
      ],
      "modelUsed": "gpt-4",
      "modelTokens": { "input": 1200, "output": 350 },
      "dataClassification": "internal",
      "policyApplied": "enterprise-model-policy-v2",
      "policyResult": "allow",
      "policyReason": "Model call allowed by policy",
      "outcome": "success",
      "requestId": "req-abc-123"
    }
  ],
  "total": 1542
}
```

### GET /api/v1/audit/:id

Retrieve a single audit entry by ID.

**Required Role:** Authenticated user (tenant-scoped)

**Response (200 OK):** Single audit entry object.

### GET /api/v1/audit/export

Export audit entries as CSV or JSON. Intended for compliance reporting.

**Required Role:** `enterprise_admin`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | No | `json` (default) or `csv` |
| `user_id` | string | No | Filter by user ID |
| `action_type` | string | No | Filter by action type |
| `from` | string | No | Start of time range (ISO 8601) |
| `to` | string | No | End of time range (ISO 8601) |

**Response (200 OK -- JSON format):**

```json
{
  "entries": [ ... ],
  "total": 500
}
```

**Response (200 OK -- CSV format):**

Returns a CSV file download with headers: `id, tenant_id, user_id, timestamp, action_type, data_classification, policy_applied, policy_result, outcome, request_id`.

Response headers:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="audit-export.csv"
```

---

## Auth Endpoints

Provided by: `plugins/auth-enterprise`

### POST /api/v1/auth/callback

Exchange an OIDC authorization code for tokens and establish a session.

**Authentication:** None (this is the authentication entry point)

**Request Body:**

```json
{
  "code": "authorization_code_from_idp"
}
```

**Response (200 OK):**

```json
{
  "authenticated": true,
  "user": {
    "userId": "user-123",
    "email": "alice@acme.com",
    "roles": ["org_admin"],
    "orgUnit": "engineering"
  }
}
```

Response headers include:
```
Set-Cookie: session=<session_id>; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
```

### GET /api/v1/auth/userinfo

Return the current user context from the active session.

**Required:** Valid session cookie

**Response (200 OK):**

```json
{
  "userId": "user-123",
  "email": "alice@acme.com",
  "roles": ["org_admin"],
  "orgUnit": "engineering",
  "tenantId": "acme-corp",
  "effectivePermissions": {
    "canManagePolicies": true,
    "policyScope": "org",
    "canQueryAudit": true,
    "auditScope": "org"
  }
}
```

---

## Connector Endpoints

Provided by: `plugins/auth-enterprise` (admin routes)

### GET /api/v1/connectors

List connectors for the current tenant.

**Required Role:** `enterprise_admin` or `org_admin`

**Response (200 OK):**

```json
{
  "connectors": [
    {
      "id": "conn-001",
      "type": "gmail",
      "tenantId": "acme-corp",
      "credentialsSecretRef": "k8s-secret/gmail-creds",
      "config": {},
      "status": "active",
      "createdAt": "2026-03-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### POST /api/v1/connectors

Register a new connector.

**Required Role:** `enterprise_admin` or `org_admin`

**Request Body:**

```json
{
  "type": "jira",
  "credentials_secret_ref": "k8s-secret/jira-creds",
  "config": {
    "base_url": "https://acme.atlassian.net",
    "project_keys": ["ENG", "OPS"]
  }
}
```

**Response (201 Created):** Connector object.

### DELETE /api/v1/connectors/:id

Disable a connector. Historical data is not deleted.

**Required Role:** `enterprise_admin` or `org_admin`

**Response (200 OK):**

```json
{
  "id": "conn-001",
  "status": "disabled"
}
```

---

## Admin Endpoints

Provided by: `plugins/auth-enterprise` (admin routes)

### GET /api/v1/tenants

List all tenants.

**Required Role:** `enterprise_admin`

**Response (200 OK):**

```json
{
  "tenants": [
    {
      "id": "acme-corp",
      "name": "Acme Corporation",
      "status": "active",
      "gatewayInstances": 3,
      "connectorCount": 5,
      "policyCount": 12,
      "userCount": 150,
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### GET /api/v1/tenants/:id/status

Get detailed health status for a specific tenant.

**Required Role:** `enterprise_admin`

**Response (200 OK):**

```json
{
  "id": "acme-corp",
  "name": "Acme Corporation",
  "status": "active",
  "gatewayInstances": 3,
  "connectorCount": 5,
  "policyCount": 12,
  "userCount": 150
}
```

### GET /api/v1/status

Aggregated system health across all components.

**Authentication:** None required (health check endpoint)

**Response (200 OK -- all healthy):**

```json
{
  "status": "healthy",
  "components": {
    "gateway": { "status": "healthy" },
    "policyEngine": { "status": "healthy" },
    "opa": { "status": "healthy" },
    "connectors": {
      "gmail": { "status": "healthy" },
      "jira": { "status": "healthy" }
    },
    "database": { "status": "healthy" }
  },
  "timestamp": "2026-03-13T10:00:00.000Z"
}
```

**Response (503 Service Unavailable -- degraded):**

```json
{
  "status": "degraded",
  "components": {
    "gateway": { "status": "healthy" },
    "policyEngine": { "status": "healthy" },
    "opa": { "status": "unhealthy" },
    "connectors": {
      "gmail": { "status": "healthy" },
      "jira": { "status": "unhealthy" }
    },
    "database": { "status": "healthy" }
  },
  "timestamp": "2026-03-13T10:00:00.000Z"
}
```

### GET /api/v1/metrics

Operational metrics for the system.

**Required Role:** `enterprise_admin` or `org_admin`

**Response (200 OK):**

```json
{
  "activeUsers": 142,
  "autoResponsesSent": 3847,
  "tasksDiscovered": 12503,
  "modelCalls": 89421,
  "policyEvaluations": 245612,
  "auditEntries": 1204877,
  "collectedAt": "2026-03-13T10:00:00.000Z"
}
```

---

## Endpoint Summary

| Method | Path | Plugin | Role Required |
|--------|------|--------|---------------|
| POST | `/api/v1/policies` | policy-engine | Admin (scope-dependent) |
| GET | `/api/v1/policies` | policy-engine | Authenticated |
| GET | `/api/v1/policies/:id` | policy-engine | Authenticated |
| PUT | `/api/v1/policies/:id` | policy-engine | Admin (scope-dependent) |
| DELETE | `/api/v1/policies/:id` | policy-engine | Admin (scope-dependent) |
| GET | `/api/v1/audit` | audit-enterprise | Authenticated |
| GET | `/api/v1/audit/:id` | audit-enterprise | Authenticated |
| GET | `/api/v1/audit/export` | audit-enterprise | `enterprise_admin` |
| POST | `/api/v1/auth/callback` | auth-enterprise | None |
| GET | `/api/v1/auth/userinfo` | auth-enterprise | Session required |
| GET | `/api/v1/connectors` | auth-enterprise | Admin |
| POST | `/api/v1/connectors` | auth-enterprise | Admin |
| DELETE | `/api/v1/connectors/:id` | auth-enterprise | Admin |
| GET | `/api/v1/tenants` | auth-enterprise | `enterprise_admin` |
| GET | `/api/v1/tenants/:id/status` | auth-enterprise | `enterprise_admin` |
| GET | `/api/v1/status` | auth-enterprise | None |
| GET | `/api/v1/metrics` | auth-enterprise | Admin |
