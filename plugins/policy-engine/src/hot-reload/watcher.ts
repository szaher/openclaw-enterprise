import {
  POLICY_HOT_RELOAD_INTERVAL_MS,
} from '@openclaw-enterprise/shared/constants.js';
import { OpaClient } from '../evaluator/opa-client.js';

/**
 * Hot-reload service: monitors PostgreSQL for policy changes
 * and pushes updated Rego policies to OPA sidecar within 60 seconds.
 * Registered via api.registerService().
 */
export class PolicyHotReloadWatcher {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastCheckedAt: Date = new Date(0);
  private running = false;

  constructor(
    private readonly opaClient: OpaClient,
    private readonly fetchUpdatedPolicies: (since: Date) => Promise<
      Array<{ id: string; domain: string; content: string; updatedAt: Date }>
    >,
    private readonly pollIntervalMs: number = POLICY_HOT_RELOAD_INTERVAL_MS,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastCheckedAt = new Date();

    // Initial load of all active policies
    const allPolicies = await this.fetchUpdatedPolicies(new Date(0));
    for (const policy of allPolicies) {
      await this.pushToOpa(policy);
    }

    // Poll for changes
    this.interval = setInterval(() => {
      void this.checkForUpdates();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async healthCheck(): Promise<{ status: string }> {
    if (!this.running) {
      return { status: 'stopped' };
    }
    const opaHealth = await this.opaClient.healthCheck();
    return { status: opaHealth.status === 'healthy' ? 'healthy' : 'degraded' };
  }

  private async checkForUpdates(): Promise<void> {
    try {
      const updated = await this.fetchUpdatedPolicies(this.lastCheckedAt);
      for (const policy of updated) {
        await this.pushToOpa(policy);
      }
      this.lastCheckedAt = new Date();
    } catch (error: unknown) {
      // Log but don't crash — next poll will retry
      const message = error instanceof Error ? error.message : 'Unknown';
      console.error(`[policy-engine] Hot-reload check failed: ${message}`);
    }
  }

  private async pushToOpa(policy: {
    id: string;
    domain: string;
    content: string;
  }): Promise<void> {
    const policyPath = `openclaw/enterprise/${policy.domain.replace(/-/g, '_')}`;
    try {
      await this.opaClient.loadPolicy(policyPath, policy.content);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown';
      console.error(
        `[policy-engine] Failed to push policy ${policy.id} to OPA: ${message}`,
      );
    }
  }
}
