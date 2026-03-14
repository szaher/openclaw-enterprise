// ============================================================================
// OpenClaw Enterprise — Auth Routes (T048, T144-T147)
// ============================================================================

import type { UserContext, BuiltInRole, ConnectorType, Connector } from '@openclaw-enterprise/shared';
import { API_BASE_PATH } from '@openclaw-enterprise/shared';
import { validateToken } from './oidc/validator.js';
import { buildUserContext } from './rbac/mapper.js';
import type { OIDCValidatorConfig } from './oidc/validator.js';

/**
 * OpenClaw HttpRouteRegistration pattern.
 */
export interface HttpRouteRegistration {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: HttpRequest) => Promise<HttpResponse>;
  description: string;
}

/**
 * Minimal HTTP request abstraction used by OpenClaw route handlers.
 */
export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
  query?: Record<string, string>;
  /** Attached by auth middleware after validation */
  userContext?: UserContext;
}

/**
 * Minimal HTTP response abstraction.
 */
export interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

/**
 * In-memory session store. In production, replace with a distributed store
 * (e.g., Redis or PostgreSQL-backed sessions).
 */
const sessions = new Map<string, { userContext: UserContext; expiresAt: number }>();

/**
 * Configuration required by auth routes.
 */
export interface AuthRoutesConfig {
  oidc: OIDCValidatorConfig;
  /** Token exchange endpoint at the IdP */
  tokenEndpoint: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI registered with the IdP */
  redirectUri: string;
  /** Default tenant ID if not derivable from claims */
  defaultTenantId: string;
  /** Session TTL in seconds (default: 3600) */
  sessionTtlSeconds?: number;
}

/**
 * Generates a cryptographically random session ID.
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates the auth route registrations.
 *
 * @param config - Auth routes configuration
 * @returns Array of HttpRouteRegistration for the auth plugin
 */
export function createAuthRoutes(config: AuthRoutesConfig): HttpRouteRegistration[] {
  const sessionTtl = config.sessionTtlSeconds ?? 3600;

  /**
   * POST /api/v1/auth/callback
   *
   * Exchanges an authorization code for tokens, validates the ID token,
   * builds a UserContext, and establishes a session.
   */
  const callbackRoute: HttpRouteRegistration = {
    method: 'POST',
    path: '/api/v1/auth/callback',
    description: 'Exchange authorization code for tokens and establish session',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const body = req.body as { code?: string } | undefined;
      const code = body?.code;

      if (!code) {
        return {
          status: 400,
          body: { error: 'missing_code', message: 'Authorization code is required' },
        };
      }

      // Exchange authorization code for tokens
      let tokenResponse: Response;
      try {
        tokenResponse = await fetch(config.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
          }),
        });
      } catch (err) {
        return {
          status: 502,
          body: {
            error: 'token_exchange_failed',
            message: `Failed to contact token endpoint: ${String(err)}`,
          },
        };
      }

      if (!tokenResponse.ok) {
        return {
          status: 502,
          body: {
            error: 'token_exchange_failed',
            message: `Token endpoint returned ${tokenResponse.status}`,
          },
        };
      }

      const tokens = (await tokenResponse.json()) as {
        id_token?: string;
        access_token?: string;
      };

      const idToken = tokens.id_token;
      if (!idToken) {
        return {
          status: 502,
          body: { error: 'no_id_token', message: 'No id_token in token response' },
        };
      }

      // Validate the ID token
      let claims;
      try {
        claims = await validateToken(idToken, config.oidc);
      } catch (err) {
        return {
          status: 401,
          body: {
            error: 'invalid_token',
            message: `Token validation failed: ${String(err)}`,
          },
        };
      }

      // Build user context
      const userContext = buildUserContext(claims, config.defaultTenantId);

      // Create session
      const sessionId = generateSessionId();
      const expiresAt = Date.now() + sessionTtl * 1000;
      sessions.set(sessionId, { userContext, expiresAt });

      return {
        status: 200,
        headers: {
          'Set-Cookie': `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${String(sessionTtl)}`,
        },
        body: {
          authenticated: true,
          user: {
            userId: userContext.userId,
            email: userContext.email,
            roles: userContext.roles,
            orgUnit: userContext.orgUnit,
          },
        },
      };
    },
  };

  /**
   * GET /api/v1/auth/userinfo
   *
   * Returns the current user context from the session.
   * Requires a valid session cookie.
   */
  const userinfoRoute: HttpRouteRegistration = {
    method: 'GET',
    path: '/api/v1/auth/userinfo',
    description: 'Return current user context from active session',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      // Check for session cookie
      const cookieHeader = req.headers['cookie'];
      if (!cookieHeader) {
        return {
          status: 401,
          body: { error: 'no_session', message: 'No session cookie present' },
        };
      }

      // Parse session ID from cookies
      const cookies = cookieHeader.split(';').map((c) => c.trim());
      const sessionCookie = cookies.find((c) => c.startsWith('session='));
      if (!sessionCookie) {
        return {
          status: 401,
          body: { error: 'no_session', message: 'No session cookie present' },
        };
      }

      const sessionId = sessionCookie.split('=')[1];
      if (!sessionId) {
        return {
          status: 401,
          body: { error: 'invalid_session', message: 'Invalid session cookie' },
        };
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return {
          status: 401,
          body: { error: 'session_not_found', message: 'Session not found or expired' },
        };
      }

      // Check expiry
      if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId);
        return {
          status: 401,
          body: { error: 'session_expired', message: 'Session has expired' },
        };
      }

      return {
        status: 200,
        body: session.userContext,
      };
    },
  };

  return [callbackRoute, userinfoRoute];
}

/**
 * Retrieves a session by ID (for use by auth middleware).
 */
export function getSession(
  sessionId: string,
): { userContext: UserContext; expiresAt: number } | undefined {
  const session = sessions.get(sessionId);
  if (session && Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

/**
 * Clears all sessions (for testing).
 */
export function clearSessions(): void {
  sessions.clear();
}

// ============================================================================
// Admin helper: role authorization
// ============================================================================

const ADMIN_ROLES: ReadonlySet<BuiltInRole> = new Set(['enterprise_admin', 'org_admin']);

/**
 * Check whether the request carries a UserContext with an admin role.
 * Returns the UserContext on success, or an HttpResponse with 401/403 on failure.
 */
function requireAdmin(req: HttpRequest): UserContext | HttpResponse {
  const user = req.userContext;
  if (!user) {
    return { status: 401, body: { error: 'authentication_required', message: 'Authentication is required' } };
  }
  if (!user.roles.some((r) => ADMIN_ROLES.has(r))) {
    return { status: 403, body: { error: 'forbidden', message: 'Admin role is required' } };
  }
  return user;
}

function requireEnterpriseAdmin(req: HttpRequest): UserContext | HttpResponse {
  const user = req.userContext;
  if (!user) {
    return { status: 401, body: { error: 'authentication_required', message: 'Authentication is required' } };
  }
  if (!user.roles.includes('enterprise_admin')) {
    return { status: 403, body: { error: 'forbidden', message: 'Enterprise admin role is required' } };
  }
  return user;
}

function isHttpResponse(value: UserContext | HttpResponse): value is HttpResponse {
  return 'status' in value && typeof (value as HttpResponse).status === 'number' && 'body' in value;
}

// ============================================================================
// Tenant data store (in-memory; production: PostgreSQL)
// ============================================================================

export interface TenantRecord {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'provisioning';
  gatewayInstances: number;
  connectorCount: number;
  policyCount: number;
  userCount: number;
  createdAt: string;
}

const tenants = new Map<string, TenantRecord>();

/** Seed / upsert a tenant (for testing or bootstrap). */
export function upsertTenant(tenant: TenantRecord): void {
  tenants.set(tenant.id, tenant);
}

/** Clear all tenants (for testing). */
export function clearTenants(): void {
  tenants.clear();
}

// ============================================================================
// Connector data store (in-memory; production: PostgreSQL)
// ============================================================================

export interface ConnectorRecord {
  id: string;
  type: ConnectorType;
  tenantId: string;
  credentialsSecretRef: string;
  config: Record<string, unknown>;
  status: 'active' | 'disabled' | 'error';
  createdAt: string;
}

const connectors = new Map<string, ConnectorRecord>();

/** Seed / upsert a connector (for testing). */
export function upsertConnector(connector: ConnectorRecord): void {
  connectors.set(connector.id, connector);
}

/** Clear all connectors (for testing). */
export function clearConnectors(): void {
  connectors.clear();
}

// ============================================================================
// System component health providers (injectable for testing)
// ============================================================================

export interface SystemHealthProvider {
  checkGateway(): Promise<{ status: string }>;
  checkPolicyEngine(): Promise<{ status: string }>;
  checkOpa(): Promise<{ status: string }>;
  checkConnectors(): Promise<Record<string, { status: string }>>;
  checkDb(): Promise<{ status: string }>;
}

export interface MetricsProvider {
  getMetrics(): Promise<{
    activeUsers: number;
    autoResponsesSent: number;
    tasksDiscovered: number;
    modelCalls: number;
    policyEvaluations: number;
    auditEntries: number;
  }>;
}

// ============================================================================
// Admin route factory (T144-T147)
// ============================================================================

export interface AdminRoutesConfig {
  healthProvider: SystemHealthProvider;
  metricsProvider: MetricsProvider;
}

/**
 * Creates admin route registrations for enterprise administration.
 *
 * T144: Tenant management (GET /tenants, GET /tenants/{id}/status)
 * T145: Connector management (GET/POST/DELETE /connectors)
 * T146: System status (GET /status)
 * T147: Operational metrics (GET /metrics)
 */
export function createAdminRoutes(config: AdminRoutesConfig): HttpRouteRegistration[] {
  // ------------------------------------------------------------------
  // T144: GET /api/v1/tenants — list tenants (enterprise_admin only)
  // ------------------------------------------------------------------
  const listTenantsRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${API_BASE_PATH}/tenants`,
    description: 'List all tenants (enterprise admin only)',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireEnterpriseAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const items = Array.from(tenants.values());
      return { status: 200, body: { tenants: items, total: items.length } };
    },
  };

  // ------------------------------------------------------------------
  // T144: GET /api/v1/tenants/:id/status — tenant status
  // ------------------------------------------------------------------
  const tenantStatusRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${API_BASE_PATH}/tenants/:id/status`,
    description: 'Get tenant health status',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireEnterpriseAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const tenantId = req.path.split('/').at(-2);
      if (!tenantId) {
        return { status: 400, body: { error: 'missing_tenant_id', message: 'Tenant ID is required' } };
      }

      const tenant = tenants.get(tenantId);
      if (!tenant) {
        return { status: 404, body: { error: 'tenant_not_found', message: 'Tenant not found' } };
      }

      return {
        status: 200,
        body: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          gatewayInstances: tenant.gatewayInstances,
          connectorCount: tenant.connectorCount,
          policyCount: tenant.policyCount,
          userCount: tenant.userCount,
        },
      };
    },
  };

  // ------------------------------------------------------------------
  // T145: GET /api/v1/connectors — list connectors
  // ------------------------------------------------------------------
  const listConnectorsRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${API_BASE_PATH}/connectors`,
    description: 'List connectors for the current tenant',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const user = auth as UserContext;
      const items = Array.from(connectors.values()).filter(
        (c) => c.tenantId === user.tenantId,
      );
      return { status: 200, body: { connectors: items, total: items.length } };
    },
  };

  // ------------------------------------------------------------------
  // T145: POST /api/v1/connectors — create connector
  // ------------------------------------------------------------------
  const createConnectorRoute: HttpRouteRegistration = {
    method: 'POST',
    path: `${API_BASE_PATH}/connectors`,
    description: 'Register a new connector (admin only)',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const user = auth as UserContext;
      const body = req.body as {
        type?: ConnectorType;
        credentials_secret_ref?: string;
        config?: Record<string, unknown>;
      } | undefined;

      if (!body?.type) {
        return { status: 400, body: { error: 'missing_type', message: 'Connector type is required' } };
      }

      const validTypes: ConnectorType[] = ['gmail', 'gcal', 'jira', 'github', 'gdrive'];
      if (!validTypes.includes(body.type)) {
        return { status: 400, body: { error: 'invalid_type', message: `Invalid connector type: ${body.type}` } };
      }

      if (!body.credentials_secret_ref) {
        return { status: 400, body: { error: 'missing_credentials', message: 'credentials_secret_ref is required' } };
      }

      const id = crypto.randomUUID();
      const connector: ConnectorRecord = {
        id,
        type: body.type,
        tenantId: user.tenantId,
        credentialsSecretRef: body.credentials_secret_ref,
        config: body.config ?? {},
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      connectors.set(id, connector);

      return { status: 201, body: connector };
    },
  };

  // ------------------------------------------------------------------
  // T145: DELETE /api/v1/connectors/:id — disable connector
  // ------------------------------------------------------------------
  const deleteConnectorRoute: HttpRouteRegistration = {
    method: 'DELETE',
    path: `${API_BASE_PATH}/connectors/:id`,
    description: 'Disable a connector (does not delete historical data)',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const user = auth as UserContext;
      const connectorId = req.path.split('/').pop();
      if (!connectorId) {
        return { status: 400, body: { error: 'missing_id', message: 'Connector ID is required' } };
      }

      const connector = connectors.get(connectorId);
      if (!connector) {
        return { status: 404, body: { error: 'not_found', message: 'Connector not found' } };
      }

      if (connector.tenantId !== user.tenantId) {
        return { status: 403, body: { error: 'forbidden', message: 'Cannot delete connector from another tenant' } };
      }

      connector.status = 'disabled';
      connectors.set(connectorId, connector);

      return { status: 200, body: { id: connectorId, status: 'disabled' } };
    },
  };

  // ------------------------------------------------------------------
  // T146: GET /api/v1/status — aggregated system health
  // ------------------------------------------------------------------
  const systemStatusRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${API_BASE_PATH}/status`,
    description: 'Aggregated system health: gateway, policy engine, OPA, connectors, DB',
    handler: async (_req: HttpRequest): Promise<HttpResponse> => {
      const [gateway, policyEngine, opa, connectorStatuses, db] = await Promise.all([
        config.healthProvider.checkGateway(),
        config.healthProvider.checkPolicyEngine(),
        config.healthProvider.checkOpa(),
        config.healthProvider.checkConnectors(),
        config.healthProvider.checkDb(),
      ]);

      const allHealthy =
        gateway.status === 'healthy' &&
        policyEngine.status === 'healthy' &&
        opa.status === 'healthy' &&
        db.status === 'healthy';

      return {
        status: allHealthy ? 200 : 503,
        body: {
          status: allHealthy ? 'healthy' : 'degraded',
          components: {
            gateway,
            policyEngine,
            opa,
            connectors: connectorStatuses,
            database: db,
          },
          timestamp: new Date().toISOString(),
        },
      };
    },
  };

  // ------------------------------------------------------------------
  // T147: GET /api/v1/metrics — operational metrics
  // ------------------------------------------------------------------
  const metricsRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${API_BASE_PATH}/metrics`,
    description: 'Operational metrics: active users, auto-responses, tasks, model calls, policy evaluations, audit entries',
    handler: async (req: HttpRequest): Promise<HttpResponse> => {
      const auth = requireAdmin(req);
      if (isHttpResponse(auth)) return auth;

      const metrics = await config.metricsProvider.getMetrics();

      return {
        status: 200,
        body: {
          activeUsers: metrics.activeUsers,
          autoResponsesSent: metrics.autoResponsesSent,
          tasksDiscovered: metrics.tasksDiscovered,
          modelCalls: metrics.modelCalls,
          policyEvaluations: metrics.policyEvaluations,
          auditEntries: metrics.auditEntries,
          collectedAt: new Date().toISOString(),
        },
      };
    },
  };

  return [
    listTenantsRoute,
    tenantStatusRoute,
    listConnectorsRoute,
    createConnectorRoute,
    deleteConnectorRoute,
    systemStatusRoute,
    metricsRoute,
  ];
}
