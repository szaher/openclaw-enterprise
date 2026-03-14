import type { AuditActionType, AuditEntry, PolicyResult } from '@openclaw-enterprise/shared';
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_QUERY_TIMEOUT_MS,
} from '@openclaw-enterprise/shared';
import type { DbPool } from '../writer/writer.js';

/**
 * Filters for the audit.query gateway method.
 */
export interface AuditQueryFilters {
  user_id?: string;
  action_type?: AuditActionType;
  from?: string;
  to?: string;
  policy_result?: PolicyResult;
  request_id?: string;
}

/**
 * Incoming params for the audit.query gateway method.
 */
export interface AuditQueryParams {
  tenant_id: string;
  filters?: AuditQueryFilters;
  limit?: number;
  offset?: number;
  /** Alias for limit, used by REST layer */
  page_size?: number;
  /** 1-based page number, used by REST layer */
  page?: number;
}

/**
 * Response from the audit.query gateway method.
 */
export interface AuditQueryResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * Map a database row to an AuditEntry.
 */
function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    userId: row['user_id'] as string,
    timestamp: String(row['timestamp']),
    actionType: row['action_type'] as AuditEntry['actionType'],
    actionDetail: (row['action_detail'] ?? {}) as Record<string, unknown>,
    dataAccessed: (row['data_accessed'] ?? []) as AuditEntry['dataAccessed'],
    modelUsed: (row['model_used'] as string) ?? null,
    modelTokens: (row['model_tokens'] as AuditEntry['modelTokens']) ?? null,
    dataClassification: row['data_classification'] as AuditEntry['dataClassification'],
    policyApplied: row['policy_applied'] as string,
    policyResult: row['policy_result'] as AuditEntry['policyResult'],
    policyReason: (row['policy_reason'] as string) ?? '',
    outcome: row['outcome'] as AuditEntry['outcome'],
    requestId: row['request_id'] as string,
  };
}

/**
 * Create the handler function for the `audit.query` gateway method.
 */
export function createAuditQueryHandler(db: DbPool) {
  return async (params: Record<string, unknown>): Promise<AuditQueryResponse> => {
    const p = params as unknown as AuditQueryParams;

    const pageSize = Math.min(
      Math.max(p.limit ?? p.page_size ?? AUDIT_DEFAULT_PAGE_SIZE, 1),
      AUDIT_MAX_PAGE_SIZE,
    );
    const page = Math.max(p.page ?? 1, 1);
    const offset = p.offset ?? (page - 1) * pageSize;

    const filters = p.filters ?? {};
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [p.tenant_id];
    let paramIndex = 2;

    if (filters.user_id) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(filters.user_id);
      paramIndex++;
    }

    if (filters.action_type) {
      conditions.push(`action_type = $${paramIndex}`);
      values.push(filters.action_type);
      paramIndex++;
    }

    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(filters.from);
      paramIndex++;
    }

    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(filters.to);
      paramIndex++;
    }

    if (filters.policy_result) {
      conditions.push(`policy_result = $${paramIndex}`);
      values.push(filters.policy_result);
      paramIndex++;
    }

    if (filters.request_id) {
      conditions.push(`request_id = $${paramIndex}`);
      values.push(filters.request_id);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Set statement timeout for <10s response guarantee
    await db.query(`SET LOCAL statement_timeout = '${AUDIT_QUERY_TIMEOUT_MS}ms'`);

    // Count total matching entries
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit.audit_entries WHERE ${whereClause}`,
      values,
    );
    const total = (countResult.rows[0]?.['total'] as number) ?? 0;

    // Fetch the page of entries
    const dataResult = await db.query(
      `SELECT * FROM audit.audit_entries WHERE ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, pageSize, offset],
    );

    const entries = dataResult.rows.map(rowToAuditEntry);

    return {
      entries,
      total,
      page,
      page_size: pageSize,
      has_more: offset + entries.length < total,
    };
  };
}
