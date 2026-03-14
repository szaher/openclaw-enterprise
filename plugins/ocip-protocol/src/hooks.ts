import type {
  AgentIdentity,
  DataClassificationLevel,
  ExchangeType,
} from '@openclaw-enterprise/shared/types.js';
import type { HookRegistration } from './openclaw-types.js';
import type { GatewayMethods } from './exchange-log/gateway.js';
import { OcipEnvelopeBuilder } from './envelope/builder.js';
import { OcipEnvelopeParser } from './envelope/parser.js';
import { ClassificationFilter } from './classification/filter.js';
import type { ClassifiableDataItem } from './classification/filter.js';
import { ExchangeRoundCounter } from './loop-prevention/counter.js';
import { CommitmentDetector } from './envelope/commitment.js';
import { CrossOrgPolicyChecker } from './classification/cross-org.js';
import { ExchangeLogger } from './exchange-log/logger.js';
import { ExchangeRoundLimitError } from '@openclaw-enterprise/shared/errors.js';

/**
 * Context passed to sessions_send hooks.
 */
export interface SessionsSendContext {
  direction: 'outgoing' | 'incoming';
  message: Record<string, unknown>;
  ocip?: Record<string, unknown>;
  sessionId: string;
  tenantId: string;
  userId: string;
  data?: ClassifiableDataItem[];
}

/**
 * OCIP hook configuration.
 */
export interface OcipHooksConfig {
  localAgent: AgentIdentity;
  gateway: GatewayMethods;
}

/**
 * OCIP hooks for sessions_send messages.
 *
 * Registers hooks on the OpenClaw sessions_send event to:
 * - Inject OCIP metadata on outgoing messages
 * - Parse OCIP metadata on incoming messages
 * - Enforce classification, loop prevention, commitment, and cross-org policies
 */
export class OcipHooks {
  private readonly builder: OcipEnvelopeBuilder;
  private readonly parser: OcipEnvelopeParser;
  private readonly filter: ClassificationFilter;
  private readonly counter: ExchangeRoundCounter;
  private readonly commitmentDetector: CommitmentDetector;
  private readonly crossOrgChecker: CrossOrgPolicyChecker;
  private readonly logger: ExchangeLogger;
  private readonly localAgent: AgentIdentity;

  constructor(config: OcipHooksConfig) {
    this.builder = new OcipEnvelopeBuilder();
    this.parser = new OcipEnvelopeParser();
    this.filter = new ClassificationFilter();
    this.counter = new ExchangeRoundCounter();
    this.commitmentDetector = new CommitmentDetector();
    this.crossOrgChecker = new CrossOrgPolicyChecker(
      config.gateway['policy.evaluate'].bind(config.gateway),
    );
    this.logger = new ExchangeLogger(config.gateway);
    this.localAgent = config.localAgent;
  }

  /**
   * Hook: sessions_send (outgoing)
   * Injects OCIP metadata into outgoing messages.
   */
  async handleOutgoing(context: SessionsSendContext): Promise<void> {
    const exchangeType = (context.message['exchangeType'] as ExchangeType | undefined) ?? 'information_query';
    const exchangeId = (context.message['exchangeId'] as string | undefined) ?? context.sessionId;
    const conversationId = context.sessionId;
    const classification = (context.message['classification'] as DataClassificationLevel | undefined) ?? 'internal';
    const maxRounds = (context.message['maxRounds'] as number | undefined) ?? undefined;

    // Init or get exchange state
    let state = this.counter.getState(exchangeId);
    if (!state) {
      state = this.counter.initExchange(exchangeId, conversationId, maxRounds);
    }

    // Increment round
    const messageSummary = (context.message['content'] as string | undefined) ?? '';
    try {
      state = this.counter.incrementRound(
        exchangeId,
        this.localAgent.instanceId,
        messageSummary,
      );
    } catch (error) {
      if (error instanceof ExchangeRoundLimitError) {
        const escalation = this.counter.buildEscalation(exchangeId);
        context.message['ocip_escalation'] = escalation;

        await this.logger.logExchange({
          exchangeId,
          conversationId,
          agentId: this.localAgent.instanceId,
          userId: context.userId,
          tenantId: context.tenantId,
          role: 'initiator',
          exchangeType,
          currentRound: state.currentRound,
          maxRounds: state.maxRounds,
          classificationLevel: classification,
          counterpartyAgentId: (context.message['targetAgentId'] as string) ?? 'unknown',
          counterpartyUserId: (context.message['targetUserId'] as string) ?? 'unknown',
          dataShared: [],
          dataWithheld: [],
          policyApplied: 'ocip-loop-prevention',
          outcome: 'escalated',
          escalationReason: escalation.reason,
          transcript: state.transcript as unknown as Record<string, unknown>[],
          channel: 'sessions_send',
        });

        throw error;
      }
      throw error;
    }

    // Build envelope
    const envelope = this.builder.build({
      sourceAgent: this.localAgent,
      conversationId,
      exchangeType,
      exchangeRound: state.currentRound,
      classification,
      maxRounds: state.maxRounds,
    });

    // Apply classification filter on outgoing data
    const dataItems = context.data ?? [];
    const receiverCanShare = (context.message['receiverCanShare'] as DataClassificationLevel[] | undefined) ?? ['public', 'internal'];
    const filterResult = this.filter.filter(dataItems, receiverCanShare, classification);

    // Log withheld data
    if (filterResult.withheld.length > 0) {
      await this.logger.logDataWithheld(
        context.tenantId,
        context.userId,
        exchangeId,
        filterResult.withheld,
        'ocip-classification-filter',
      );
    }

    // Attach envelope to the message
    context.message['ocip'] = envelope;
    context.message['filteredData'] = filterResult.allowed;

    // Log the exchange
    await this.logger.logExchange({
      exchangeId,
      conversationId,
      agentId: this.localAgent.instanceId,
      userId: context.userId,
      tenantId: context.tenantId,
      role: 'initiator',
      exchangeType,
      currentRound: state.currentRound,
      maxRounds: state.maxRounds,
      classificationLevel: classification,
      counterpartyAgentId: (context.message['targetAgentId'] as string) ?? 'unknown',
      counterpartyUserId: (context.message['targetUserId'] as string) ?? 'unknown',
      dataShared: filterResult.allowed.map((item) => ({
        source: item.source,
        fields: item.fields,
      })),
      dataWithheld: filterResult.withheld,
      policyApplied: 'ocip-protocol',
      outcome: 'in_progress',
      escalationReason: null,
      transcript: state.transcript as unknown as Record<string, unknown>[],
      channel: 'sessions_send',
    });
  }

  /**
   * Hook: sessions_send (incoming)
   * Parses OCIP metadata, enforces policies, and logs the exchange.
   */
  async handleIncoming(context: SessionsSendContext): Promise<void> {
    const parseResult = this.parser.parse(context.message);

    // Not an OCIP message — treat as human-generated, no enforcement
    if (!parseResult.isOcip || !parseResult.envelope) {
      return;
    }

    const envelope = parseResult.envelope;
    const exchangeId = (context.message['exchangeId'] as string | undefined) ?? envelope.conversation_id;

    // Cross-org policy check
    const sourceAgent = {
      tenantId: envelope.source_agent.tenant_id,
      orgUnit: envelope.source_agent.org_unit,
    };
    const localAgent = {
      tenantId: this.localAgent.tenantId,
      orgUnit: this.localAgent.orgUnit,
    };

    // This will throw CrossEnterpriseBlockedError if cross-enterprise
    const crossOrgResult = await this.crossOrgChecker.enforce(
      sourceAgent,
      localAgent,
      context.userId,
    );

    if (!crossOrgResult.allowed) {
      await this.logger.logExchange({
        exchangeId,
        conversationId: envelope.conversation_id,
        agentId: this.localAgent.instanceId,
        userId: context.userId,
        tenantId: context.tenantId,
        role: 'responder',
        exchangeType: 'information_query',
        currentRound: envelope.exchange_round,
        maxRounds: envelope.max_rounds,
        classificationLevel: envelope.classification,
        counterpartyAgentId: envelope.source_agent.instance_id,
        counterpartyUserId: envelope.source_agent.user_id,
        dataShared: [],
        dataWithheld: [],
        policyApplied: crossOrgResult.policyApplied,
        outcome: 'denied',
        escalationReason: crossOrgResult.reason,
        transcript: [],
        channel: 'sessions_send',
      });
      return;
    }

    // Loop prevention: track incoming round
    let state = this.counter.getState(exchangeId);
    if (!state) {
      state = this.counter.initExchange(
        exchangeId,
        envelope.conversation_id,
        envelope.max_rounds,
      );
      // Set the current round to match the incoming envelope
      state.currentRound = envelope.exchange_round;
    }

    // Commitment detection
    const messageContent = (context.message['content'] as string | undefined) ?? '';
    const commitResult = this.commitmentDetector.detect(envelope, messageContent);

    if (commitResult.requiresHuman) {
      // Log and throw — the message needs human approval
      this.commitmentDetector.enforceCommitmentPolicy(exchangeId, envelope, messageContent);
    }

    // Log the received exchange
    await this.logger.logExchange({
      exchangeId,
      conversationId: envelope.conversation_id,
      agentId: this.localAgent.instanceId,
      userId: context.userId,
      tenantId: context.tenantId,
      role: 'responder',
      exchangeType: 'information_query',
      currentRound: envelope.exchange_round,
      maxRounds: envelope.max_rounds,
      classificationLevel: envelope.classification,
      counterpartyAgentId: envelope.source_agent.instance_id,
      counterpartyUserId: envelope.source_agent.user_id,
      dataShared: [],
      dataWithheld: [],
      policyApplied: crossOrgResult.policyApplied,
      outcome: 'in_progress',
      escalationReason: null,
      transcript: [],
      channel: 'sessions_send',
    });

    // Attach parsed envelope to context for downstream consumption
    context.ocip = envelope as unknown as Record<string, unknown>;
  }

  /**
   * Returns hook registrations for the plugin.
   */
  getHookRegistrations(): HookRegistration[] {
    return [
      {
        event: 'sessions_send',
        handler: async (context: Record<string, unknown>) => {
          const ctx = context as unknown as SessionsSendContext;
          if (ctx.direction === 'outgoing') {
            await this.handleOutgoing(ctx);
          } else {
            await this.handleIncoming(ctx);
          }
        },
      },
    ];
  }
}
