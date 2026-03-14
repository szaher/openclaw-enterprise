import type {
  PolicyEvaluateRequest,
  PolicyEvaluateResponse,
  PolicyResult,
  DataClassificationLevel,
} from '@openclaw-enterprise/shared/types.js';
import { OpaClient } from './opa-client.js';

const DOMAIN_POLICY_PATHS: Record<string, string> = {
  tool_invocation: 'openclaw/enterprise/actions',
  model_call: 'openclaw/enterprise/models',
  connector_access: 'openclaw/enterprise/integrations',
  agent_exchange: 'openclaw/enterprise/agent_exchange',
  feature_access: 'openclaw/enterprise/features',
  data_access: 'openclaw/enterprise/data',
};

/**
 * Gateway method handler for `policy.evaluate`.
 * Evaluates an action against the policy hierarchy via OPA.
 *
 * Contract (per policy-api.md):
 * - Request: { tenant_id, user_id, action, context: { data_classification, channel?, target_system?, additional? } }
 * - Response: { decision, policy_applied, reason, constraints }
 */
export class PolicyEvaluator {
  constructor(private readonly opaClient: OpaClient) {}

  async evaluate(params: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    const policyPath = this.resolvePolicyPath(params.action);

    const result = await this.opaClient.evaluate(policyPath, {
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      data_classification: params.context.dataClassification,
      channel: params.context.channel,
      target_system: params.context.targetSystem,
      additional: params.context.additional,
    });

    let decision: PolicyResult;
    if (result.require_approval) {
      decision = 'require_approval';
    } else if (result.allow) {
      decision = 'allow';
    } else {
      decision = 'deny';
    }

    return {
      decision,
      policyApplied: `${policyPath}`,
      reason: result.reason,
      constraints: {
        maxClassification: result.constraints.max_classification as DataClassificationLevel | undefined,
        allowedTransitions: result.constraints.allowed_transitions as string[] | undefined,
        disclosureRequired: result.constraints.disclosure_required as boolean | undefined,
      },
    };
  }

  private resolvePolicyPath(action: string): string {
    // Map action to OPA policy path
    // Actions like "email_read" map to "connector_access"
    // Actions like "jira_transition" map to "tool_invocation"
    for (const [prefix, path] of Object.entries(DOMAIN_POLICY_PATHS)) {
      if (action.startsWith(prefix) || action.includes(prefix)) {
        return path;
      }
    }

    // Connector tools (email_*, calendar_*, jira_*, github_*, gdrive_*)
    const connectorPrefixes = ['email_', 'calendar_', 'jira_', 'github_', 'gdrive_'];
    if (connectorPrefixes.some((p) => action.startsWith(p))) {
      return DOMAIN_POLICY_PATHS.connector_access;
    }

    // Default: evaluate as a tool invocation
    return DOMAIN_POLICY_PATHS.tool_invocation;
  }
}
