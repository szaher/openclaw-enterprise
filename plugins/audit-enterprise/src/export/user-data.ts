import { API_BASE_PATH } from '@openclaw-enterprise/shared/constants.js';

/**
 * User data export and deletion service per FR-041.
 * Handles GDPR-style data subject requests for audit data.
 */

export interface UserDataStore {
  findAuditEntriesByUser(userId: string, tenantId: string): Promise<AuditEntryRow[]>;
  findTasksByUser(userId: string): Promise<TaskRow[]>;
  findExchangesByUser(userId: string): Promise<ExchangeRow[]>;
  deleteUserAuditEntries(userId: string, tenantId: string): Promise<number>;
  deleteUserTasks(userId: string): Promise<number>;
  deleteUserExchanges(userId: string): Promise<number>;
  anonymizeAuditEntries(userId: string, tenantId: string): Promise<number>;
}

interface AuditEntryRow {
  id: string;
  timestamp: string;
  actionType: string;
  actionDetail: Record<string, unknown>;
  dataClassification: string;
  outcome: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  discoveredAt: string;
}

interface ExchangeRow {
  exchangeId: string;
  exchangeType: string;
  outcome: string;
  startedAt: string;
}

export interface UserDataExport {
  userId: string;
  tenantId: string;
  exportedAt: string;
  auditEntries: AuditEntryRow[];
  tasks: TaskRow[];
  exchanges: ExchangeRow[];
}

export interface UserDataDeletionResult {
  userId: string;
  tenantId: string;
  deletedAt: string;
  auditEntriesAnonymized: number;
  tasksDeleted: number;
  exchangesDeleted: number;
}

export class UserDataService {
  constructor(private readonly store: UserDataStore) {}

  /**
   * Export all user data for a data subject request.
   * Returns structured export with all personal data.
   */
  async exportUserData(userId: string, tenantId: string): Promise<UserDataExport> {
    const [auditEntries, tasks, exchanges] = await Promise.all([
      this.store.findAuditEntriesByUser(userId, tenantId),
      this.store.findTasksByUser(userId),
      this.store.findExchangesByUser(userId),
    ]);

    return {
      userId,
      tenantId,
      exportedAt: new Date().toISOString(),
      auditEntries,
      tasks,
      exchanges,
    };
  }

  /**
   * Delete/anonymize user data for a data subject request.
   * Audit entries are anonymized (not deleted) to maintain audit trail integrity.
   * Tasks and exchanges are fully deleted.
   */
  async deleteUserData(userId: string, tenantId: string): Promise<UserDataDeletionResult> {
    const [auditEntriesAnonymized, tasksDeleted, exchangesDeleted] = await Promise.all([
      this.store.anonymizeAuditEntries(userId, tenantId),
      this.store.deleteUserTasks(userId),
      this.store.deleteUserExchanges(userId),
    ]);

    return {
      userId,
      tenantId,
      deletedAt: new Date().toISOString(),
      auditEntriesAnonymized,
      tasksDeleted,
      exchangesDeleted,
    };
  }

  /**
   * Route registration for user data endpoints.
   */
  getRoutes() {
    return [
      {
        method: 'GET' as const,
        path: `${API_BASE_PATH}/user-data/:userId/export`,
        handler: async (req: unknown, res: unknown) => {
          const request = req as { params: { userId: string }; headers: Record<string, string> };
          const response = res as { status: (code: number) => { json: (body: unknown) => void } };
          const tenantId = request.headers['x-tenant-id'] ?? '';

          const data = await this.exportUserData(request.params.userId, tenantId);
          response.status(200).json(data);
        },
      },
      {
        method: 'DELETE' as const,
        path: `${API_BASE_PATH}/user-data/:userId`,
        handler: async (req: unknown, res: unknown) => {
          const request = req as { params: { userId: string }; headers: Record<string, string> };
          const response = res as { status: (code: number) => { json: (body: unknown) => void } };
          const tenantId = request.headers['x-tenant-id'] ?? '';

          const result = await this.deleteUserData(request.params.userId, tenantId);
          response.status(200).json(result);
        },
      },
    ];
  }
}
