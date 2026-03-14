import type {
  ChangeClassification,
  DataClassificationLevel,
  DeliveryChannel,
} from '@openclaw-enterprise/shared/types.js';
import type { ChangeSummary } from '../doc-monitor/summarizer.js';
import type { Digest } from '../digest/generator.js';

/**
 * A notification to be delivered to a user.
 */
export interface Notification {
  id: string;
  userId: string;
  type: 'doc-change' | 'digest' | 'consistency-alert';
  urgency: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  body: string;
  channel: DeliveryChannel;
  classification: DataClassificationLevel;
  metadata: Record<string, unknown>;
  createdAt: string;
  deliveredAt: string | null;
  suppressed: boolean;
  suppressionReason: string | null;
}

/**
 * Policy evaluation result for notification suppression.
 */
export interface NotificationPolicyResult {
  suppress: boolean;
  reason: string;
}

/**
 * Interface for policy evaluation.
 */
export interface NotificationPolicyEvaluator {
  evaluate(
    changeClassification: ChangeClassification,
    userId: string,
  ): Promise<NotificationPolicyResult>;
}

/**
 * Interface for delivering notifications.
 */
export interface NotificationDeliveryTarget {
  deliver(notification: Notification): Promise<boolean>;
}

/**
 * Service health status.
 */
export interface NotifierHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  pendingNotifications: number;
  lastDeliveryAt: string | null;
}

/**
 * Notification Service.
 * Registered as an OpenClaw service for delivering change notifications
 * based on urgency. Suppresses cosmetic changes per policy.
 */
export class NotificationService {
  private running = false;
  private pendingQueue: Notification[] = [];
  private lastDeliveryAt: string | null = null;

  constructor(
    private readonly policyEvaluator: NotificationPolicyEvaluator,
    private readonly deliveryTarget: NotificationDeliveryTarget,
  ) {}

  /**
   * Start the notification service.
   */
  async start(): Promise<void> {
    this.running = true;
  }

  /**
   * Stop the notification service.
   */
  async stop(): Promise<void> {
    this.running = false;
  }

  /**
   * Health check for service registration.
   */
  async healthCheck(): Promise<{ status: string }> {
    const health = this.getHealth();
    return { status: health.status };
  }

  getHealth(): NotifierHealthStatus {
    return {
      status: this.running ? 'healthy' : 'unhealthy',
      pendingNotifications: this.pendingQueue.length,
      lastDeliveryAt: this.lastDeliveryAt,
    };
  }

  /**
   * Notify about a document change.
   * Suppresses cosmetic changes per policy.
   */
  async notifyDocumentChange(
    changeSummary: ChangeSummary,
    userId: string,
    channel: DeliveryChannel,
    classification: DataClassificationLevel,
  ): Promise<Notification> {
    const policyResult = await this.policyEvaluator.evaluate(
      changeSummary.changeClassification,
      userId,
    );

    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      type: 'doc-change',
      urgency: this.classificationToUrgency(changeSummary.changeClassification),
      title: `Document changed: ${changeSummary.title}`,
      body: changeSummary.overallSummary,
      channel,
      classification,
      metadata: {
        docId: changeSummary.docId,
        changeClassification: changeSummary.changeClassification,
        sectionChanges: changeSummary.sectionChanges.length,
        actionRequired: changeSummary.actionRequired,
      },
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      suppressed: policyResult.suppress,
      suppressionReason: policyResult.suppress ? policyResult.reason : null,
    };

    if (!policyResult.suppress) {
      await this.deliver(notification);
    }

    return notification;
  }

  /**
   * Notify about a new digest.
   */
  async notifyDigest(
    digest: Digest,
    channel: DeliveryChannel,
    classification: DataClassificationLevel,
  ): Promise<Notification> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: digest.userId,
      type: 'digest',
      urgency: 'normal',
      title: `Your ${digest.frequency} org intelligence digest`,
      body: `${digest.entries.length} items (${digest.skippedItems} filtered). Top items require your attention.`,
      channel,
      classification,
      metadata: {
        digestId: digest.id,
        frequency: digest.frequency,
        entryCount: digest.entries.length,
        skippedCount: digest.skippedItems,
      },
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      suppressed: false,
      suppressionReason: null,
    };

    await this.deliver(notification);
    return notification;
  }

  /**
   * Notify about a consistency issue.
   */
  async notifyConsistencyAlert(
    userId: string,
    docTitle: string,
    contradictionCount: number,
    channel: DeliveryChannel,
    classification: DataClassificationLevel,
  ): Promise<Notification> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      type: 'consistency-alert',
      urgency: contradictionCount > 2 ? 'high' : 'normal',
      title: `Consistency issue detected in "${docTitle}"`,
      body: `${contradictionCount} potential contradiction(s) found with related documents.`,
      channel,
      classification,
      metadata: { contradictionCount },
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      suppressed: false,
      suppressionReason: null,
    };

    await this.deliver(notification);
    return notification;
  }

  private async deliver(notification: Notification): Promise<void> {
    const success = await this.deliveryTarget.deliver(notification);
    if (success) {
      notification.deliveredAt = new Date().toISOString();
      this.lastDeliveryAt = notification.deliveredAt;
    } else {
      this.pendingQueue.push(notification);
    }
  }

  private classificationToUrgency(
    changeClass: ChangeClassification,
  ): Notification['urgency'] {
    switch (changeClass) {
      case 'critical':
        return 'critical';
      case 'substantive':
        return 'high';
      case 'minor':
        return 'normal';
      case 'cosmetic':
        return 'low';
    }
  }
}
