import type { ActionAutonomyLevel, MessageClassification } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { AI_DISCLOSURE_LABEL } from '@openclaw-enterprise/shared/constants.js';

/**
 * Input for generating a response.
 */
export interface GenerateResponseInput {
  messageId: string;
  channel: string;
  sender: string;
  subject: string;
  body: string;
  classification: MessageClassification;
  tenantId: string;
  userId: string;
}

/**
 * Generated response with autonomy decision.
 */
export interface GenerateResponseResult {
  messageId: string;
  responseBody: string;
  autonomyLevel: ActionAutonomyLevel;
  policyApplied: string;
  policyReason: string;
  disclosureLabel: string;
}

/**
 * Model interface for response generation.
 * Abstracted for testability.
 */
export interface ResponseModel {
  generateResponse(input: {
    sender: string;
    subject: string;
    body: string;
    classification: MessageClassification;
  }): Promise<{ responseBody: string }>;
}

/**
 * Default model-based response generator.
 * In production, delegates to the configured LLM via OpenClaw's model API.
 */
export class DefaultResponseModel implements ResponseModel {
  async generateResponse(input: {
    sender: string;
    subject: string;
    body: string;
    classification: MessageClassification;
  }): Promise<{ responseBody: string }> {
    // Production implementation would call the model API.
    // Default generates a template-based response.
    switch (input.classification) {
      case 'critical':
        return {
          responseBody: `Thank you for your message regarding "${input.subject}". This has been flagged as critical and the user has been notified for immediate attention.`,
        };
      case 'needs-response':
        return {
          responseBody: `Thank you for your message regarding "${input.subject}". I've noted your request and will follow up shortly.`,
        };
      case 'informational':
        return {
          responseBody: `Thank you for the update regarding "${input.subject}". This has been noted.`,
        };
      case 'noise':
        return {
          responseBody: `Acknowledged: "${input.subject}".`,
        };
    }
  }
}

/**
 * Maps policy decisions to ActionAutonomyLevel.
 */
function mapPolicyDecisionToAutonomy(
  decision: string,
): ActionAutonomyLevel {
  switch (decision) {
    case 'allow':
      return 'autonomous';
    case 'require_approval':
      return 'approve';
    case 'deny':
      return 'block';
    default:
      return 'notify';
  }
}

/**
 * ResponseGenerator generates auto-response drafts and checks policy
 * to determine the autonomy level (autonomous / notify / approve / block).
 *
 * Every generated response includes the AI_DISCLOSURE_LABEL per FR-018.
 */
export class ResponseGenerator {
  constructor(
    private readonly gateway: GatewayMethods,
    private readonly model: ResponseModel = new DefaultResponseModel(),
  ) {}

  /**
   * Generate a response for a classified message.
   * 1. Check policy for autonomy level
   * 2. Generate response body via model
   * 3. Inject AI disclosure label
   * 4. Log to audit
   */
  async generate(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    // 1. Check policy for autonomy level
    const policyResult = await this.gateway['policy.evaluate']({
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'auto-response.send',
      context: {
        dataClassification: 'internal',
        channel: input.channel,
        additional: {
          classification: input.classification,
          sender: input.sender,
          messageId: input.messageId,
        },
      },
    });

    const autonomyLevel = mapPolicyDecisionToAutonomy(policyResult.decision);

    // 2. Generate response body via model (even for blocked — for audit trail)
    const modelResult = await this.model.generateResponse({
      sender: input.sender,
      subject: input.subject,
      body: input.body,
      classification: input.classification,
    });

    // 3. Inject AI disclosure label
    const responseBody = `${modelResult.responseBody}\n\n---\n${AI_DISCLOSURE_LABEL}`;

    // 4. Log to audit
    await this.gateway['audit.log']({
      tenantId: input.tenantId,
      userId: input.userId,
      actionType: 'tool_invocation',
      actionDetail: {
        tool: 'auto-response.generate',
        messageId: input.messageId,
        channel: input.channel,
        classification: input.classification,
        autonomyLevel,
      },
      dataClassification: 'internal',
      policyApplied: policyResult.policyApplied,
      policyResult: policyResult.decision,
      policyReason: policyResult.reason,
      outcome: autonomyLevel === 'block' ? 'denied' : 'success',
    });

    return {
      messageId: input.messageId,
      responseBody,
      autonomyLevel,
      policyApplied: policyResult.policyApplied,
      policyReason: policyResult.reason,
      disclosureLabel: AI_DISCLOSURE_LABEL,
    };
  }
}
