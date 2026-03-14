import type {
  DataClassificationLevel,
  ExchangeOutcome,
  ExchangeType,
} from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from './gateway.js';
import type { WithheldRecord } from '../classification/filter.js';

/**
 * Data shared in an exchange, logged for audit transparency.
 */
export interface DataSharedRecord {
  source: string;
  fields: string[];
}

/**
 * Parameters for logging an exchange event.
 */
export interface ExchangeLogParams {
  exchangeId: string;
  conversationId: string;
  agentId: string;
  userId: string;
  tenantId: string;
  role: 'initiator' | 'responder';
  exchangeType: ExchangeType;
  currentRound: number;
  maxRounds: number;
  classificationLevel: DataClassificationLevel;
  counterpartyAgentId: string;
  counterpartyUserId: string;
  dataShared: DataSharedRecord[];
  dataWithheld: WithheldRecord[];
  policyApplied: string;
  outcome: ExchangeOutcome;
  escalationReason: string | null;
  transcript: Record<string, unknown>[];
  channel: string;
}

/**
 * Dual-sided exchange logger that logs full exchange details
 * on both initiator and responder side.
 *
 * Per ocip-protocol.md audit contract:
 * Both sides of every exchange produce an audit entry with:
 * - Full transcript
 * - Data shared (source, fields)
 * - Data withheld (reason, description)
 * - Policy applied
 * - Outcome (resolved / escalated / denied)
 */
export class ExchangeLogger {
  constructor(private readonly gateway: GatewayMethods) {}

  /**
   * Log an exchange event for audit. Called by both the initiator
   * and responder sides of an exchange.
   */
  async logExchange(params: ExchangeLogParams): Promise<{ id: string }> {
    const auditResult = await this.gateway['audit.log']({
      tenantId: params.tenantId,
      userId: params.userId,
      actionType: 'agent_exchange',
      actionDetail: {
        exchangeId: params.exchangeId,
        conversationId: params.conversationId,
        role: params.role,
        agentId: params.agentId,
        counterpartyAgentId: params.counterpartyAgentId,
        counterpartyUserId: params.counterpartyUserId,
        exchangeType: params.exchangeType,
        currentRound: params.currentRound,
        maxRounds: params.maxRounds,
        channel: params.channel,
      },
      dataAccessed: params.dataShared.map((ds) => ({
        source: ds.source,
        classification: params.classificationLevel,
        purpose: `agent_exchange_${params.role}`,
      })),
      dataClassification: params.classificationLevel,
      policyApplied: params.policyApplied,
      policyResult: params.outcome === 'denied' ? 'deny' : 'allow',
      policyReason: params.escalationReason ?? `Exchange ${params.outcome}`,
      outcome:
        params.outcome === 'denied'
          ? 'denied'
          : params.outcome === 'escalated'
            ? 'pending_approval'
            : 'success',
      // Extended exchange-specific fields
      exchangeDetails: {
        dataShared: params.dataShared,
        dataWithheld: params.dataWithheld,
        transcript: params.transcript,
        outcome: params.outcome,
        escalationReason: params.escalationReason,
      },
    });

    return auditResult;
  }

  /**
   * Log a data_withheld event specifically for transparency when
   * data is filtered out before transmission.
   */
  async logDataWithheld(
    tenantId: string,
    userId: string,
    exchangeId: string,
    withheld: WithheldRecord[],
    policyApplied: string,
  ): Promise<void> {
    if (withheld.length === 0) return;

    await this.gateway['audit.log']({
      tenantId,
      userId,
      actionType: 'agent_exchange',
      actionDetail: {
        exchangeId,
        event: 'data_withheld',
        withheldCount: withheld.length,
        withheldReasons: withheld.map((w) => w.reason),
      },
      dataClassification: 'internal',
      policyApplied,
      policyResult: 'allow',
      policyReason: 'Data withheld per classification policy',
      outcome: 'success',
    });
  }
}

/**
 * Gateway methods required by the exchange logger.
 * Re-exported for convenience.
 */
export type { GatewayMethods };
