import type { AuditEntry, UserContext, BuiltInRole } from '@openclaw-enterprise/shared';
import { API_BASE_PATH } from '@openclaw-enterprise/shared';
import type { HttpRouteRegistration } from './openclaw-types.js';
import type { AuditQueryResponse } from './query/query-method.js';
import type { DbPool } from './writer/writer.js';

/**
 * Minimal typed wrappers for the HTTP request/response objects
 * provided by the OpenClaw HTTP route system.
 */
interface AuditRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  user?: UserContext;
}

interface AuditResponse {
  status(code: number): AuditResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

/**
 * Create all audit REST route registrations.
 */
export function createAuditRoutes(
  queryHandler: (params: Record<string, unknown>) => Promise<AuditQueryResponse>,
  db: DbPool,
): HttpRouteRegistration[] {
  const basePath = `${API_BASE_PATH}/audit`;

  /**
   * Ensure the request has an authenticated user context.
   * Returns the user context or sends a 401 and returns null.
   */
  function requireAuth(req: AuditRequest, res: AuditResponse): UserContext | null {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return req.user;
  }

  /**
   * T148: Require enterprise_admin role for audit export.
   */
  function requireEnterpriseAdmin(req: AuditRequest, res: AuditResponse): UserContext | null {
    const user = requireAuth(req, res);
    if (!user) return null;

    if (!user.roles.includes('enterprise_admin' as BuiltInRole)) {
      res.status(403).json({ error: 'Enterprise admin role is required for audit export' });
      return null;
    }
    return user;
  }

  // ----------------------------------------------------------------
  // GET /api/v1/audit/export  (must be registered before /:id)
  // T148: Require enterprise_admin role
  // ----------------------------------------------------------------
  const exportRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${basePath}/export`,
    handler: async (rawReq: unknown, rawRes: unknown): Promise<void> => {
      const req = rawReq as AuditRequest;
      const res = rawRes as AuditResponse;

      const user = requireEnterpriseAdmin(req, res);
      if (!user) return;

      const format = req.query['format'] ?? 'json';
      if (format !== 'csv' && format !== 'json') {
        res.status(400).json({ error: 'Invalid format. Use csv or json.' });
        return;
      }

      const result = await queryHandler({
        tenant_id: user.tenantId,
        filters: {
          user_id: req.query['user_id'],
          action_type: req.query['action_type'],
          from: req.query['from'],
          to: req.query['to'],
        },
        page_size: 1000,
        page: 1,
      });

      if (format === 'csv') {
        const csvHeaders = [
          'id',
          'tenant_id',
          'user_id',
          'timestamp',
          'action_type',
          'data_classification',
          'policy_applied',
          'policy_result',
          'outcome',
          'request_id',
        ];
        const csvRows = result.entries.map((entry: AuditEntry) =>
          [
            entry.id,
            entry.tenantId,
            entry.userId,
            entry.timestamp,
            entry.actionType,
            entry.dataClassification,
            entry.policyApplied,
            entry.policyResult,
            entry.outcome,
            entry.requestId,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
        res.end(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.json({ entries: result.entries, total: result.total });
      }
    },
  };

  // ----------------------------------------------------------------
  // GET /api/v1/audit  — list with filters
  // ----------------------------------------------------------------
  const listRoute: HttpRouteRegistration = {
    method: 'GET',
    path: basePath,
    handler: async (rawReq: unknown, rawRes: unknown): Promise<void> => {
      const req = rawReq as AuditRequest;
      const res = rawRes as AuditResponse;

      const user = requireAuth(req, res);
      if (!user) return;

      const page = req.query['page'] ? parseInt(req.query['page'], 10) : 1;
      const pageSize = req.query['page_size'] ? parseInt(req.query['page_size'], 10) : undefined;

      const result = await queryHandler({
        tenant_id: user.tenantId,
        filters: {
          user_id: req.query['user_id'],
          action_type: req.query['action_type'],
          from: req.query['from'],
          to: req.query['to'],
        },
        page,
        page_size: pageSize,
      });

      res.json(result);
    },
  };

  // ----------------------------------------------------------------
  // GET /api/v1/audit/:id  — single entry by ID
  // ----------------------------------------------------------------
  const getByIdRoute: HttpRouteRegistration = {
    method: 'GET',
    path: `${basePath}/:id`,
    handler: async (rawReq: unknown, rawRes: unknown): Promise<void> => {
      const req = rawReq as AuditRequest;
      const res = rawRes as AuditResponse;

      const user = requireAuth(req, res);
      if (!user) return;

      const entryId = req.params['id'];
      if (!entryId) {
        res.status(400).json({ error: 'Missing audit entry ID' });
        return;
      }

      const result = await db.query(
        'SELECT * FROM audit.audit_entries WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [entryId, user.tenantId],
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: 'Audit entry not found' });
        return;
      }

      const entry: AuditEntry = {
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

      res.json(entry);
    },
  };

  return [exportRoute, listRoute, getByIdRoute];
}
