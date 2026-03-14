import type {
  PolicyEvaluateRequest,
  PolicyEvaluateResponse,
} from '@openclaw-enterprise/shared/types.js';

/**
 * Gateway method interfaces for inter-plugin communication.
 * Used by the OCIP protocol plugin for policy evaluation and audit logging.
 */
export interface GatewayMethods {
  'policy.evaluate': (params: PolicyEvaluateRequest) => Promise<PolicyEvaluateResponse>;
  'audit.log': (params: Record<string, unknown>) => Promise<{ id: string }>;
}
