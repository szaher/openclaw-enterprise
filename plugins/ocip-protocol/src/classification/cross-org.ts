import { CrossEnterpriseBlockedError } from '@openclaw-enterprise/shared/errors.js';
import type { PolicyEvaluateRequest, PolicyEvaluateResponse } from '@openclaw-enterprise/shared/types.js';

/**
 * Agent identity sufficient for cross-org checks.
 */
export interface AgentOrgInfo {
  tenantId: string;
  orgUnit: string;
}

/**
 * Result of a cross-org policy check.
 */
export interface CrossOrgCheckResult {
  allowed: boolean;
  reason: string;
  policyApplied: string;
}

/**
 * Policy evaluation function type (injected from gateway).
 */
export type PolicyEvaluateFn = (
  params: PolicyEvaluateRequest,
) => Promise<PolicyEvaluateResponse>;

/**
 * Enforces cross-org exchange policies.
 *
 * Per ocip-protocol.md:
 * - Intra-enterprise cross-org: ALLOWED, governed by org-level policies
 * - Cross-enterprise (different tenants): BLOCKED unconditionally
 */
export class CrossOrgPolicyChecker {
  constructor(private readonly policyEvaluate: PolicyEvaluateFn) {}

  /**
   * Check whether an exchange between two agents is allowed based
   * on their organizational relationship.
   *
   * @throws CrossEnterpriseBlockedError if agents are in different tenants
   */
  async enforce(
    sourceAgent: AgentOrgInfo,
    targetAgent: AgentOrgInfo,
    userId: string,
  ): Promise<CrossOrgCheckResult> {
    // Cross-enterprise: BLOCKED unconditionally
    if (sourceAgent.tenantId !== targetAgent.tenantId) {
      throw new CrossEnterpriseBlockedError(
        sourceAgent.tenantId,
        targetAgent.tenantId,
      );
    }

    // Same org unit: always allowed
    if (sourceAgent.orgUnit === targetAgent.orgUnit) {
      return {
        allowed: true,
        reason: 'Same org unit — no cross-org restrictions apply',
        policyApplied: 'none',
      };
    }

    // Cross-org within same tenant: check org-level policy
    const policyResult = await this.policyEvaluate({
      tenantId: sourceAgent.tenantId,
      userId,
      action: 'agent_exchange_cross_org',
      context: {
        dataClassification: 'internal',
        additional: {
          sourceOrgUnit: sourceAgent.orgUnit,
          targetOrgUnit: targetAgent.orgUnit,
        },
      },
    });

    return {
      allowed: policyResult.decision === 'allow',
      reason: policyResult.reason,
      policyApplied: policyResult.policyApplied,
    };
  }

  /**
   * Quick check: are the agents in the same tenant?
   */
  static isSameTenant(source: AgentOrgInfo, target: AgentOrgInfo): boolean {
    return source.tenantId === target.tenantId;
  }

  /**
   * Quick check: are the agents in the same org unit?
   */
  static isSameOrgUnit(source: AgentOrgInfo, target: AgentOrgInfo): boolean {
    return (
      source.tenantId === target.tenantId &&
      source.orgUnit === target.orgUnit
    );
  }
}
