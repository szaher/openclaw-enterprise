import type { Policy, PolicyDomain, PolicyScope } from '@openclaw-enterprise/shared/types.js';
import { POLICY_SCOPE_HIERARCHY } from '@openclaw-enterprise/shared/constants.js';

export interface ScopeChain {
  enterprise: string;
  org?: string;
  team?: string;
  user?: string;
}

export interface ResolvedPolicy {
  effectivePolicy: Record<string, unknown>;
  hierarchy: Array<{
    scope: PolicyScope;
    policyId: string | null;
  }>;
}

/**
 * Resolves the effective policy by flattening the hierarchy.
 * Enterprise is the ceiling — lower levels can only restrict further, never expand.
 *
 * Algorithm:
 * 1. Start with the enterprise policy as the base
 * 2. For each lower scope (org -> team -> user), merge restrictively
 * 3. Restrictive merge: for arrays, intersection only; for booleans, AND; for numbers, take minimum
 */
export class PolicyHierarchyResolver {
  async resolve(
    domain: PolicyDomain,
    scopeChain: ScopeChain,
    fetchPolicies: (scope: PolicyScope, scopeId: string, domain: PolicyDomain) => Promise<Policy | null>,
  ): Promise<ResolvedPolicy> {
    const hierarchy: ResolvedPolicy['hierarchy'] = [];
    let effectivePolicy: Record<string, unknown> = {};

    for (const scope of POLICY_SCOPE_HIERARCHY) {
      const scopeId = scopeChain[scope];
      if (!scopeId) {
        hierarchy.push({ scope, policyId: null });
        continue;
      }

      const policy = await fetchPolicies(scope, scopeId, domain);
      if (!policy || policy.status !== 'active') {
        hierarchy.push({ scope, policyId: null });
        continue;
      }

      hierarchy.push({ scope, policyId: policy.id });

      const parsed = parsePolicyContent(policy.content);

      if (scope === 'enterprise') {
        // Enterprise is the base — set all values
        effectivePolicy = { ...parsed };
      } else {
        // Lower scopes restrict, never expand
        effectivePolicy = mergeRestrictive(effectivePolicy, parsed);
      }
    }

    return { effectivePolicy, hierarchy };
  }
}

function parsePolicyContent(content: string): Record<string, unknown> {
  // Policies are YAML-like key:value — parse simple structure
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ')) {
      if (currentKey && currentArray) {
        currentArray.push(trimmed.slice(2).trim());
      }
      continue;
    }

    // Flush previous array
    if (currentKey && currentArray) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === '') {
      // Start of a map or array
      currentKey = key;
      currentArray = [];
      continue;
    }

    currentKey = null;

    if (value === 'true') result[key] = true;
    else if (value === 'false') result[key] = false;
    else if (/^\d+$/.test(value)) result[key] = parseInt(value, 10);
    else result[key] = value;
  }

  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Merge two policy objects restrictively.
 * - Arrays: intersection (child can only use values parent allows)
 * - Booleans: AND (child can disable but not enable)
 * - Numbers: take the minimum
 * - Strings: child value takes precedence (it's a restriction context)
 */
function mergeRestrictive(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...parent };

  for (const [key, childValue] of Object.entries(child)) {
    const parentValue = parent[key];

    if (parentValue === undefined) {
      // Child adds a restriction not in parent — keep it
      result[key] = childValue;
      continue;
    }

    if (Array.isArray(parentValue) && Array.isArray(childValue)) {
      // Intersection: child can only use values parent allows
      result[key] = childValue.filter((v) => parentValue.includes(v));
    } else if (typeof parentValue === 'boolean' && typeof childValue === 'boolean') {
      // AND: child can disable (false) but not enable (true overrides parent false)
      result[key] = parentValue && childValue;
    } else if (typeof parentValue === 'number' && typeof childValue === 'number') {
      // Take the more restrictive (minimum)
      result[key] = Math.min(parentValue, childValue);
    } else {
      // String or mixed: child restriction takes precedence
      result[key] = childValue;
    }
  }

  return result;
}

export { parsePolicyContent, mergeRestrictive };
