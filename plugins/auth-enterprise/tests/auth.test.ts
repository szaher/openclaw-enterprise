// ============================================================================
// OpenClaw Enterprise — Auth Enterprise Tests (T051)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapClaimsToRoles, derivePermissions, buildUserContext } from '../src/rbac/mapper.js';
import { createAuthMiddlewareHook } from '../src/hooks.js';
import type { OIDCClaims } from '../src/oidc/validator.js';
import type { HookContext } from '../src/hooks.js';
import type { HttpRequest } from '../src/routes.js';

// --- Test helpers ---

function makeClaims(overrides: Partial<OIDCClaims> = {}): OIDCClaims {
  return {
    sub: 'user-123',
    email: 'jane@example.com',
    name: 'Jane Doe',
    groups: [],
    org_unit: 'engineering',
    roles: [],
    iss: 'https://idp.example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    path: '/api/v1/some-resource',
    headers: {},
    ...overrides,
  };
}

function makeHookContext(req: HttpRequest): HookContext {
  return {
    request: req,
    metadata: {},
  };
}

const defaultMiddlewareConfig = {
  oidc: {
    issuerUrl: 'https://idp.example.com',
    jwksEndpoint: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'openclaw-enterprise',
  },
  defaultTenantId: 'tenant-1',
};

// --- OIDC Token Validation Tests ---

describe('OIDC token validation', () => {
  it('should reject empty token', async () => {
    const { validateToken } = await import('../src/oidc/validator.js');
    const config = {
      issuerUrl: 'https://idp.example.com',
      jwksEndpoint: 'https://idp.example.com/.well-known/jwks.json',
      audience: 'openclaw-enterprise',
    };

    await expect(validateToken('', config)).rejects.toThrow('Token is required');
  });

  it('should reject malformed token (not 3 parts)', async () => {
    const { validateToken } = await import('../src/oidc/validator.js');
    const config = {
      issuerUrl: 'https://idp.example.com',
      jwksEndpoint: 'https://idp.example.com/.well-known/jwks.json',
      audience: 'openclaw-enterprise',
    };

    await expect(validateToken('not.a.valid.jwt.token', config)).rejects.toThrow();
  });
});

// --- Role Mapping Tests ---

describe('mapClaimsToRoles', () => {
  it('should map enterprise-admins group to enterprise_admin role', () => {
    const claims = makeClaims({ groups: ['enterprise-admins'] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toContain('enterprise_admin');
  });

  it('should map org-admins group to org_admin role', () => {
    const claims = makeClaims({ groups: ['org-admins'] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toContain('org_admin');
  });

  it('should map team-leads group to team_lead role', () => {
    const claims = makeClaims({ groups: ['team-leads'] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toContain('team_lead');
  });

  it('should map roles claim to BuiltInRole', () => {
    const claims = makeClaims({ roles: ['org_admin'] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toContain('org_admin');
  });

  it('should default to user role when no groups/roles match', () => {
    const claims = makeClaims({ groups: ['unknown-group'], roles: ['unknown-role'] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toEqual(['user']);
  });

  it('should default to user role when groups and roles are empty', () => {
    const claims = makeClaims({ groups: [], roles: [] });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toEqual(['user']);
  });

  it('should deduplicate roles from multiple sources', () => {
    const claims = makeClaims({
      groups: ['org-admins'],
      roles: ['org_admin'],
    });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toEqual(['org_admin']);
  });

  it('should support multiple matched roles', () => {
    const claims = makeClaims({
      groups: ['org-admins', 'team-leads'],
    });
    const roles = mapClaimsToRoles(claims);
    expect(roles).toContain('org_admin');
    expect(roles).toContain('team_lead');
  });

  it('should accept custom role mappings', () => {
    const custom = new Map([['devops', 'enterprise_admin' as const]]);
    const claims = makeClaims({ groups: ['devops'] });
    const roles = mapClaimsToRoles(claims, custom);
    expect(roles).toContain('enterprise_admin');
  });
});

// --- Role Hierarchy / Permissions Tests ---

describe('derivePermissions', () => {
  it('should grant full permissions for enterprise_admin', () => {
    const perms = derivePermissions(['enterprise_admin']);
    expect(perms.canManagePolicies).toBe(true);
    expect(perms.policyScope).toBe('enterprise');
    expect(perms.canQueryAudit).toBe(true);
    expect(perms.auditScope).toBe('enterprise');
  });

  it('should grant org-level permissions for org_admin', () => {
    const perms = derivePermissions(['org_admin']);
    expect(perms.canManagePolicies).toBe(true);
    expect(perms.policyScope).toBe('org');
    expect(perms.canQueryAudit).toBe(true);
    expect(perms.auditScope).toBe('org');
  });

  it('should grant team-level audit for team_lead', () => {
    const perms = derivePermissions(['team_lead']);
    expect(perms.canManagePolicies).toBe(false);
    expect(perms.canQueryAudit).toBe(true);
    expect(perms.auditScope).toBe('team');
  });

  it('should grant minimal permissions for user role', () => {
    const perms = derivePermissions(['user']);
    expect(perms.canManagePolicies).toBe(false);
    expect(perms.policyScope).toBe('user');
    expect(perms.canQueryAudit).toBe(false);
    expect(perms.auditScope).toBe('user');
  });

  it('should use highest role when multiple roles present (enterprise_admin includes all)', () => {
    const perms = derivePermissions(['user', 'team_lead', 'enterprise_admin']);
    expect(perms.canManagePolicies).toBe(true);
    expect(perms.policyScope).toBe('enterprise');
    expect(perms.canQueryAudit).toBe(true);
    expect(perms.auditScope).toBe('enterprise');
  });

  it('should use highest role from org_admin and user', () => {
    const perms = derivePermissions(['user', 'org_admin']);
    expect(perms.canManagePolicies).toBe(true);
    expect(perms.policyScope).toBe('org');
  });

  it('should default to user permissions for empty roles array', () => {
    const perms = derivePermissions([]);
    expect(perms.canManagePolicies).toBe(false);
    expect(perms.canQueryAudit).toBe(false);
  });
});

// --- buildUserContext Tests ---

describe('buildUserContext', () => {
  it('should build a complete UserContext from claims', () => {
    const claims = makeClaims({ groups: ['enterprise-admins'] });
    const ctx = buildUserContext(claims, 'tenant-42');

    expect(ctx.userId).toBe('user-123');
    expect(ctx.email).toBe('jane@example.com');
    expect(ctx.roles).toContain('enterprise_admin');
    expect(ctx.orgUnit).toBe('engineering');
    expect(ctx.tenantId).toBe('tenant-42');
    expect(ctx.effectivePermissions.canManagePolicies).toBe(true);
  });

  it('should assign default user role for unrecognized claims', () => {
    const claims = makeClaims({ groups: ['random'], roles: ['unknown'] });
    const ctx = buildUserContext(claims, 'tenant-1');

    expect(ctx.roles).toEqual(['user']);
    expect(ctx.effectivePermissions.canManagePolicies).toBe(false);
  });
});

// --- Auth Middleware Hook Tests ---

describe('auth middleware hook', () => {
  // Mock validateToken for middleware tests
  vi.mock('../src/oidc/validator.js', () => ({
    validateToken: vi.fn(),
  }));

  let mockValidateToken: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const validatorModule = await import('../src/oidc/validator.js');
    mockValidateToken = validatorModule.validateToken as ReturnType<typeof vi.fn>;
    mockValidateToken.mockReset();
  });

  it('should reject requests with missing Authorization header (401)', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(false);
    expect(result.response?.status).toBe(401);
    expect((result.response?.body as Record<string, unknown>)['error']).toBe('missing_token');
  });

  it('should reject requests with non-Bearer Authorization header (401)', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it('should reject requests with invalid token (401)', async () => {
    mockValidateToken.mockRejectedValue(new Error('Invalid JWT signature'));

    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ headers: { authorization: 'Bearer bad-token' } });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(false);
    expect(result.response?.status).toBe(401);
    expect((result.response?.body as Record<string, unknown>)['error']).toBe('invalid_token');
  });

  it('should attach UserContext for valid token', async () => {
    const claims = makeClaims({ groups: ['org-admins'] });
    mockValidateToken.mockResolvedValue(claims);

    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ headers: { authorization: 'Bearer valid-token' } });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
    expect(result.request?.userContext).toBeDefined();
    expect(result.request?.userContext?.userId).toBe('user-123');
    expect(result.request?.userContext?.email).toBe('jane@example.com');
    expect(result.request?.userContext?.roles).toContain('org_admin');
    expect(result.request?.userContext?.effectivePermissions.canManagePolicies).toBe(true);
  });

  it('should bypass auth for /healthz', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ path: '/healthz', headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
  });

  it('should bypass auth for /readyz', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ path: '/readyz', headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
  });

  it('should bypass auth for /health', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ path: '/health', headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
  });

  it('should bypass auth for /metrics', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ path: '/metrics', headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
  });

  it('should bypass auth for /api/v1/auth/callback', async () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    const req = makeRequest({ path: '/api/v1/auth/callback', headers: {} });
    const result = await hook.handler(makeHookContext(req));

    expect(result.proceed).toBe(true);
  });

  it('should register on before_http_request event', () => {
    const hook = createAuthMiddlewareHook(defaultMiddlewareConfig);
    expect(hook.event).toBe('before_http_request');
  });
});
