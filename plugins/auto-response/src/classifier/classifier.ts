import type { MessageClassification } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

/**
 * Input for message classification.
 */
export interface ClassifyMessageInput {
  messageId: string;
  channel: string;
  sender: string;
  subject: string;
  body: string;
  tenantId: string;
  userId: string;
}

/**
 * Result of message classification.
 */
export interface ClassifyMessageResult {
  messageId: string;
  classification: MessageClassification;
  confidence: number;
  reasoning: string;
}

/**
 * Model call interface for classification.
 * Abstracted to allow injection of different model providers.
 */
export interface ClassificationModel {
  classify(input: {
    sender: string;
    subject: string;
    body: string;
    channel: string;
  }): Promise<{
    classification: MessageClassification;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * Default model-based classifier.
 * In production, this delegates to the configured LLM via OpenClaw's model API.
 * For testing, inject a mock ClassificationModel.
 */
export class DefaultClassificationModel implements ClassificationModel {
  async classify(input: {
    sender: string;
    subject: string;
    body: string;
    channel: string;
  }): Promise<{
    classification: MessageClassification;
    confidence: number;
    reasoning: string;
  }> {
    // Production implementation would call the model API.
    // This default applies heuristic rules as a fallback.
    const bodyLower = input.body.toLowerCase();
    const subjectLower = input.subject.toLowerCase();

    if (
      bodyLower.includes('urgent') ||
      bodyLower.includes('emergency') ||
      subjectLower.includes('urgent') ||
      subjectLower.includes('critical')
    ) {
      return {
        classification: 'critical',
        confidence: 0.85,
        reasoning: 'Message contains urgency indicators',
      };
    }

    if (
      bodyLower.includes('?') ||
      bodyLower.includes('please respond') ||
      bodyLower.includes('can you') ||
      bodyLower.includes('could you')
    ) {
      return {
        classification: 'needs-response',
        confidence: 0.75,
        reasoning: 'Message contains question or response request',
      };
    }

    if (
      bodyLower.includes('fyi') ||
      bodyLower.includes('no action needed') ||
      bodyLower.includes('for your information')
    ) {
      return {
        classification: 'informational',
        confidence: 0.80,
        reasoning: 'Message is informational with no action required',
      };
    }

    if (
      bodyLower.includes('unsubscribe') ||
      bodyLower.includes('automated notification') ||
      bodyLower.includes('do not reply')
    ) {
      return {
        classification: 'noise',
        confidence: 0.90,
        reasoning: 'Message appears to be automated or bulk notification',
      };
    }

    return {
      classification: 'needs-response',
      confidence: 0.50,
      reasoning: 'Default classification — unable to determine with high confidence',
    };
  }
}

/**
 * MessageClassifier classifies incoming messages into one of four categories:
 * - critical: requires immediate human attention
 * - needs-response: should be responded to (may be auto-responded)
 * - informational: no response needed, but useful context
 * - noise: automated/bulk notifications, can be filtered
 *
 * Classification is logged to the audit system for traceability.
 */
export class MessageClassifier {
  constructor(
    private readonly gateway: GatewayMethods,
    private readonly model: ClassificationModel = new DefaultClassificationModel(),
  ) {}

  /**
   * Classify a single incoming message.
   * Calls the model for classification, then logs the result to audit.
   */
  async classify(input: ClassifyMessageInput): Promise<ClassifyMessageResult> {
    const modelResult = await this.model.classify({
      sender: input.sender,
      subject: input.subject,
      body: input.body,
      channel: input.channel,
    });

    // Log classification to audit
    await this.gateway['audit.log']({
      tenantId: input.tenantId,
      userId: input.userId,
      actionType: 'model_call',
      actionDetail: {
        tool: 'auto-response.classify',
        messageId: input.messageId,
        channel: input.channel,
        sender: input.sender,
        classification: modelResult.classification,
        confidence: modelResult.confidence,
      },
      dataClassification: 'internal',
      policyApplied: 'auto-response-classification',
      policyResult: 'allow',
      policyReason: 'Classification is a read-only operation',
      outcome: 'success',
    });

    return {
      messageId: input.messageId,
      classification: modelResult.classification,
      confidence: modelResult.confidence,
      reasoning: modelResult.reasoning,
    };
  }
}
