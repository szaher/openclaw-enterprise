import type { ExchangeType } from '@openclaw-enterprise/shared/types.js';
import { CommitmentRequiresHumanError } from '@openclaw-enterprise/shared/errors.js';
import type { OcipEnvelope } from './builder.js';

/**
 * Exchange types that always require human approval.
 */
const COMMITMENT_EXCHANGE_TYPES: ExchangeType[] = [
  'commitment_request',
  'meeting_scheduling',
];

/**
 * Keywords in message content that suggest a commitment is being made,
 * even when the exchange type does not explicitly flag it.
 */
const COMMITMENT_KEYWORDS = [
  'schedule',
  'meeting',
  'agree',
  'approve',
  'allocate',
  'assign',
  'reserve',
  'commit',
  'confirm',
  'book',
  'deadline',
  'promise',
  'guarantee',
];

/**
 * Result of commitment detection.
 */
export interface CommitmentDetectionResult {
  requiresHuman: boolean;
  reason: string | null;
  detectedKeywords: string[];
}

/**
 * Detects exchanges that require human approval due to commitment semantics.
 *
 * Per ocip-protocol.md:
 * - Commitment requests MUST always escalate to human for approval
 * - Meeting scheduling requires both humans to approve
 * - Agent MUST NOT auto-respond to commitment requests
 */
export class CommitmentDetector {
  /**
   * Check if an incoming OCIP envelope requires human approval
   * because it involves a commitment.
   *
   * @throws CommitmentRequiresHumanError if the exchange requires commitment
   */
  enforceCommitmentPolicy(
    exchangeId: string,
    envelope: OcipEnvelope,
    messageContent?: string,
  ): void {
    const result = this.detect(envelope, messageContent);
    if (result.requiresHuman) {
      throw new CommitmentRequiresHumanError(exchangeId);
    }
  }

  /**
   * Detect whether an exchange involves a commitment that requires
   * human approval. Does not throw — returns the detection result.
   */
  detect(
    envelope: OcipEnvelope,
    messageContent?: string,
  ): CommitmentDetectionResult {
    // Check the explicit requires_commitment flag
    if (envelope.requires_commitment) {
      return {
        requiresHuman: true,
        reason: 'Exchange explicitly requires commitment (requires_commitment=true)',
        detectedKeywords: [],
      };
    }

    // Check if the reply_policy is human-only
    if (envelope.reply_policy === 'human-only') {
      return {
        requiresHuman: true,
        reason: 'Exchange requires human-only reply (reply_policy=human-only)',
        detectedKeywords: [],
      };
    }

    // Check message content for commitment keywords
    if (messageContent) {
      const detectedKeywords = this.detectCommitmentKeywords(messageContent);
      if (detectedKeywords.length > 0) {
        return {
          requiresHuman: true,
          reason: `Message content contains commitment language: ${detectedKeywords.join(', ')}`,
          detectedKeywords,
        };
      }
    }

    return {
      requiresHuman: false,
      reason: null,
      detectedKeywords: [],
    };
  }

  /**
   * Check if an exchange type inherently requires commitment.
   */
  isCommitmentExchangeType(exchangeType: ExchangeType): boolean {
    return COMMITMENT_EXCHANGE_TYPES.includes(exchangeType);
  }

  private detectCommitmentKeywords(content: string): string[] {
    const lowerContent = content.toLowerCase();
    return COMMITMENT_KEYWORDS.filter((keyword) =>
      lowerContent.includes(keyword),
    );
  }
}
