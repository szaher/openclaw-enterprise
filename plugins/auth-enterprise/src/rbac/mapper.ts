// ============================================================================
// OpenClaw Enterprise — RBAC Role Mapper (T047)
// ============================================================================

import type { BuiltInRole, UserContext, PolicyScope } from '@openclaw-enterprise/shared';
import type { OIDCClaims } from '../oidc/validator.js';

/**
 * Role hierarchy: enterprise_admin > org_admin > team_lead > user.
 * Higher roles include all permissions of lower roles.
 */
const ROLE_HIERARCHY: readonly BuiltInRole[] = [
  'user',
  'team_lead',
  'org_admin',
  'enterprise_admin',
] as const;

/**
 * Default mapping from OIDC group/role names to BuiltInRole.
 * Can be overridden via configuration.
 */
const DEFAULT_ROLE_MAPPINGS: ReadonlyMap<string, BuiltInRole> = new Map([
  // Group-based mappings
  ['enterprise-admins', 'enterprise_admin'],
  ['org-admins', 'org_admin'],
  ['team-leads', 'team_lead'],
  ['users', 'user'],
  // Role-based mappings (from IdP roles claim)
  ['enterprise_admin', 'enterprise_admin'],
  ['org_admin', 'org_admin'],
  ['team_lead', 'team_lead'],
  ['user', 'user'],
]);

/**
 * Permission definition per role level.
 */
interface RolePermissions {
  canManagePolicies: boolean;
  policyScope: PolicyScope;
  canQueryAudit: boolean;
  auditScope: PolicyScope;
}

const ROLE_PERMISSIONS: Record<BuiltInRole, RolePermissions> = {
  enterprise_admin: {
    canManagePolicies: true,
    policyScope: 'enterprise',
    canQueryAudit: true,
    auditScope: 'enterprise',
  },
  org_admin: {
    canManagePolicies: true,
    policyScope: 'org',
    canQueryAudit: true,
    auditScope: 'org',
  },
  team_lead: {
    canManagePolicies: false,
    policyScope: 'team',
    canQueryAudit: true,
    auditScope: 'team',
  },
  user: {
    canManagePolicies: false,
    policyScope: 'user',
    canQueryAudit: false,
    auditScope: 'user',
  },
};

/**
 * Returns the numeric rank of a role in the hierarchy (higher = more privileged).
 */
function roleRank(role: BuiltInRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Returns the highest role from a list of roles.
 */
function highestRole(roles: BuiltInRole[]): BuiltInRole {
  if (roles.length === 0) {
    return 'user';
  }
  return roles.reduce((highest, current) =>
    roleRank(current) > roleRank(highest) ? current : highest,
  );
}

/**
 * Maps OIDC groups and roles claims to enterprise BuiltInRoles.
 *
 * Checks both groups[] and roles[] from the OIDC claims against the
 * role mapping table. If no mapping matches, defaults to 'user'.
 *
 * @param claims - Validated OIDC claims
 * @param customMappings - Optional custom role mapping overrides
 * @returns Array of matched BuiltInRoles (deduplicated)
 */
export function mapClaimsToRoles(
  claims: OIDCClaims,
  customMappings?: ReadonlyMap<string, BuiltInRole>,
): BuiltInRole[] {
  const mappings = customMappings ?? DEFAULT_ROLE_MAPPINGS;
  const matchedRoles = new Set<BuiltInRole>();

  // Check groups
  for (const group of claims.groups) {
    const role = mappings.get(group);
    if (role) {
      matchedRoles.add(role);
    }
  }

  // Check roles
  for (const claimRole of claims.roles) {
    const role = mappings.get(claimRole);
    if (role) {
      matchedRoles.add(role);
    }
  }

  // Default to 'user' if no roles matched
  if (matchedRoles.size === 0) {
    matchedRoles.add('user');
  }

  return [...matchedRoles];
}

/**
 * Derives effective permissions from a list of roles.
 *
 * Uses the highest role in the hierarchy to determine permissions,
 * ensuring higher roles include all lower role permissions.
 *
 * @param roles - Array of BuiltInRoles assigned to the user
 * @returns Effective permissions object matching UserContext['effectivePermissions']
 */
export function derivePermissions(
  roles: BuiltInRole[],
): UserContext['effectivePermissions'] {
  const highest = highestRole(roles);
  const perms = ROLE_PERMISSIONS[highest];

  return {
    canManagePolicies: perms.canManagePolicies,
    policyScope: perms.policyScope,
    canQueryAudit: perms.canQueryAudit,
    auditScope: perms.auditScope,
  };
}

/**
 * Builds a complete UserContext from validated OIDC claims.
 *
 * This is the main entry point for the RBAC mapper — it maps claims
 * to roles, derives permissions, and assembles the full UserContext
 * that travels with every request through the system.
 *
 * @param claims - Validated OIDC claims
 * @param tenantId - Tenant identifier (resolved from claims or config)
 * @param customMappings - Optional custom role mapping overrides
 * @returns Complete UserContext
 */
export function buildUserContext(
  claims: OIDCClaims,
  tenantId: string,
  customMappings?: ReadonlyMap<string, BuiltInRole>,
): UserContext {
  const roles = mapClaimsToRoles(claims, customMappings);
  const effectivePermissions = derivePermissions(roles);

  return {
    userId: claims.sub,
    email: claims.email,
    roles,
    orgUnit: claims.org_unit,
    tenantId,
    effectivePermissions,
  };
}
