# auth-enterprise

Enterprise authentication and authorization plugin for OpenClaw. Provides OIDC/SSO integration, RBAC role mapping, and request-level auth middleware.

## Overview

This plugin handles:

- **OIDC Authentication**: Validates JWT tokens from enterprise identity providers (Entra ID, Okta, Keycloak, etc.)
- **RBAC Role Mapping**: Maps IdP groups and roles to OpenClaw Enterprise built-in roles
- **Auth Middleware**: Automatically validates tokens and attaches `UserContext` to every request

## SSO/OIDC Setup

### Prerequisites

1. An OIDC-compliant identity provider
2. A registered OAuth2/OIDC client application with:
   - Authorization Code flow enabled
   - Redirect URI configured (e.g., `https://your-domain/api/v1/auth/callback`)
   - `groups` and `roles` claims included in ID tokens

### Configuration

```typescript
import { register } from '@openclaw-enterprise/auth-enterprise';

const plugin = register({
  routes: {
    oidc: {
      issuerUrl: 'https://idp.example.com/realms/enterprise',
      jwksEndpoint: 'https://idp.example.com/realms/enterprise/protocol/openid-connect/certs',
      audience: 'openclaw-enterprise',
      clockSkewSeconds: 30,
    },
    tokenEndpoint: 'https://idp.example.com/realms/enterprise/protocol/openid-connect/token',
    clientId: 'openclaw-enterprise',
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    redirectUri: 'https://your-domain/api/v1/auth/callback',
    defaultTenantId: 'your-tenant-id',
    sessionTtlSeconds: 3600,
  },
  middleware: {
    oidc: {
      issuerUrl: 'https://idp.example.com/realms/enterprise',
      jwksEndpoint: 'https://idp.example.com/realms/enterprise/protocol/openid-connect/certs',
      audience: 'openclaw-enterprise',
    },
    defaultTenantId: 'your-tenant-id',
  },
});
```

### Environment Variables

| Variable | Description |
|---|---|
| `OIDC_ISSUER_URL` | OIDC provider issuer URL |
| `OIDC_JWKS_ENDPOINT` | JWKS endpoint for public key retrieval |
| `OIDC_CLIENT_ID` | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | Redirect URI for auth callback |

## Role Mapping

The plugin maps OIDC `groups` and `roles` claims to OpenClaw Enterprise built-in roles:

### Default Mappings

| IdP Group / Role | Enterprise Role |
|---|---|
| `enterprise-admins` / `enterprise_admin` | `enterprise_admin` |
| `org-admins` / `org_admin` | `org_admin` |
| `team-leads` / `team_lead` | `team_lead` |
| `users` / `user` | `user` |

If no mapping matches, the user is assigned the default `user` role.

### Role Hierarchy

Roles are hierarchical -- higher roles inherit all permissions of lower roles:

```
enterprise_admin > org_admin > team_lead > user
```

### Effective Permissions by Role

| Role | Manage Policies | Policy Scope | Query Audit | Audit Scope |
|---|---|---|---|---|
| `enterprise_admin` | Yes | enterprise | Yes | enterprise |
| `org_admin` | Yes | org | Yes | org |
| `team_lead` | No | team | Yes | team |
| `user` | No | user | No | user |

### Custom Mappings

Pass a custom mapping table to override defaults:

```typescript
import { mapClaimsToRoles } from '@openclaw-enterprise/auth-enterprise';

const customMappings = new Map([
  ['platform-engineers', 'enterprise_admin'],
  ['department-managers', 'org_admin'],
]);

const roles = mapClaimsToRoles(claims, customMappings);
```

## Middleware Behavior

The `before_http_request` hook runs on every incoming HTTP request:

1. **Bypass check**: Health/readiness endpoints skip authentication (`/healthz`, `/readyz`, `/health`, `/ready`, `/metrics`, `/api/v1/auth/callback`)
2. **Token extraction**: Reads `Bearer <token>` from the `Authorization` header
3. **Token validation**: Verifies JWT signature (via JWKS), expiry, and issuer
4. **Role mapping**: Maps IdP claims to enterprise roles and derives permissions
5. **Context attachment**: Attaches `UserContext` to the request for downstream handlers

### Error Responses

| Scenario | Status | Error Code |
|---|---|---|
| Missing Authorization header | 401 | `missing_token` |
| Invalid or expired token | 401 | `invalid_token` |
| Malformed Bearer header | 401 | `missing_token` |

## Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/callback` | Exchange authorization code for tokens |
| `GET` | `/api/v1/auth/userinfo` | Return current user context from session |

## Dependencies

- `policy-engine` -- for policy evaluation on auth decisions
- `audit-enterprise` -- for logging authentication events
