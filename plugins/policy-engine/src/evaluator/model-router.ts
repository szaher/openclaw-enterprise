// ============================================================================
// OpenClaw Enterprise — Model Routing Policy Enforcement (T149)
// ============================================================================

import type {
  DataClassificationLevel,
  PolicyEvaluateRequest,
} from '@openclaw-enterprise/shared/types.js';
import { CLASSIFICATION_LEVELS } from '@openclaw-enterprise/shared/constants.js';
import { PolicyEvaluator } from './evaluate.js';

/**
 * Context provided to the model resolution hook.
 */
export interface ModelResolveContext {
  tenantId: string;
  userId: string;
  dataClassification: DataClassificationLevel;
  requestedModel: string;
  /** Available self-hosted model IDs for fallback routing */
  selfHostedModels: string[];
  /** Additional context passed through from the caller */
  additional?: Record<string, unknown>;
}

/**
 * Result of model routing.
 */
export interface ModelRouteResult {
  /** The model to use (may differ from the requested model) */
  resolvedModel: string;
  /** Whether the model was rerouted */
  rerouted: boolean;
  /** Reason for routing decision */
  reason: string;
  /** Policy that was applied */
  policyApplied: string;
}

/**
 * Classification levels at which external (cloud) models are blocked.
 * Confidential and restricted data must stay on self-hosted models.
 */
const EXTERNAL_BLOCKED_LEVELS: ReadonlySet<DataClassificationLevel> = new Set([
  'confidential',
  'restricted',
]);

/**
 * Known external (cloud) model prefixes.
 * Models whose ID starts with one of these are considered external.
 */
const EXTERNAL_MODEL_PREFIXES = [
  'gpt-',
  'claude-',
  'gemini-',
  'openai/',
  'anthropic/',
  'google/',
] as const;

/**
 * Default self-hosted model to fall back to when no self-hosted models
 * are listed in context.
 */
const DEFAULT_SELF_HOSTED_MODEL = 'local-llm-default';

/**
 * Determines whether a model ID refers to an external (cloud) model.
 */
export function isExternalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return EXTERNAL_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Model routing policy enforcement.
 *
 * Registered as a hook on `before_model_resolve`. For every model call:
 *  1. Checks data classification against policy.
 *  2. Blocks external models for confidential / restricted data.
 *  3. Routes to self-hosted model instead.
 */
export class ModelRouter {
  constructor(private readonly evaluator: PolicyEvaluator) {}

  /**
   * Evaluate whether the requested model is allowed given the data
   * classification, and reroute to a self-hosted model if necessary.
   */
  async route(context: ModelResolveContext): Promise<ModelRouteResult> {
    // Evaluate policy for the model call
    const policyRequest: PolicyEvaluateRequest = {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'model_call',
      context: {
        dataClassification: context.dataClassification,
        targetSystem: context.requestedModel,
        additional: {
          ...context.additional,
          is_external: isExternalModel(context.requestedModel),
        },
      },
    };

    const policyResult = await this.evaluator.evaluate(policyRequest);

    // If policy explicitly denies, block completely
    if (policyResult.decision === 'deny') {
      return {
        resolvedModel: context.requestedModel,
        rerouted: false,
        reason: `Model call denied by policy: ${policyResult.reason}`,
        policyApplied: policyResult.policyApplied,
      };
    }

    // Check classification-based routing: block external models for
    // confidential/restricted data
    if (
      isExternalModel(context.requestedModel) &&
      EXTERNAL_BLOCKED_LEVELS.has(context.dataClassification)
    ) {
      const selfHosted =
        context.selfHostedModels.length > 0
          ? context.selfHostedModels[0]
          : DEFAULT_SELF_HOSTED_MODEL;

      return {
        resolvedModel: selfHosted,
        rerouted: true,
        reason: `External model "${context.requestedModel}" blocked for ${context.dataClassification} data. Rerouted to self-hosted model "${selfHosted}".`,
        policyApplied: policyResult.policyApplied,
      };
    }

    // Check if policy constraints specify a max classification
    const maxClassification = policyResult.constraints.maxClassification;
    if (maxClassification && isExternalModel(context.requestedModel)) {
      const requestedIdx = CLASSIFICATION_LEVELS.indexOf(context.dataClassification);
      const maxIdx = CLASSIFICATION_LEVELS.indexOf(maxClassification);

      if (requestedIdx > maxIdx) {
        const selfHosted =
          context.selfHostedModels.length > 0
            ? context.selfHostedModels[0]
            : DEFAULT_SELF_HOSTED_MODEL;

        return {
          resolvedModel: selfHosted,
          rerouted: true,
          reason: `Data classification "${context.dataClassification}" exceeds max allowed "${maxClassification}" for external models. Rerouted to "${selfHosted}".`,
          policyApplied: policyResult.policyApplied,
        };
      }
    }

    // No rerouting needed
    return {
      resolvedModel: context.requestedModel,
      rerouted: false,
      reason: 'Model allowed by policy',
      policyApplied: policyResult.policyApplied,
    };
  }

  /**
   * Returns the hook registration for the `before_model_resolve` event.
   */
  getHookRegistration() {
    return {
      event: 'before_model_resolve',
      handler: async (hookContext: Record<string, unknown>) => {
        const context = hookContext as unknown as ModelResolveContext;
        const result = await this.route(context);

        // Mutate the hook context with the resolved model
        hookContext['resolvedModel'] = result.resolvedModel;
        hookContext['rerouted'] = result.rerouted;
        hookContext['routeReason'] = result.reason;
        hookContext['policyApplied'] = result.policyApplied;
      },
    };
  }
}
