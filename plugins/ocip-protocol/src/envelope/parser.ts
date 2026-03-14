import type {
  DataClassificationLevel,
  OcipMessageType,
  ReplyPolicy,
} from '@openclaw-enterprise/shared/types.js';
import { CLASSIFICATION_LEVELS } from '@openclaw-enterprise/shared/constants.js';
import type { OcipEnvelope } from './builder.js';

/**
 * Result of parsing an incoming message for OCIP metadata.
 * If `isOcip` is false, the message is treated as human-generated.
 */
export interface ParseResult {
  isOcip: boolean;
  envelope: OcipEnvelope | null;
  parseError: string | null;
}

const VALID_MESSAGE_TYPES: OcipMessageType[] = [
  'agent-generated',
  'agent-assisted',
  'human',
];

const VALID_REPLY_POLICIES: ReplyPolicy[] = [
  'agent-ok',
  'human-only',
  'no-reply-needed',
];

/**
 * Detects and parses OCIP metadata from incoming sessions_send messages.
 * Missing or malformed metadata is treated as a human-generated message
 * (graceful degradation per spec requirement).
 */
export class OcipEnvelopeParser {
  parse(messageContext: Record<string, unknown>): ParseResult {
    const ocipRaw = messageContext['ocip'];

    // No OCIP metadata present — treat as human message
    if (ocipRaw === undefined || ocipRaw === null) {
      return { isOcip: false, envelope: null, parseError: null };
    }

    if (typeof ocipRaw !== 'object' || Array.isArray(ocipRaw)) {
      return {
        isOcip: false,
        envelope: null,
        parseError: 'OCIP metadata is not a valid object',
      };
    }

    const raw = ocipRaw as Record<string, unknown>;

    try {
      const envelope = this.extractEnvelope(raw);
      return { isOcip: true, envelope, parseError: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parse error';
      return { isOcip: false, envelope: null, parseError: message };
    }
  }

  private extractEnvelope(raw: Record<string, unknown>): OcipEnvelope {
    // version
    const version = this.requireString(raw, 'version');

    // message_type
    const messageType = this.requireString(raw, 'message_type') as OcipMessageType;
    if (!VALID_MESSAGE_TYPES.includes(messageType)) {
      throw new Error(`Invalid message_type: ${messageType}`);
    }

    // source_agent
    const sourceAgentRaw = raw['source_agent'];
    if (
      typeof sourceAgentRaw !== 'object' ||
      sourceAgentRaw === null ||
      Array.isArray(sourceAgentRaw)
    ) {
      throw new Error('Missing or invalid source_agent');
    }
    const sourceAgent = sourceAgentRaw as Record<string, unknown>;
    const parsedSourceAgent = {
      instance_id: this.requireString(sourceAgent, 'instance_id'),
      user_id: this.requireString(sourceAgent, 'user_id'),
      org_unit: this.requireString(sourceAgent, 'org_unit'),
      tenant_id: this.requireString(sourceAgent, 'tenant_id'),
    };

    // classification
    const classification = this.requireString(raw, 'classification') as DataClassificationLevel;
    if (!CLASSIFICATION_LEVELS.includes(classification)) {
      throw new Error(`Invalid classification: ${classification}`);
    }

    // conversation_id
    const conversationId = this.requireString(raw, 'conversation_id');

    // exchange_round
    const exchangeRound = this.requireNumber(raw, 'exchange_round');

    // max_rounds
    const maxRounds = this.requireNumber(raw, 'max_rounds');

    // capabilities
    const capabilitiesRaw = raw['capabilities'];
    if (
      typeof capabilitiesRaw !== 'object' ||
      capabilitiesRaw === null ||
      Array.isArray(capabilitiesRaw)
    ) {
      throw new Error('Missing or invalid capabilities');
    }
    const caps = capabilitiesRaw as Record<string, unknown>;
    const canCommit =
      typeof caps['can_commit'] === 'boolean' ? caps['can_commit'] : false;
    const canShareRaw = caps['can_share'];
    const canShare: DataClassificationLevel[] = Array.isArray(canShareRaw)
      ? (canShareRaw as unknown[]).filter(
          (level): level is DataClassificationLevel =>
            typeof level === 'string' &&
            CLASSIFICATION_LEVELS.includes(level as DataClassificationLevel),
        )
      : [];

    // reply_policy
    const replyPolicy = this.requireString(raw, 'reply_policy') as ReplyPolicy;
    if (!VALID_REPLY_POLICIES.includes(replyPolicy)) {
      throw new Error(`Invalid reply_policy: ${replyPolicy}`);
    }

    // requires_commitment
    const requiresCommitment =
      typeof raw['requires_commitment'] === 'boolean'
        ? raw['requires_commitment']
        : false;

    // expires_at
    const expiresAt = this.requireString(raw, 'expires_at');

    return {
      version,
      message_type: messageType,
      source_agent: parsedSourceAgent,
      classification,
      conversation_id: conversationId,
      exchange_round: exchangeRound,
      max_rounds: maxRounds,
      capabilities: {
        can_commit: canCommit,
        can_share: canShare,
      },
      reply_policy: replyPolicy,
      requires_commitment: requiresCommitment,
      expires_at: expiresAt,
    };
  }

  private requireString(obj: Record<string, unknown>, key: string): string {
    const value = obj[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing or invalid field: ${key}`);
    }
    return value;
  }

  private requireNumber(obj: Record<string, unknown>, key: string): number {
    const value = obj[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Missing or invalid field: ${key}`);
    }
    return value;
  }
}
