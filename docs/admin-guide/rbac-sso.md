# RBAC and SSO Administration

OpenClaw Enterprise requires SSO/OIDC for authentication. Password-only authentication is not supported. Authorization is enforced through four built-in roles mapped from OIDC claims.

---

## SSO/OIDC Authentication

### Supported Identity Providers

OpenClaw Enterprise supports any OIDC-compliant identity provider. The following have been explicitly tested:

| Provider | Status | Notes |
|---|---|---|
| Keycloak | Fully supported | Recommended for self-hosted deployments |
| Okta | Fully supported | Recommended for organizations already using Okta |
| Azure AD (Entra ID) | Fully supported | Recommended for Microsoft-centric organizations |
| Any OIDC-compliant IdP | Supported | Must support standard OIDC discovery and token endpoints |

### OIDC Configuration

OIDC configuration is provided via Kubernetes Secret and environment variables:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-oidc
  namespace: openclaw
type: Opaque
stringData:
  OIDC_ISSUER_URL: "https://keycloak.example.com/realms/openclaw"
  OIDC_CLIENT_ID: "openclaw-enterprise"
  OIDC_CLIENT_SECRET: "your-client-secret"
  OIDC_REDIRECT_URI: "https://openclaw.example.com/auth/callback"
  OIDC_SCOPES: "openid profile email groups"
```

### Required OIDC Claims

The following claims must be present in the ID token or UserInfo response:

| Claim | Required | Description |
|---|---|---|
| `sub` | Yes | Unique user identifier |
| `email` | Yes | User email address (used as `user_id` in audit logs) |
| `name` | Yes | Display name |
| `groups` | Yes | Group memberships (used for role mapping) |
| `org_unit` | Recommended | Organizational unit path (e.g., `engineering/platform`) |

### Token Validation

The OIDC validator plugin performs the following checks on every request:

1. **Signature verification** -- Token signature is verified against the IdP's JWKS endpoint.
2. **Issuer validation** -- `iss` claim must match the configured `OIDC_ISSUER_URL`.
3. **Audience validation** -- `aud` claim must include the configured `OIDC_CLIENT_ID`.
4. **Expiration check** -- `exp` claim must be in the future.
5. **Not-before check** -- `nbf` claim (if present) must be in the past.

Failed validation results in a `401 Unauthorized` response. The validation failure is logged to the audit trail.

---

## Role-Based Access Control (RBAC)

### Built-in Roles

OpenClaw Enterprise provides four built-in roles in a strict hierarchy:

| Role | Level | Description |
|---|---|---|
| `enterprise_admin` | Highest | Full system administration across all tenants and organizations |
| `org_admin` | Organization | Administration within a specific organization unit |
| `team_lead` | Team | Team-level management and policy within a team |
| `user` | Lowest | Standard user with no administrative privileges |

### Role Permissions Matrix

| Permission | `enterprise_admin` | `org_admin` | `team_lead` | `user` |
|---|---|---|---|---|
| Create/update enterprise policies | Yes | No | No | No |
| Create/update org policies | Yes | Yes (own org) | No | No |
| Create/update team policies | Yes | Yes (own org) | Yes (own team) | No |
| Create/update user policies | Yes | Yes (own org) | Yes (own team) | Yes (own) |
| View enterprise policies | Yes | Yes | Yes | Yes |
| View org policies | Yes | Yes (own org) | Yes (own org) | Yes (own org) |
| Query audit log (all tenants) | Yes | No | No | No |
| Query audit log (own org) | Yes | Yes | No | No |
| Query audit log (own actions) | Yes | Yes | Yes | Yes |
| Export audit data | Yes | No | No | No |
| Manage tenants | Yes | No | No | No |
| Manage connectors (enable/disable) | Yes | Yes (own org) | No | No |
| View connector status | Yes | Yes | Yes | No |
| Manage user roles (own org) | Yes | Yes | No | No |
| View system metrics | Yes | Yes | No | No |
| View system status | Yes | Yes | Yes | No |
| Override data classification | Yes | Yes (own org) | No | No |
| GDPR data export/anonymize | Yes | No | No | No |
| Use AI assistant features | Yes | Yes | Yes | Yes |

### Role Hierarchy

Higher roles inherit all permissions of lower roles. An `enterprise_admin` can do everything an `org_admin`, `team_lead`, and `user` can do, plus additional enterprise-level operations.

```
enterprise_admin
  └── org_admin
        └── team_lead
              └── user
```

---

## OIDC Claims to Role Mapping

Roles are mapped from OIDC group claims. The mapping is configured in the auth-enterprise plugin configuration:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: openclaw-rbac-mapping
  namespace: openclaw
data:
  role_mapping.yaml: |
    mappings:
      - oidc_group: "openclaw-enterprise-admins"
        role: "enterprise_admin"

      - oidc_group: "openclaw-org-admins"
        role: "org_admin"
        org_unit_claim: "org_unit"

      - oidc_group: "openclaw-team-leads"
        role: "team_lead"
        org_unit_claim: "org_unit"

      - oidc_group: "*"
        role: "user"
        org_unit_claim: "org_unit"

    default_role: "user"
```

### Mapping Rules

1. Groups are evaluated in order. The first matching group determines the role.
2. The `org_unit_claim` field specifies which OIDC claim contains the user's organizational unit path.
3. The wildcard `*` matches any group and serves as a fallback.
4. If no group matches and no default is configured, authentication succeeds but the user receives no role (effectively no access).

### Org Unit Path Structure

Organizational units are expressed as slash-separated paths:

```
engineering
engineering/platform
engineering/platform/infrastructure
sales
sales/enterprise
```

Policies scoped to `engineering` apply to all users in `engineering`, `engineering/platform`, and `engineering/platform/infrastructure`. Policies scoped to `engineering/platform` apply only to users in `engineering/platform` and its children.

### Example: Keycloak Group Setup

In Keycloak, create the following groups:

```
openclaw-enterprise-admins
openclaw-org-admins
openclaw-team-leads
```

Add the `groups` protocol mapper to the OpenClaw client:

1. Navigate to Clients > openclaw-enterprise > Client scopes > dedicated scope.
2. Add mapper > By configuration > Group Membership.
3. Name: `groups`, Token Claim Name: `groups`, Full group path: OFF.

Add the `org_unit` protocol mapper:

1. Add mapper > By configuration > User Attribute.
2. Name: `org_unit`, User Attribute: `org_unit`, Token Claim Name: `org_unit`.

### Example: Okta Group Setup

In Okta, create the corresponding groups and assign users. Then configure the Groups claim:

1. Navigate to Applications > OpenClaw Enterprise > Sign On > OpenID Connect ID Token.
2. Add Groups claim: Name: `groups`, Filter: Starts with `openclaw-`.

For the `org_unit` claim, add a custom profile attribute:

1. Navigate to Directory > Profile Editor > User (default).
2. Add attribute: Display name: `Org Unit`, Variable name: `org_unit`, Type: string.
3. Add claim mapping in the application: Name: `org_unit`, Value: `user.org_unit`.

### Example: Azure AD (Entra ID) Setup

In Azure AD, create Security Groups:

```
openclaw-enterprise-admins
openclaw-org-admins
openclaw-team-leads
```

Configure the application registration:

1. Navigate to App registrations > OpenClaw Enterprise > Token configuration.
2. Add groups claim: Security groups, Group ID (or names if configured).
3. Add optional claim: `org_unit` (requires extension attribute configuration).

> **Note:** Azure AD returns group IDs by default, not names. Either configure Azure AD to return group names, or use group IDs in the role mapping configuration.

---

## Admin API Endpoints

### Tenant Management

Available to `enterprise_admin` only.

```bash
# List all tenants
curl -X GET https://openclaw.example.com/api/v1/admin/tenants \
  -H "Authorization: Bearer $TOKEN"

# Create a tenant
curl -X POST https://openclaw.example.com/api/v1/admin/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tenant_acme",
    "name": "Acme Corporation",
    "domains": ["acme.com", "acme.io"],
    "oidc_issuer": "https://keycloak.acme.com/realms/openclaw"
  }'

# Update a tenant
curl -X PUT https://openclaw.example.com/api/v1/admin/tenants/tenant_acme \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "domains": ["acme.com", "acme.io", "acme.dev"]
  }'
```

### System Status

```bash
curl -X GET https://openclaw.example.com/api/v1/admin/status \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "components": {
    "opa_sidecar": "healthy",
    "database": "healthy",
    "connectors": {
      "gmail": "active",
      "gcal": "active",
      "jira": "error",
      "github": "active",
      "gdrive": "active"
    },
    "plugins": {
      "policy-engine": "running",
      "audit-enterprise": "running",
      "auth-enterprise": "running",
      "task-intelligence": "running",
      "auto-response": "running",
      "work-tracking": "running",
      "ocip-protocol": "running",
      "org-intelligence": "running",
      "visualization": "running"
    }
  },
  "uptime_seconds": 2592000
}
```

### System Metrics

```bash
curl -X GET https://openclaw.example.com/api/v1/admin/metrics \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "period": "last_24h",
  "actions": {
    "total": 15234,
    "allowed": 14891,
    "denied": 298,
    "pending_approval": 45
  },
  "models": {
    "total_requests": 8921,
    "total_tokens": {
      "prompt": 12500000,
      "completion": 3200000
    },
    "by_model": {
      "gpt-4": { "requests": 5200, "tokens": 9800000 },
      "llama-3-70b": { "requests": 3721, "tokens": 5900000 }
    }
  },
  "connectors": {
    "total_syncs": 1440,
    "total_items_synced": 28450,
    "errors": 12
  },
  "audit": {
    "total_entries": 45702,
    "storage_size_mb": 234
  }
}
```

### Connector Management

```bash
# List connectors (org_admin+)
curl -X GET https://openclaw.example.com/api/v1/connectors \
  -H "Authorization: Bearer $TOKEN"
```

See [Connectors](connectors.md) for detailed connector management documentation.

---

## Security Considerations

### Session Management

- Access tokens have a short lifetime (default: 15 minutes).
- Refresh tokens are used to obtain new access tokens without re-authentication.
- Token refresh events are logged to the audit trail.
- Revoking a user's session at the IdP takes effect when the current access token expires.

### Multi-Tenancy Isolation

- Each tenant has isolated policy hierarchies, audit logs, and connector configurations.
- Cross-tenant data access is not possible through the application layer.
- The `tenant_id` field is set from the OIDC token and cannot be spoofed by the client.

### Principle of Least Privilege

- New users receive the `user` role by default (no administrative access).
- Connectors are read-only by default.
- The policy engine is deny-by-default.
- All role escalations require explicit configuration in the OIDC group mapping.

---

## Troubleshooting

### OIDC Authentication Failures

1. Verify the OIDC issuer URL is reachable from the OpenClaw pods: `curl https://keycloak.example.com/realms/openclaw/.well-known/openid-configuration`.
2. Check that the client ID and secret match the IdP configuration.
3. Verify the redirect URI matches exactly (including trailing slashes).
4. Check the IdP logs for authentication errors.
5. Review the OpenClaw audit log for `auth_failure` entries.

### Missing or Incorrect Role Assignment

1. Decode the user's ID token and inspect the `groups` claim: `echo $TOKEN | cut -d. -f2 | base64 -d | jq .groups`.
2. Verify the group names match the role mapping configuration.
3. Check that the `org_unit` claim is present and correctly formatted.
4. Review the role mapping order -- the first matching group wins.

### User Cannot Access Expected Resources

1. Confirm the user's role and org unit path.
2. Check for policies at the user's org unit level and all parent levels.
3. Remember that the hierarchy is restrictive: a user in `engineering/platform` is subject to both the `engineering` and `engineering/platform` policies, with the more restrictive combination taking effect.
4. Query the audit log for the user's recent policy decisions to see which policy caused the denial.
