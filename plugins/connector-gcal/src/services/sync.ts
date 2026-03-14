import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { GCalReadTools } from '../tools/read.js';

/**
 * Configuration for the GCal sync service.
 */
export interface GCalSyncConfig {
  /** Sync interval in milliseconds (default: 60000) */
  intervalMs: number;
  /** How far ahead to sync (default: 7 days) */
  syncWindowDays: number;
  /** Maximum events per sync cycle */
  maxResults: number;
  /** Calendar ID to sync (default: 'primary') */
  calendarId: string;
  /** OAuth token refresh function */
  refreshToken: () => Promise<string>;
  /** Tenant ID */
  tenantId: string;
  /** User ID */
  userId: string;
}

const DEFAULT_CONFIG: GCalSyncConfig = {
  intervalMs: 60_000,
  syncWindowDays: 7,
  maxResults: 50,
  calendarId: 'primary',
  refreshToken: async () => { throw new Error('refreshToken not configured'); },
  tenantId: '',
  userId: '',
};

/**
 * Google Calendar sync service (T062).
 *
 * Periodically syncs calendar events within a configurable time window.
 * Handles OAuth token refresh before each sync cycle.
 * Detects OAuth revocation (401/invalid_grant) and disables the connector.
 * Reports partial status when the Calendar API is temporarily unavailable.
 */
export class GCalSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentAccessToken: string | null = null;
  private disabled = false;
  private disableReason: string | null = null;
  private lastSyncAt: Date | null = null;
  private lastError: string | null = null;
  private readonly config: GCalSyncConfig;
  private readonly gateway: GatewayMethods;

  constructor(
    gateway: GatewayMethods,
    config: Partial<GCalSyncConfig> & Pick<GCalSyncConfig, 'refreshToken' | 'tenantId' | 'userId'>,
  ) {
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Returns a ServiceRegistration compatible with OpenClaw's plugin API.
   */
  getServiceRegistration() {
    return {
      name: 'gcal-sync',
      start: () => this.start(),
      stop: () => this.stop(),
      healthCheck: () => this.healthCheck(),
    };
  }

  async start(): Promise<void> {
    if (this.disabled) return;

    // Refresh token on startup
    await this.refreshAccessToken();

    // Run initial sync
    await this.sync();

    // Schedule recurring syncs
    this.timer = setInterval(() => {
      void this.sync();
    }, this.config.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async healthCheck(): Promise<{ status: string; detail?: string }> {
    if (this.disabled) {
      return { status: 'disabled', detail: this.disableReason ?? 'Connector disabled' };
    }

    if (this.lastError !== null) {
      return { status: 'degraded', detail: this.lastError };
    }

    return { status: 'healthy' };
  }

  // --- Private ---

  private async sync(): Promise<void> {
    if (this.disabled) return;

    try {
      await this.refreshAccessToken();

      if (this.currentAccessToken === null) {
        this.lastError = 'No access token available';
        return;
      }

      const readTools = new GCalReadTools(
        this.gateway,
        this.config.tenantId,
        this.config.userId,
        this.currentAccessToken,
        this.config.calendarId,
      );

      const now = new Date();
      const timeMax = new Date(now.getTime() + this.config.syncWindowDays * 24 * 60 * 60 * 1000);

      const result = await readTools.calendarRead({
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: this.config.maxResults,
      });

      this.lastSyncAt = new Date();

      if (result.connectorStatus === 'error') {
        this.lastError = result.errorDetail ?? 'Unknown sync error';
      } else {
        this.lastError = null;
      }
    } catch (error) {
      if (this.isOAuthRevocation(error)) {
        this.disable('OAuth access revoked by user or admin');
        return;
      }

      if (this.isApiUnavailable(error)) {
        this.lastError = `GCal API temporarily unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return;
      }

      this.lastError = error instanceof Error ? error.message : 'Unknown sync error';
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      this.currentAccessToken = await this.config.refreshToken();
    } catch (error) {
      if (this.isOAuthRevocation(error)) {
        this.disable('OAuth token refresh failed — access revoked');
        return;
      }
      throw error;
    }
  }

  private isOAuthRevocation(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('invalid_grant') || msg.includes('token revoked') || msg.includes('401');
    }
    return false;
  }

  private isApiUnavailable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('503') || msg.includes('econnrefused') || msg.includes('timeout');
    }
    return false;
  }

  private disable(reason: string): void {
    this.disabled = true;
    this.disableReason = reason;
    void this.stop();
  }
}
