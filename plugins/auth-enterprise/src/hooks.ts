// ============================================================================
// OpenClaw Enterprise — Auth Middleware Hook (T049)
// ============================================================================

import type { UserContext } from '@openclaw-enterprise/shared';
import { validateToken } from './oidc/validator.js';
import type { OIDCValidatorConfig } from './oidc/validator.js';
import { buildUserContext } from './rbac/mapper.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * OpenClaw hook registration pattern.
 */
export interface HookRegistration {
  event: string;
  priority: number;
  handler: (context: HookContext) => Promise<HookResult>;
  description: string;
}

/**
 * Context passed to hook handlers.
 */
export interface HookContext {
  request: HttpRequest;
  metadata: Record<string, unknown>;
}

/**
 * Result returned from a hook handler.
 */
export interface HookResult {
  /** If true, the request continues. If false, it is rejected. */
  proceed: boolean;
  /** Modified request (if any changes were made) */
  request?: HttpRequest;
  /** Response to send if proceed is false */
  response?: HttpResponse;
}

/**
 * Paths that bypass authentication (health checks, readiness probes, etc.)
 */
const AUTH_BYPASS_PATHS: ReadonlySet<string> = new Set([
  '/healthz',
  '/readyz',
  '/health',
  '/ready',
  '/api/v1/auth/callback',
  '/metrics',
]);

/**
 * Configuration for the auth middleware hook.
 */
export interface AuthMiddlewareConfig {
  oidc: OIDCValidatorConfig;
  /** Default tenant ID */
  defaultTenantId: string;
  /** Additional paths to bypass auth */
  additionalBypassPaths?: string[];
}

/**
 * Checks whether a request path should bypass authentication.
 */
function shouldBypassAuth(path: string, additionalPaths?: string[]): boolean {
  if (AUTH_BYPASS_PATHS.has(path)) {
    return true;
  }
  if (additionalPaths) {
    return additionalPaths.includes(path);
  }
  return false;
}

/**
 * Extracts the Bearer token from the Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The raw JWT token, or null if not present/invalid format
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  return parts[1] ?? null;
}

/**
 * Creates the auth middleware hook registration.
 *
 * This hook runs on every HTTP request (before_http_request event) to:
 * 1. Skip auth for health check and callback endpoints
 * 2. Extract the Bearer token from the Authorization header
 * 3. Validate the token via the OIDC validator
 * 4. Build a UserContext via the RBAC mapper
 * 5. Attach the UserContext to the request
 * 6. Reject requests with missing or invalid tokens (401)
 *
 * @param config - Auth middleware configuration
 * @returns HookRegistration for the auth middleware
 */
export function createAuthMiddlewareHook(config: AuthMiddlewareConfig): HookRegistration {
  return {
    event: 'before_http_request',
    priority: 100, // High priority — runs early in the hook chain
    description: 'Validates Bearer tokens and attaches UserContext to requests',
    handler: async (context: HookContext): Promise<HookResult> => {
      const { request } = context;

      // 1. Skip auth for bypass paths
      if (shouldBypassAuth(request.path, config.additionalBypassPaths)) {
        return { proceed: true, request };
      }

      // 2. Extract Bearer token
      const token = extractBearerToken(request.headers['authorization']);
      if (!token) {
        return {
          proceed: false,
          response: {
            status: 401,
            headers: { 'WWW-Authenticate': 'Bearer' },
            body: {
              error: 'missing_token',
              message: 'Authorization header with Bearer token is required',
            },
          },
        };
      }

      // 3. Validate token
      let claims;
      try {
        claims = await validateToken(token, config.oidc);
      } catch (err) {
        return {
          proceed: false,
          response: {
            status: 401,
            headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
            body: {
              error: 'invalid_token',
              message: `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          },
        };
      }

      // 4. Build UserContext
      const userContext: UserContext = buildUserContext(
        claims,
        config.defaultTenantId,
      );

      // 5. Attach UserContext to request
      const enrichedRequest: HttpRequest = {
        ...request,
        userContext,
      };

      return { proceed: true, request: enrichedRequest };
    },
  };
}
