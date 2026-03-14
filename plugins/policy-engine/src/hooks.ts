import type { PolicyEvaluateRequest } from '@openclaw-enterprise/shared/types.js';
import {
  PolicyDeniedError,
  PolicyApprovalRequiredError,
} from '@openclaw-enterprise/shared/errors.js';
import { PolicyEvaluator } from './evaluator/evaluate.js';

export interface ToolExecutionContext {
  toolName: string;
  tenantId: string;
  userId: string;
  dataClassification: string;
  channel?: string;
  targetSystem?: string;
  params: Record<string, unknown>;
}

/**
 * Hook: before_tool_execute
 * Intercepts every tool invocation, evaluates against policy engine,
 * and denies or requires approval per policy decision.
 *
 * This is the enforcement point for FR-001:
 * "System MUST evaluate every tool invocation against the policy engine before execution."
 *
 * Fail-closed: If the policy engine is unreachable, PolicyEngineUnreachableError
 * propagates from OpaClient, denying the action (FR-004).
 */
export class PolicyEnforcementHook {
  constructor(private readonly evaluator: PolicyEvaluator) {}

  async beforeToolExecute(context: ToolExecutionContext): Promise<void> {
    const request: PolicyEvaluateRequest = {
      tenantId: context.tenantId,
      userId: context.userId,
      action: context.toolName,
      context: {
        dataClassification: context.dataClassification as PolicyEvaluateRequest['context']['dataClassification'],
        channel: context.channel,
        targetSystem: context.targetSystem,
        additional: context.params,
      },
    };

    const result = await this.evaluator.evaluate(request);

    switch (result.decision) {
      case 'deny':
        throw new PolicyDeniedError(
          context.toolName,
          result.policyApplied,
          result.reason,
        );
      case 'require_approval':
        throw new PolicyApprovalRequiredError(
          context.toolName,
          result.policyApplied,
          result.reason,
        );
      case 'allow':
        // Proceed with tool execution
        break;
    }
  }

  /** Returns the hook registration for the plugin */
  getHookRegistration() {
    return {
      event: 'before_tool_execute',
      handler: async (context: Record<string, unknown>) => {
        await this.beforeToolExecute(context as unknown as ToolExecutionContext);
      },
    };
  }
}
