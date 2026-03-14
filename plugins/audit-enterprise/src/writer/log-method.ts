import type {
  AuditActionType,
  AuditOutcome,
  DataAccessRecord,
  DataClassificationLevel,
  PolicyResult,
} from '@openclaw-enterprise/shared';
import type { AuditWriter } from './writer.js';

/**
 * Incoming params for the audit.log gateway method,
 * matching the audit-api.md contract (snake_case over the wire).
 */
export interface AuditLogParams {
  tenant_id: string;
  user_id: string;
  action_type: AuditActionType;
  action_detail: Record<string, unknown>;
  data_accessed: Array<{ source: string; classification: string; purpose: string }>;
  model_used: string | null;
  model_tokens: { input: number; output: number } | null;
  data_classification: DataClassificationLevel;
  policy_applied: string;
  policy_result: PolicyResult;
  policy_reason: string;
  outcome: AuditOutcome;
  request_id: string;
}

/**
 * Response from the audit.log gateway method.
 */
export interface AuditLogResponse {
  audit_entry_id: string;
  timestamp: string;
}

/**
 * Create the handler function for the `audit.log` gateway method.
 */
export function createAuditLogHandler(writer: AuditWriter) {
  return async (params: Record<string, unknown>): Promise<AuditLogResponse> => {
    const p = params as unknown as AuditLogParams;

    const dataAccessed: DataAccessRecord[] = (p.data_accessed ?? []).map((d) => ({
      source: d.source,
      classification: d.classification as DataClassificationLevel,
      purpose: d.purpose,
    }));

    const result = await writer.insert({
      tenantId: p.tenant_id,
      userId: p.user_id,
      actionType: p.action_type,
      actionDetail: p.action_detail ?? {},
      dataAccessed,
      modelUsed: p.model_used ?? null,
      modelTokens: p.model_tokens ?? null,
      dataClassification: p.data_classification,
      policyApplied: p.policy_applied,
      policyResult: p.policy_result,
      policyReason: p.policy_reason,
      outcome: p.outcome,
      requestId: p.request_id,
    });

    return {
      audit_entry_id: result.id,
      timestamp: result.timestamp,
    };
  };
}
