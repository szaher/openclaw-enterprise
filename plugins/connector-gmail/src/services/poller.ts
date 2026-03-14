import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ServiceRegistration } from '../openclaw-types.js';
import { GmailReadTools } from '../tools/read.js';

/**
 * Configuration for the Gmail inbox poller service.
 */
export interface GmailPollerConfig {
  /** Polling interval in milliseconds (default: 60000) */
  intervalMs: number;
  /** Gmail query for polling (default: 'is:unread') */
  query: string;
  /** Maximum messages per poll cycle */
  maxResults: number;
  /** OAuth token refresh function */
  refreshToken: () => Promise<string>;
  /** Tenant ID */
  tenantId: string;
  /** User ID */
  userId: string;
}

const DEFAULT_CONFIG: GmailPollerConfig = {
  intervalMs: 60_000,
  query: 'is:unread',
  maxResults: 20,
  refreshToken: async () => { throw new Error('refreshToken not configured'); },
  tenantId: '',
  userId: '',
};

/**
 * Gmail inbox polling service (T056).
 *
 * Polls Gmail on a configurable interval.
 * Handles OAuth token refresh before each poll cycle.
 * Detects OAuth revocation (401/invalid_grant) and disables the connector.
 * Reports partial status when Gmail API is temporarily unavailable.
 */
export class GmailInboxPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentAccessToken: string | null = null;
  private disabled = false;
  private disableReason: string | null = null;
  private lastPollAt: Date | null = null;
  private lastError: string | null = null;
  private readonly config: GmailPollerConfig;
  private readonly gateway: GatewayMethods;

  constructor(gateway: GatewayMethods, config: Partial<GmailPollerConfig> & Pick<GmailPollerConfig, 'refreshToken' | 'tenantId' | 'userId'>) {
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Returns a ServiceRegistration compatible with OpenClaw's plugin API.
   */
  getServiceRegistration(): ServiceRegistration {
    return {
      name: 'gmail-inbox-poller',
      start: () => this.start(),
      stop: () => this.stop(),
      healthCheck: () => this.healthCheck(),
    };
  }

  async start(): Promise<void> {
    if (this.disabled) return;

    // Refresh token on startup
    await this.refreshAccessToken();

    // Run initial poll
    await this.poll();

    // Schedule recurring polls
    this.timer = setInterval(() => {
      void this.poll();
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

  private async poll(): Promise<void> {
    if (this.disabled) return;

    try {
      // Refresh the OAuth token before each poll cycle
      await this.refreshAccessToken();

      if (this.currentAccessToken === null) {
        this.lastError = 'No access token available';
        return;
      }

      const readTools = new GmailReadTools(
        this.gateway,
        this.config.tenantId,
        this.config.userId,
        this.currentAccessToken,
      );

      const result = await readTools.emailSearch({
        query: this.config.query,
        maxResults: this.config.maxResults,
      });

      this.lastPollAt = new Date();

      if (result.connectorStatus === 'error') {
        this.lastError = result.errorDetail ?? 'Unknown error';
      } else {
        this.lastError = null;
      }
    } catch (error) {
      if (this.isOAuthRevocation(error)) {
        this.disable('OAuth access revoked by user or admin');
        return;
      }

      if (this.isApiUnavailable(error)) {
        // Graceful degradation: report partial status, do not disable
        this.lastError = `Gmail API temporarily unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return;
      }

      this.lastError = error instanceof Error ? error.message : 'Unknown polling error';
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

/** Re-export ServiceRegistration type for convenience */
export type { ServiceRegistration } from '../openclaw-types.js';
