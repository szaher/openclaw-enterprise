import type {
  AgentIdentity,
  DataClassificationLevel,
  ExchangeType,
  OcipMessageType,
  ReplyPolicy,
} from '@openclaw-enterprise/shared/types.js';
import {
  OCIP_PROTOCOL_VERSION,
  OCIP_DEFAULT_MAX_ROUNDS,
} from '@openclaw-enterprise/shared/constants.js';

/**
 * OCIP envelope metadata attached to every outgoing sessions_send message.
 * Conforms to the ocip-protocol.md contract.
 */
export interface OcipEnvelope {
  version: string;
  message_type: OcipMessageType;
  source_agent: {
    instance_id: string;
    user_id: string;
    org_unit: string;
    tenant_id: string;
  };
  classification: DataClassificationLevel;
  conversation_id: string;
  exchange_round: number;
  max_rounds: number;
  capabilities: {
    can_commit: boolean;
    can_share: DataClassificationLevel[];
  };
  reply_policy: ReplyPolicy;
  requires_commitment: boolean;
  expires_at: string;
}

export interface BuildEnvelopeParams {
  sourceAgent: AgentIdentity;
  conversationId: string;
  exchangeType: ExchangeType;
  exchangeRound: number;
  classification: DataClassificationLevel;
  maxRounds?: number;
  expiresAt?: string;
}

/**
 * Builds an OCIP envelope for outgoing agent-to-agent messages.
 *
 * Determines reply_policy and requires_commitment from the exchange type:
 * - information_query: agent-ok, no commitment
 * - commitment_request: agent-ok (for escalation notice), requires commitment
 * - meeting_scheduling: human-only, requires commitment
 */
export class OcipEnvelopeBuilder {
  build(params: BuildEnvelopeParams): OcipEnvelope {
    const {
      sourceAgent,
      conversationId,
      exchangeType,
      exchangeRound,
      classification,
      maxRounds,
      expiresAt,
    } = params;

    const effectiveMaxRounds = maxRounds ?? OCIP_DEFAULT_MAX_ROUNDS;

    const { replyPolicy, requiresCommitment } =
      this.resolveExchangeSemantics(exchangeType);

    const canShareLevels = this.resolveCanShareLevels(
      sourceAgent.maxClassificationShared,
    );

    return {
      version: OCIP_PROTOCOL_VERSION,
      message_type: 'agent-generated',
      source_agent: {
        instance_id: sourceAgent.instanceId,
        user_id: sourceAgent.userId,
        org_unit: sourceAgent.orgUnit,
        tenant_id: sourceAgent.tenantId,
      },
      classification,
      conversation_id: conversationId,
      exchange_round: exchangeRound,
      max_rounds: effectiveMaxRounds,
      capabilities: {
        can_commit: false, // Always false unless human approved
        can_share: canShareLevels,
      },
      reply_policy: replyPolicy,
      requires_commitment: requiresCommitment,
      expires_at:
        expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private resolveExchangeSemantics(exchangeType: ExchangeType): {
    replyPolicy: ReplyPolicy;
    requiresCommitment: boolean;
  } {
    switch (exchangeType) {
      case 'information_query':
        return { replyPolicy: 'agent-ok', requiresCommitment: false };
      case 'commitment_request':
        return { replyPolicy: 'agent-ok', requiresCommitment: true };
      case 'meeting_scheduling':
        return { replyPolicy: 'human-only', requiresCommitment: true };
    }
  }

  /**
   * Returns the list of classification levels the agent can share,
   * from 'public' up to and including maxClassificationShared.
   */
  private resolveCanShareLevels(
    maxLevel: DataClassificationLevel,
  ): DataClassificationLevel[] {
    const allLevels: DataClassificationLevel[] = [
      'public',
      'internal',
      'confidential',
      'restricted',
    ];
    const maxIdx = allLevels.indexOf(maxLevel);
    return allLevels.slice(0, maxIdx + 1);
  }
}
