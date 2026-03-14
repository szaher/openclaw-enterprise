import type { PolicyDomain, PolicyScope, Policy } from '@openclaw-enterprise/shared/types.js';
import { PolicyHierarchyResolver, type ScopeChain, type ResolvedPolicy } from './resolver.js';

export interface PolicyResolveParams {
  tenantId: string;
  userId: string;
  domain: PolicyDomain;
}

export interface PolicyResolveResponse {
  effectivePolicy: Record<string, unknown>;
  hierarchy: Array<{
    scope: PolicyScope;
    policyId: string | null;
  }>;
}

/**
 * Gateway method handler for `policy.resolve`.
 * Resolves the effective policy for a given scope and domain with hierarchy flattening.
 */
export class PolicyResolveMethod {
  private readonly resolver: PolicyHierarchyResolver;

  constructor(
    private readonly fetchPolicy: (
      scope: PolicyScope,
      scopeId: string,
      domain: PolicyDomain,
    ) => Promise<Policy | null>,
    private readonly lookupScopeChain: (tenantId: string, userId: string) => Promise<ScopeChain>,
  ) {
    this.resolver = new PolicyHierarchyResolver();
  }

  async handle(params: PolicyResolveParams): Promise<PolicyResolveResponse> {
    const scopeChain = await this.lookupScopeChain(params.tenantId, params.userId);

    const resolved: ResolvedPolicy = await this.resolver.resolve(
      params.domain,
      scopeChain,
      this.fetchPolicy,
    );

    return {
      effectivePolicy: resolved.effectivePolicy,
      hierarchy: resolved.hierarchy,
    };
  }
}
