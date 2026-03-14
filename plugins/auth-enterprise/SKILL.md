# Skill: auth-enterprise

## When to use

Use this skill whenever the agent needs to:

- **Authenticate a user**: Validate an OIDC/JWT token from a corporate identity provider (Entra ID, Okta, Keycloak, etc.)
- **Determine user permissions**: Check what a user is allowed to do based on their enterprise role
- **Access user context**: Retrieve the current user's identity, roles, org unit, and effective permissions
- **Protect an endpoint**: Ensure an HTTP route requires a valid Bearer token

## How authentication works

1. Users authenticate via their corporate SSO (OIDC flow)
2. The IdP redirects to `POST /api/v1/auth/callback` with an authorization code
3. The plugin exchanges the code for an ID token, validates it, and establishes a session
4. Subsequent requests include a Bearer token in the `Authorization` header
5. The `before_http_request` hook validates the token and attaches a `UserContext` to every request

## Role hierarchy

Roles are hierarchical. Higher roles inherit all permissions of lower roles:

| Role | Policy Mgmt | Policy Scope | Audit Access | Audit Scope |
|---|---|---|---|---|
| `enterprise_admin` | Yes | enterprise | Yes | enterprise |
| `org_admin` | Yes | org | Yes | org |
| `team_lead` | No | team | Yes | team |
| `user` | No | user | No | user |

## How the agent sees UserContext

Every authenticated request carries a `UserContext` object:

```typescript
{
  userId: "sub-from-idp",
  email: "jane@example.com",
  roles: ["org_admin"],
  orgUnit: "engineering",
  tenantId: "tenant-123",
  effectivePermissions: {
    canManagePolicies: true,
    policyScope: "org",
    canQueryAudit: true,
    auditScope: "org"
  }
}
```

The agent should check `effectivePermissions` before performing privileged operations:

- Before modifying policies, check `canManagePolicies` and respect `policyScope`
- Before querying audit logs, check `canQueryAudit` and respect `auditScope`
- Default role is `user` if the IdP groups/roles do not match any mapping

## Health check bypass

The following paths skip authentication:
- `/healthz`, `/readyz`, `/health`, `/ready`
- `/api/v1/auth/callback`
- `/metrics`
