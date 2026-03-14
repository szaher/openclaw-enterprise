// ============================================================================
// OpenClaw Enterprise — Auth Enterprise Plugin Entry Point (T045)
// ============================================================================

import { createAuthRoutes } from './routes.js';
import type { AuthRoutesConfig, HttpRouteRegistration } from './routes.js';
import { createAuthMiddlewareHook } from './hooks.js';
import type { AuthMiddlewareConfig, HookRegistration } from './hooks.js';

export type { OIDCClaims, OIDCValidatorConfig } from './oidc/validator.js';
export { validateToken, clearJWKSCache } from './oidc/validator.js';
export { mapClaimsToRoles, derivePermissions, buildUserContext } from './rbac/mapper.js';
export type { HttpRouteRegistration, HttpRequest, HttpResponse, AuthRoutesConfig } from './routes.js';
export type { HookRegistration, HookContext, HookResult, AuthMiddlewareConfig } from './hooks.js';

/**
 * Full plugin configuration combining auth routes and middleware settings.
 */
export interface AuthEnterprisePluginConfig {
  /** OIDC + token exchange configuration */
  routes: AuthRoutesConfig;
  /** Auth middleware configuration */
  middleware: AuthMiddlewareConfig;
}

/**
 * Plugin registration result returned to the OpenClaw plugin host.
 */
export interface AuthEnterprisePlugin {
  name: string;
  version: string;
  routes: HttpRouteRegistration[];
  hooks: HookRegistration[];
}

/**
 * Registers the auth-enterprise plugin with OpenClaw.
 *
 * This plugin provides:
 * - POST /api/v1/auth/callback — OIDC authorization code exchange
 * - GET /api/v1/auth/userinfo — current user context retrieval
 * - before_http_request hook — JWT validation + UserContext attachment
 *
 * @param config - Plugin configuration
 * @returns Plugin registration object with routes and hooks
 */
export function register(config: AuthEnterprisePluginConfig): AuthEnterprisePlugin {
  const routes = createAuthRoutes(config.routes);
  const authHook = createAuthMiddlewareHook(config.middleware);

  return {
    name: 'auth-enterprise',
    version: '0.1.0',
    routes,
    hooks: [authHook],
  };
}
