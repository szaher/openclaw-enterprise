import type { ActionAutonomyLevel, MessageClassification } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { HookRegistration } from './openclaw-types.js';
import { MessageClassifier } from './classifier/classifier.js';
import type { ClassificationModel } from './classifier/classifier.js';
import { ResponseGenerator } from './responder/responder.js';
import type { ResponseModel } from './responder/responder.js';
import { ApprovalQueue } from './approval/queue.js';

/**
 * Scope configuration from policy for auto-response behavior.
 * Determines which channels, contacts, and classifications are eligible
 * for auto-response and at what autonomy level.
 */
export interface AutoResponseScopeConfig {
  /** Per-channel autonomy overrides. Key is channel name (e.g., "slack", "email"). */
  channelOverrides: Record<string, ActionAutonomyLevel>;
  /** Per-contact autonomy overrides. Key is sender identifier. */
  contactOverrides: Record<string, ActionAutonomyLevel>;
  /** Per-classification autonomy overrides. */
  classificationOverrides: Partial<Record<MessageClassification, ActionAutonomyLevel>>;
  /** Default autonomy level when no override matches. */
  defaultAutonomy: ActionAutonomyLevel;
  /** Channels where auto-response is completely disabled. */
  disabledChannels: string[];
  /** Contacts where auto-response is completely disabled. */
  disabledContacts: string[];
}

/**
 * Default scope config: require approval for everything.
 */
export const DEFAULT_SCOPE_CONFIG: AutoResponseScopeConfig = {
  channelOverrides: {},
  contactOverrides: {},
  classificationOverrides: {
    critical: 'notify',
    noise: 'autonomous',
  },
  defaultAutonomy: 'approve',
  disabledChannels: [],
  disabledContacts: [],
};

/**
 * Context passed to the incoming message hook.
 */
export interface IncomingMessageContext {
  messageId: string;
  channel: string;
  sender: string;
  subject: string;
  body: string;
  tenantId: string;
  userId: string;
}

/**
 * Result from processing an incoming message through the auto-response pipeline.
 */
export interface AutoResponseResult {
  messageId: string;
  classification: MessageClassification;
  autonomyLevel: ActionAutonomyLevel;
  action: 'sent' | 'queued' | 'notified' | 'blocked' | 'skipped';
  responseBody?: string;
  queueEntryId?: string;
}

/**
 * Resolve the effective autonomy level for a message based on scope configuration.
 * Priority: contact override > channel override > classification override > default.
 */
export function resolveAutonomyLevel(
  scopeConfig: AutoResponseScopeConfig,
  channel: string,
  sender: string,
  classification: MessageClassification,
  policyAutonomy: ActionAutonomyLevel,
): ActionAutonomyLevel {
  // Check contact override first (highest priority)
  const contactOverride = scopeConfig.contactOverrides[sender];
  if (contactOverride !== undefined) {
    return contactOverride;
  }

  // Check channel override
  const channelOverride = scopeConfig.channelOverrides[channel];
  if (channelOverride !== undefined) {
    return channelOverride;
  }

  // Check classification override
  const classOverride = scopeConfig.classificationOverrides[classification];
  if (classOverride !== undefined) {
    return classOverride;
  }

  // Fall back to policy-level autonomy, then default
  if (policyAutonomy !== 'autonomous') {
    return policyAutonomy;
  }

  return scopeConfig.defaultAutonomy;
}

/**
 * AutoResponseHook intercepts incoming messages and routes them through:
 * 1. Classification (critical / needs-response / informational / noise)
 * 2. Policy check (autonomy level determination)
 * 3. Scope configuration resolution (per-channel, per-contact, per-classification)
 * 4. Response generation or approval queue
 *
 * FR-020: Supports per-channel, per-contact, and per-classification scope.
 */
export class AutoResponseHook {
  private readonly classifier: MessageClassifier;
  private readonly responder: ResponseGenerator;
  private readonly approvalQueue: ApprovalQueue;

  constructor(
    private readonly gateway: GatewayMethods,
    private scopeConfig: AutoResponseScopeConfig = DEFAULT_SCOPE_CONFIG,
    classificationModel?: ClassificationModel,
    responseModel?: ResponseModel,
  ) {
    this.classifier = new MessageClassifier(gateway, classificationModel);
    this.responder = new ResponseGenerator(gateway, responseModel);
    this.approvalQueue = new ApprovalQueue(gateway);
  }

  /**
   * Update scope configuration (e.g., from policy hot-reload).
   */
  updateScopeConfig(config: AutoResponseScopeConfig): void {
    this.scopeConfig = config;
  }

  /**
   * Get the approval queue for gateway method exposure.
   */
  getApprovalQueue(): ApprovalQueue {
    return this.approvalQueue;
  }

  /**
   * Process an incoming message through the full auto-response pipeline.
   */
  async processMessage(context: IncomingMessageContext): Promise<AutoResponseResult> {
    // Check if channel or contact is completely disabled
    if (this.scopeConfig.disabledChannels.includes(context.channel)) {
      return {
        messageId: context.messageId,
        classification: 'informational',
        autonomyLevel: 'block',
        action: 'skipped',
      };
    }

    if (this.scopeConfig.disabledContacts.includes(context.sender)) {
      return {
        messageId: context.messageId,
        classification: 'noise',
        autonomyLevel: 'block',
        action: 'skipped',
      };
    }

    // 1. Classify the message
    const classResult = await this.classifier.classify({
      messageId: context.messageId,
      channel: context.channel,
      sender: context.sender,
      subject: context.subject,
      body: context.body,
      tenantId: context.tenantId,
      userId: context.userId,
    });

    // 2. Generate response (also checks policy)
    const responseResult = await this.responder.generate({
      messageId: context.messageId,
      channel: context.channel,
      sender: context.sender,
      subject: context.subject,
      body: context.body,
      classification: classResult.classification,
      tenantId: context.tenantId,
      userId: context.userId,
    });

    // 3. Resolve effective autonomy level from scope config
    const effectiveAutonomy = resolveAutonomyLevel(
      this.scopeConfig,
      context.channel,
      context.sender,
      classResult.classification,
      responseResult.autonomyLevel,
    );

    // 4. Route based on effective autonomy level
    switch (effectiveAutonomy) {
      case 'autonomous': {
        // Send response immediately
        return {
          messageId: context.messageId,
          classification: classResult.classification,
          autonomyLevel: effectiveAutonomy,
          action: 'sent',
          responseBody: responseResult.responseBody,
        };
      }

      case 'notify': {
        // Send response and notify user
        return {
          messageId: context.messageId,
          classification: classResult.classification,
          autonomyLevel: effectiveAutonomy,
          action: 'notified',
          responseBody: responseResult.responseBody,
        };
      }

      case 'approve': {
        // Queue for user approval
        const queueEntryId = await this.approvalQueue.enqueue({
          messageId: context.messageId,
          channel: context.channel,
          sender: context.sender,
          subject: context.subject,
          originalBody: context.body,
          responseBody: responseResult.responseBody,
          classification: classResult.classification,
          policyApplied: responseResult.policyApplied,
          tenantId: context.tenantId,
          userId: context.userId,
        });

        return {
          messageId: context.messageId,
          classification: classResult.classification,
          autonomyLevel: effectiveAutonomy,
          action: 'queued',
          responseBody: responseResult.responseBody,
          queueEntryId,
        };
      }

      case 'block': {
        // Do not send any response
        return {
          messageId: context.messageId,
          classification: classResult.classification,
          autonomyLevel: effectiveAutonomy,
          action: 'blocked',
        };
      }
    }
  }

  /**
   * Returns the hook registration for the plugin.
   */
  getHookRegistration(): HookRegistration {
    return {
      event: 'incoming_message',
      handler: async (context: Record<string, unknown>) => {
        await this.processMessage(context as unknown as IncomingMessageContext);
      },
    };
  }
}
