import {
  TASK_ACTIVE_RETENTION_DAYS,
  TASK_ARCHIVE_AFTER_DAYS,
  TASK_PURGE_AFTER_ARCHIVE_DAYS,
} from '@openclaw-enterprise/shared/constants.js';

export interface TaskRecord {
  id: string;
  status: string;
  completedAt: string | null;
  archivedAt: string | null;
  discoveredAt: string;
}

export interface TaskStore {
  findByStatus(status: string): Promise<TaskRecord[]>;
  updateStatus(id: string, status: string, fields: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * Task retention lifecycle service.
 * Manages the lifecycle: discovered -> active -> completed -> archived -> purged.
 *
 * - Archive completed tasks after 30 days
 * - Purge archived tasks after 90 days
 * - Purge active tasks after 90 days (stale)
 *
 * Runs on a daily schedule via registerService.
 */
export class TaskRetentionService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly store: TaskStore,
    private readonly checkIntervalMs: number = 24 * 3600 * 1000, // Daily
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Run immediately on start
    await this.processRetention();

    this.interval = setInterval(() => {
      void this.processRetention();
    }, this.checkIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async healthCheck(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'stopped' };
  }

  async processRetention(): Promise<{
    archived: number;
    purgedFromArchive: number;
    purgedStale: number;
  }> {
    const now = Date.now();
    let archived = 0;
    let purgedFromArchive = 0;
    let purgedStale = 0;

    // 1. Archive completed tasks older than 30 days
    const completedTasks = await this.store.findByStatus('completed');
    for (const task of completedTasks) {
      if (!task.completedAt) continue;
      const completedAt = new Date(task.completedAt).getTime();
      const daysSinceCompleted = (now - completedAt) / (24 * 3600 * 1000);

      if (daysSinceCompleted >= TASK_ARCHIVE_AFTER_DAYS) {
        await this.store.updateStatus(task.id, 'archived', {
          archivedAt: new Date().toISOString(),
          purgeAt: new Date(now + TASK_PURGE_AFTER_ARCHIVE_DAYS * 24 * 3600 * 1000).toISOString(),
        });
        archived++;
      }
    }

    // 2. Purge archived tasks older than 90 days
    const archivedTasks = await this.store.findByStatus('archived');
    for (const task of archivedTasks) {
      if (!task.archivedAt) continue;
      const archivedAt = new Date(task.archivedAt).getTime();
      const daysSinceArchived = (now - archivedAt) / (24 * 3600 * 1000);

      if (daysSinceArchived >= TASK_PURGE_AFTER_ARCHIVE_DAYS) {
        await this.store.delete(task.id);
        purgedFromArchive++;
      }
    }

    // 3. Purge stale active/discovered tasks older than 90 days
    for (const status of ['active', 'discovered']) {
      const tasks = await this.store.findByStatus(status);
      for (const task of tasks) {
        const discoveredAt = new Date(task.discoveredAt).getTime();
        const daysSinceDiscovered = (now - discoveredAt) / (24 * 3600 * 1000);

        if (daysSinceDiscovered >= TASK_ACTIVE_RETENTION_DAYS) {
          await this.store.delete(task.id);
          purgedStale++;
        }
      }
    }

    return { archived, purgedFromArchive, purgedStale };
  }
}
