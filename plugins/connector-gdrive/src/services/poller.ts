import type { ServiceRegistration } from '../openclaw-types.js';
import type { ChangeClassification, DataClassificationLevel } from '@openclaw-enterprise/shared';

// --- Google Drive Changes API types ---

export interface GDriveChange {
  fileId: string;
  file: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    version: string;
    webViewLink: string;
    lastModifyingUser?: { displayName: string; emailAddress: string };
  } | null;
  removed: boolean;
  time: string;
}

export interface GDriveChangesResponse {
  changes: GDriveChange[];
  newStartPageToken: string;
  nextPageToken?: string;
}

export interface GDriveRevision {
  id: string;
  modifiedTime: string;
  lastModifyingUser?: { displayName: string; emailAddress: string };
  size?: string;
  exportedContent?: string;
}

// --- Change event emitted by the poller ---

export interface GDriveChangeEvent {
  fileId: string;
  fileName: string;
  mimeType: string;
  changeType: 'modified' | 'created' | 'deleted';
  changeClassification: ChangeClassification;
  previousRevisionId: string | null;
  currentRevisionId: string;
  modifiedBy: string | null;
  modifiedAt: string;
  url: string;
  tenantId: string;
  userId: string;
  dataClassification: DataClassificationLevel;
  summary: string;
}

// --- API client interface for the poller ---

export interface GDriveChangesApiClient {
  getStartPageToken(): Promise<string>;
  listChanges(pageToken: string): Promise<GDriveChangesResponse>;
  getRevisions(fileId: string): Promise<GDriveRevision[]>;
  getFileContent(fileId: string, revisionId: string): Promise<string>;
}

// --- Change event listener ---

export type ChangeEventListener = (event: GDriveChangeEvent) => void | Promise<void>;

// --- Poller configuration ---

export interface GDrivePollerConfig {
  pollIntervalMs: number;
  tenantId: string;
  userId: string;
  apiClient: GDriveChangesApiClient;
  onChangeEvent: ChangeEventListener;
}

const DEFAULT_POLL_INTERVAL_MS = 60_000; // 1 minute

/**
 * Document change polling service for Google Drive.
 * Implements ServiceRegistration for lifecycle management within OpenClaw.
 *
 * Uses the Google Drive Changes API to detect document modifications.
 * Compares current vs previous revision to classify changes.
 * Emits structured change events for the org-intelligence plugin.
 *
 * Handles:
 * - OAuth token refresh failures (graceful disable)
 * - Revocation detection (stops polling, reports unhealthy)
 * - Configurable poll interval
 */
export class GDriveDocumentPoller {
  private readonly config: GDrivePollerConfig;
  private pageToken: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private healthy = true;
  private lastError: string | null = null;
  private revisionCache: Map<string, string> = new Map();

  constructor(config: Partial<GDrivePollerConfig> & Pick<GDrivePollerConfig, 'tenantId' | 'userId' | 'apiClient' | 'onChangeEvent'>) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      ...config,
    };
  }

  /** Start the polling loop. Obtains initial page token and begins interval. */
  async start(): Promise<void> {
    if (this.running) return;

    try {
      this.pageToken = await this.config.apiClient.getStartPageToken();
      this.running = true;
      this.healthy = true;
      this.lastError = null;

      this.pollTimer = setInterval(() => {
        void this.poll();
      }, this.config.pollIntervalMs);
    } catch (error) {
      this.handleStartupError(error);
      throw error;
    }
  }

  /** Stop the polling loop and clean up. */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.revisionCache.clear();
  }

  /** Health check for the poller service. */
  async healthCheck(): Promise<{ status: string; detail?: string }> {
    if (!this.running) {
      return { status: 'stopped' };
    }

    if (!this.healthy) {
      return { status: 'unhealthy', detail: this.lastError ?? 'Unknown error' };
    }

    return { status: 'healthy' };
  }

  /** Get a ServiceRegistration for the OpenClaw plugin API. */
  getServiceRegistration(): ServiceRegistration {
    return {
      name: 'gdrive-document-poller',
      start: () => this.start(),
      stop: () => this.stop(),
      healthCheck: () => this.healthCheck(),
    };
  }

  /** Execute a single poll cycle. */
  private async poll(): Promise<void> {
    if (!this.running || this.pageToken === null) return;

    try {
      const response = await this.config.apiClient.listChanges(this.pageToken);

      for (const change of response.changes) {
        await this.processChange(change);
      }

      // Update page token for next poll
      this.pageToken = response.newStartPageToken;
      this.healthy = true;
      this.lastError = null;
    } catch (error) {
      this.handlePollError(error);
    }
  }

  /** Process a single change from the Changes API. */
  private async processChange(change: GDriveChange): Promise<void> {
    if (change.removed || change.file === null) {
      // File was deleted or access revoked
      await this.emitEvent({
        fileId: change.fileId,
        fileName: '',
        mimeType: '',
        changeType: 'deleted',
        changeClassification: 'substantive',
        previousRevisionId: this.revisionCache.get(change.fileId) ?? null,
        currentRevisionId: '',
        modifiedBy: null,
        modifiedAt: change.time,
        url: '',
        tenantId: this.config.tenantId,
        userId: this.config.userId,
        dataClassification: 'internal',
        summary: `Document ${change.fileId} was deleted or access was revoked.`,
      });

      this.revisionCache.delete(change.fileId);
      return;
    }

    const file = change.file;
    const previousRevisionId = this.revisionCache.get(file.id) ?? null;
    const currentRevisionId = file.version;

    // Determine change type
    const changeType = previousRevisionId === null ? 'created' : 'modified';

    // Classify the change by comparing revisions
    let changeClassification: ChangeClassification = 'minor';
    let summary = `Document "${file.name}" was ${changeType}.`;

    if (changeType === 'modified' && previousRevisionId !== null) {
      changeClassification = await this.classifyChange(
        file.id,
        previousRevisionId,
        currentRevisionId,
      );
      summary = `Document "${file.name}" had ${changeClassification} changes.`;
    } else if (changeType === 'created') {
      changeClassification = 'substantive';
      summary = `New document "${file.name}" was created.`;
    }

    await this.emitEvent({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      changeType,
      changeClassification,
      previousRevisionId,
      currentRevisionId,
      modifiedBy: file.lastModifyingUser?.displayName ?? null,
      modifiedAt: file.modifiedTime,
      url: file.webViewLink,
      tenantId: this.config.tenantId,
      userId: this.config.userId,
      dataClassification: 'internal',
      summary,
    });

    // Update revision cache
    this.revisionCache.set(file.id, currentRevisionId);
  }

  /**
   * Classify a change by comparing previous and current revision content.
   * Uses content length difference and simple heuristics.
   */
  private async classifyChange(
    fileId: string,
    previousRevisionId: string,
    currentRevisionId: string,
  ): Promise<ChangeClassification> {
    try {
      const [previousContent, currentContent] = await Promise.all([
        this.config.apiClient.getFileContent(fileId, previousRevisionId),
        this.config.apiClient.getFileContent(fileId, currentRevisionId),
      ]);

      const lengthDiff = Math.abs(currentContent.length - previousContent.length);
      const relativeDiff = previousContent.length > 0
        ? lengthDiff / previousContent.length
        : 1;

      // Simple heuristic classification:
      // - cosmetic: < 1% change (formatting, whitespace)
      // - minor: 1-10% change
      // - substantive: 10-50% change
      // - critical: > 50% change (major rewrite)
      if (relativeDiff < 0.01) return 'cosmetic';
      if (relativeDiff < 0.10) return 'minor';
      if (relativeDiff < 0.50) return 'substantive';
      return 'critical';
    } catch {
      // If we can't fetch revisions, assume minor change
      return 'minor';
    }
  }

  /** Emit a change event to the registered listener. */
  private async emitEvent(event: GDriveChangeEvent): Promise<void> {
    try {
      await this.config.onChangeEvent(event);
    } catch {
      // Don't let listener errors crash the poller
    }
  }

  /** Handle errors during poll startup (e.g., getStartPageToken fails). */
  private handleStartupError(error: unknown): void {
    this.healthy = false;

    if (this.isOAuthError(error)) {
      this.lastError = 'OAuth access revoked during startup';
      this.running = false;
    } else {
      this.lastError = error instanceof Error ? error.message : 'Unknown startup error';
    }
  }

  /** Handle errors during a poll cycle. */
  private handlePollError(error: unknown): void {
    if (this.isOAuthError(error)) {
      // OAuth revoked -- stop polling permanently until re-auth
      this.healthy = false;
      this.lastError = 'OAuth access revoked';
      this.running = false;

      if (this.pollTimer !== null) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    } else {
      // Transient error -- log and continue polling
      this.lastError = error instanceof Error ? error.message : 'Unknown poll error';
      // Stay healthy for transient errors; mark unhealthy after repeated failures
      // could be enhanced with a failure counter
    }
  }

  /** Detect OAuth revocation or token expiration errors. */
  private isOAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('invalid_grant') ||
        msg.includes('token revoked') ||
        msg.includes('401') ||
        msg.includes('unauthorized')
      );
    }
    return false;
  }
}
