// ============================================================================
// OpenClaw Enterprise — Admin Endpoint Tests (T151)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { UserContext, BuiltInRole } from '@openclaw-enterprise/shared';
import {
  createAdminRoutes,
  clearTenants,
  upsertTenant,
  clearConnectors,
  upsertConnector,
  clearSessions,
  type HttpRequest,
  type HttpResponse,
  type HttpRouteRegistration,
  type AdminRoutesConfig,
  type SystemHealthProvider,
  type MetricsProvider,
  type TenantRecord,
  type ConnectorRecord,
} from '../../src/routes.js';

// --- Test helpers ---

function makeUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'user-001',
    email: 'admin@example.com',
    roles: ['enterprise_admin'],
    orgUnit: 'platform',
    tenantId: 'tenant-1',
    effectivePermissions: {
      canManagePolicies: true,
      policyScope: 'enterprise',
      canQueryAudit: true,
      auditScope: 'enterprise',
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    path: '/api/v1/tenants',
    headers: {},
    userContext: makeUserContext(),
    ...overrides,
  };
}

function makeHealthProvider(overrides: Partial<SystemHealthProvider> = {}): SystemHealthProvider {
  return {
    checkGateway: async () => ({ status: 'healthy' }),
    checkPolicyEngine: async () => ({ status: 'healthy' }),
    checkOpa: async () => ({ status: 'healthy' }),
    checkConnectors: async () => ({ gmail: { status: 'healthy' } }),
    checkDb: async () => ({ status: 'healthy' }),
    ...overrides,
  };
}

function makeMetricsProvider(overrides: Partial<MetricsProvider> = {}): MetricsProvider {
  return {
    getMetrics: async () => ({
      activeUsers: 42,
      autoResponsesSent: 128,
      tasksDiscovered: 350,
      modelCalls: 1200,
      policyEvaluations: 5000,
      auditEntries: 8900,
    }),
    ...overrides,
  };
}

function makeAdminConfig(
  health?: Partial<SystemHealthProvider>,
  metrics?: Partial<MetricsProvider>,
): AdminRoutesConfig {
  return {
    healthProvider: makeHealthProvider(health),
    metricsProvider: makeMetricsProvider(metrics),
  };
}

function findRoute(
  routes: HttpRouteRegistration[],
  method: string,
  pathFragment: string,
): HttpRouteRegistration | undefined {
  return routes.find(
    (r) => r.method === method && r.path.includes(pathFragment),
  );
}

// --- Setup ---

let routes: HttpRouteRegistration[];

function seedTenant(id = 'tenant-1'): TenantRecord {
  const tenant: TenantRecord = {
    id,
    name: `Tenant ${id}`,
    status: 'active',
    gatewayInstances: 2,
    connectorCount: 5,
    policyCount: 12,
    userCount: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  upsertTenant(tenant);
  return tenant;
}

function seedConnector(id = 'conn-1', tenantId = 'tenant-1'): ConnectorRecord {
  const connector: ConnectorRecord = {
    id,
    type: 'gmail',
    tenantId,
    credentialsSecretRef: 'secret-gmail',
    config: { polling_interval_seconds: 300 },
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  upsertConnector(connector);
  return connector;
}

beforeEach(() => {
  clearTenants();
  clearConnectors();
  clearSessions();
  routes = createAdminRoutes(makeAdminConfig());
});

// ============================================================================
// T144: Tenant Listing
// ============================================================================

describe('Tenant Management (T144)', () => {
  it('should list tenants for enterprise_admin', async () => {
    seedTenant('tenant-1');
    seedTenant('tenant-2');

    const route = findRoute(routes, 'GET', '/tenants')!;
    expect(route).toBeDefined();

    const req = makeRequest({ path: '/api/v1/tenants' });
    const res = await route.handler(req);
    expect(res.status).toBe(200);

    const body = res.body as { tenants: TenantRecord[]; total: number };
    expect(body.total).toBe(2);
    expect(body.tenants).toHaveLength(2);
  });

  it('should return empty list when no tenants exist', async () => {
    const route = findRoute(routes, 'GET', '/tenants')!;
    const req = makeRequest({ path: '/api/v1/tenants' });
    const res = await route.handler(req);

    expect(res.status).toBe(200);
    const body = res.body as { tenants: TenantRecord[]; total: number };
    expect(body.total).toBe(0);
    expect(body.tenants).toHaveLength(0);
  });

  it('should return tenant status by ID', async () => {
    seedTenant('tenant-42');

    const route = findRoute(routes, 'GET', '/tenants/:id/status')!;
    expect(route).toBeDefined();

    const req = makeRequest({ path: '/api/v1/tenants/tenant-42/status' });
    const res = await route.handler(req);
    expect(res.status).toBe(200);

    const body = res.body as TenantRecord;
    expect(body.id).toBe('tenant-42');
    expect(body.gatewayInstances).toBe(2);
  });

  it('should return 404 for non-existent tenant', async () => {
    const route = findRoute(routes, 'GET', '/tenants/:id/status')!;
    const req = makeRequest({ path: '/api/v1/tenants/non-existent/status' });
    const res = await route.handler(req);

    expect(res.status).toBe(404);
  });
});

// ============================================================================
// T145: Connector CRUD
// ============================================================================

describe('Connector Management (T145)', () => {
  it('should list connectors for current tenant', async () => {
    seedConnector('conn-1', 'tenant-1');
    seedConnector('conn-2', 'tenant-1');
    seedConnector('conn-3', 'tenant-other');

    const route = findRoute(routes, 'GET', '/connectors')!;
    const req = makeRequest({ path: '/api/v1/connectors' });
    const res = await route.handler(req);

    expect(res.status).toBe(200);
    const body = res.body as { connectors: ConnectorRecord[]; total: number };
    expect(body.total).toBe(2);
    expect(body.connectors.every((c) => c.tenantId === 'tenant-1')).toBe(true);
  });

  it('should create a connector', async () => {
    const route = findRoute(routes, 'POST', '/connectors')!;
    const req = makeRequest({
      method: 'POST',
      path: '/api/v1/connectors',
      body: {
        type: 'jira',
        credentials_secret_ref: 'secret-jira',
        config: { polling_interval_seconds: 600 },
      },
    });

    const res = await route.handler(req);
    expect(res.status).toBe(201);

    const body = res.body as ConnectorRecord;
    expect(body.type).toBe('jira');
    expect(body.tenantId).toBe('tenant-1');
    expect(body.status).toBe('active');
    expect(body.id).toBeDefined();
  });

  it('should reject connector creation with missing type', async () => {
    const route = findRoute(routes, 'POST', '/connectors')!;
    const req = makeRequest({
      method: 'POST',
      path: '/api/v1/connectors',
      body: { credentials_secret_ref: 'secret-x' },
    });

    const res = await route.handler(req);
    expect(res.status).toBe(400);
    expect((res.body as Record<string, string>).error).toBe('missing_type');
  });

  it('should reject connector creation with invalid type', async () => {
    const route = findRoute(routes, 'POST', '/connectors')!;
    const req = makeRequest({
      method: 'POST',
      path: '/api/v1/connectors',
      body: { type: 'invalid_type', credentials_secret_ref: 'secret-x' },
    });

    const res = await route.handler(req);
    expect(res.status).toBe(400);
    expect((res.body as Record<string, string>).error).toBe('invalid_type');
  });

  it('should reject connector creation with missing credentials', async () => {
    const route = findRoute(routes, 'POST', '/connectors')!;
    const req = makeRequest({
      method: 'POST',
      path: '/api/v1/connectors',
      body: { type: 'gmail' },
    });

    const res = await route.handler(req);
    expect(res.status).toBe(400);
    expect((res.body as Record<string, string>).error).toBe('missing_credentials');
  });

  it('should disable (soft-delete) a connector', async () => {
    seedConnector('conn-del', 'tenant-1');

    const route = findRoute(routes, 'DELETE', '/connectors')!;
    const req = makeRequest({
      method: 'DELETE',
      path: '/api/v1/connectors/conn-del',
    });

    const res = await route.handler(req);
    expect(res.status).toBe(200);
    expect((res.body as Record<string, string>).status).toBe('disabled');
  });

  it('should return 404 when deleting non-existent connector', async () => {
    const route = findRoute(routes, 'DELETE', '/connectors')!;
    const req = makeRequest({
      method: 'DELETE',
      path: '/api/v1/connectors/non-existent',
    });

    const res = await route.handler(req);
    expect(res.status).toBe(404);
  });

  it('should prevent deleting connector from another tenant', async () => {
    seedConnector('conn-other', 'tenant-other');

    const route = findRoute(routes, 'DELETE', '/connectors')!;
    const req = makeRequest({
      method: 'DELETE',
      path: '/api/v1/connectors/conn-other',
    });

    const res = await route.handler(req);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// T146: Status Aggregation
// ============================================================================

describe('System Status (T146)', () => {
  it('should return healthy when all components are healthy', async () => {
    const route = findRoute(routes, 'GET', '/status')!;
    const req = makeRequest({ path: '/api/v1/status' });
    const res = await route.handler(req);

    expect(res.status).toBe(200);
    const body = res.body as { status: string; components: Record<string, unknown> };
    expect(body.status).toBe('healthy');
    expect(body.components).toBeDefined();
  });

  it('should return 503 when a component is unhealthy', async () => {
    const unhealthyRoutes = createAdminRoutes(
      makeAdminConfig({ checkOpa: async () => ({ status: 'unreachable' }) }),
    );
    const route = findRoute(unhealthyRoutes, 'GET', '/status')!;
    const req = makeRequest({ path: '/api/v1/status' });
    const res = await route.handler(req);

    expect(res.status).toBe(503);
    const body = res.body as { status: string };
    expect(body.status).toBe('degraded');
  });

  it('should include all component statuses in response', async () => {
    const route = findRoute(routes, 'GET', '/status')!;
    const req = makeRequest({ path: '/api/v1/status' });
    const res = await route.handler(req);

    const body = res.body as {
      components: {
        gateway: { status: string };
        policyEngine: { status: string };
        opa: { status: string };
        connectors: Record<string, { status: string }>;
        database: { status: string };
      };
      timestamp: string;
    };

    expect(body.components.gateway.status).toBe('healthy');
    expect(body.components.policyEngine.status).toBe('healthy');
    expect(body.components.opa.status).toBe('healthy');
    expect(body.components.database.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });
});

// ============================================================================
// T147: Metrics Collection
// ============================================================================

describe('Operational Metrics (T147)', () => {
  it('should return operational metrics for admin users', async () => {
    const route = findRoute(routes, 'GET', '/metrics')!;
    const req = makeRequest({ path: '/api/v1/metrics' });
    const res = await route.handler(req);

    expect(res.status).toBe(200);
    const body = res.body as {
      activeUsers: number;
      autoResponsesSent: number;
      tasksDiscovered: number;
      modelCalls: number;
      policyEvaluations: number;
      auditEntries: number;
      collectedAt: string;
    };

    expect(body.activeUsers).toBe(42);
    expect(body.autoResponsesSent).toBe(128);
    expect(body.tasksDiscovered).toBe(350);
    expect(body.modelCalls).toBe(1200);
    expect(body.policyEvaluations).toBe(5000);
    expect(body.auditEntries).toBe(8900);
    expect(body.collectedAt).toBeDefined();
  });

  it('should use values from custom metrics provider', async () => {
    const customRoutes = createAdminRoutes(
      makeAdminConfig(undefined, {
        getMetrics: async () => ({
          activeUsers: 1,
          autoResponsesSent: 2,
          tasksDiscovered: 3,
          modelCalls: 4,
          policyEvaluations: 5,
          auditEntries: 6,
        }),
      }),
    );
    const route = findRoute(customRoutes, 'GET', '/metrics')!;
    const req = makeRequest({ path: '/api/v1/metrics' });
    const res = await route.handler(req);

    const body = res.body as { activeUsers: number; modelCalls: number };
    expect(body.activeUsers).toBe(1);
    expect(body.modelCalls).toBe(4);
  });
});

// ============================================================================
// Role Authorization
// ============================================================================

describe('Role Authorization (T151)', () => {
  it('should deny tenant listing for non-enterprise-admin users', async () => {
    const route = findRoute(routes, 'GET', '/tenants')!;

    // org_admin should NOT be able to list tenants (enterprise_admin only)
    const req = makeRequest({
      path: '/api/v1/tenants',
      userContext: makeUserContext({ roles: ['org_admin'] }),
    });
    const res = await route.handler(req);
    expect(res.status).toBe(403);
  });

  it('should deny connector listing for regular users', async () => {
    const route = findRoute(routes, 'GET', '/connectors')!;
    const req = makeRequest({
      path: '/api/v1/connectors',
      userContext: makeUserContext({ roles: ['user'] }),
    });
    const res = await route.handler(req);

    expect(res.status).toBe(403);
  });

  it('should allow org_admin to list connectors', async () => {
    seedConnector('conn-1', 'tenant-1');

    const route = findRoute(routes, 'GET', '/connectors')!;
    const req = makeRequest({
      path: '/api/v1/connectors',
      userContext: makeUserContext({ roles: ['org_admin'] }),
    });
    const res = await route.handler(req);

    expect(res.status).toBe(200);
  });

  it('should deny metrics for regular users', async () => {
    const route = findRoute(routes, 'GET', '/metrics')!;
    const req = makeRequest({
      path: '/api/v1/metrics',
      userContext: makeUserContext({ roles: ['user'] }),
    });
    const res = await route.handler(req);

    expect(res.status).toBe(403);
  });

  it('should deny all admin routes for unauthenticated requests', async () => {
    const tenantsRoute = findRoute(routes, 'GET', '/tenants')!;
    const connectorsRoute = findRoute(routes, 'GET', '/connectors')!;
    const metricsRoute = findRoute(routes, 'GET', '/metrics')!;

    for (const route of [tenantsRoute, connectorsRoute, metricsRoute]) {
      const req = makeRequest({
        path: route.path,
        userContext: undefined,
      });
      const res = await route.handler(req);
      expect(res.status).toBe(401);
    }
  });

  it('should allow status endpoint without authentication (health check)', async () => {
    const route = findRoute(routes, 'GET', '/status')!;
    const req = makeRequest({
      path: '/api/v1/status',
      userContext: undefined,
    });
    const res = await route.handler(req);

    // Status endpoint does not require auth — it is a health check
    expect(res.status).toBe(200);
  });
});
