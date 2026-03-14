import type {
  AuditActionType,
  AuditOutcome,
  DataAccessRecord,
  DataClassificationLevel,
  PolicyResult,
} from '@openclaw-enterprise/shared';

/**
 * Error thrown when an audit write operation fails.
 */
export class AuditWriteError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuditWriteError';
    this.cause = cause;
  }
}

/**
 * Parameters for writing a single audit entry.
 */
export interface AuditWriteParams {
  tenantId: string;
  userId: string;
  actionType: AuditActionType;
  actionDetail: Record<string, unknown>;
  dataAccessed: DataAccessRecord[];
  modelUsed: string | null;
  modelTokens: { input: number; output: number } | null;
  dataClassification: DataClassificationLevel;
  policyApplied: string;
  policyResult: PolicyResult;
  policyReason: string;
  outcome: AuditOutcome;
  requestId: string;
}

/**
 * Result returned after successfully writing an audit entry.
 */
export interface AuditWriteResult {
  id: string;
  timestamp: string;
}

/**
 * Minimal interface for a PostgreSQL connection pool.
 */
export interface DbPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * Generate a ULID-like sortable ID.
 *
 * Format: <timestamp-hex-12chars>-<random-uuid-segment>
 * This produces lexicographically sortable IDs based on creation time.
 */
export function generateSortableId(): string {
  const timestampHex = Date.now().toString(16).padStart(12, '0');
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  return `${timestampHex}${randomPart}`;
}

/**
 * Append-only audit writer.
 *
 * This class intentionally exposes ONLY an `insert` method.
 * There are no update or delete methods — audit entries are immutable.
 * The database enforces this constraint via triggers as well (see 004_audit_entries.sql).
 */
export class AuditWriter {
  private readonly db: DbPool;

  constructor(db: DbPool) {
    this.db = db;
  }

  /**
   * Insert a single audit entry into the audit.audit_entries table.
   * Returns the generated ID and timestamp.
   */
  async insert(params: AuditWriteParams): Promise<AuditWriteResult> {
    const id = generateSortableId();
    const timestamp = new Date().toISOString();

    const sql = `
      INSERT INTO audit.audit_entries (
        id, tenant_id, user_id, timestamp, action_type, action_detail,
        data_accessed, model_used, model_tokens, data_classification,
        policy_applied, policy_result, policy_reason, outcome, request_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15
      )
      RETURNING id, timestamp
    `;

    const values = [
      id,
      params.tenantId,
      params.userId,
      timestamp,
      params.actionType,
      JSON.stringify(params.actionDetail),
      JSON.stringify(params.dataAccessed),
      params.modelUsed,
      params.modelTokens ? JSON.stringify(params.modelTokens) : null,
      params.dataClassification,
      params.policyApplied,
      params.policyResult,
      params.policyReason,
      params.outcome,
      params.requestId,
    ];

    try {
      const result = await this.db.query(sql, values);
      const row = result.rows[0];
      if (!row) {
        throw new AuditWriteError('Insert returned no rows');
      }
      return {
        id: row['id'] as string,
        timestamp: String(row['timestamp']),
      };
    } catch (error) {
      if (error instanceof AuditWriteError) {
        throw error;
      }
      throw new AuditWriteError('Failed to write audit entry', error);
    }
  }
}
