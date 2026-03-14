import { ExchangeRoundLimitError } from '@openclaw-enterprise/shared/errors.js';
import { OCIP_DEFAULT_MAX_ROUNDS } from '@openclaw-enterprise/shared/constants.js';

/**
 * Tracks the state of an exchange conversation for loop prevention.
 */
export interface ExchangeState {
  exchangeId: string;
  conversationId: string;
  currentRound: number;
  maxRounds: number;
  transcript: Array<{ round: number; sender: string; summary: string }>;
}

/**
 * Escalation payload sent to humans when round limit is reached.
 */
export interface EscalationPayload {
  exchangeId: string;
  conversationId: string;
  currentRound: number;
  maxRounds: number;
  conversationSummary: string;
  reason: string;
}

/**
 * Tracks exchange_round per conversation, increments per message,
 * and escalates to humans when the round limit is exceeded.
 *
 * Per ocip-protocol.md:
 * - exchange_round incremented on every message in a conversation
 * - When exchange_round > max_rounds: exchange MUST escalate to humans
 * - No mechanism to extend max_rounds within an exchange
 * - Escalation message includes conversation summary for human context
 */
export class ExchangeRoundCounter {
  private readonly exchanges = new Map<string, ExchangeState>();

  /**
   * Initialize tracking for a new exchange.
   */
  initExchange(
    exchangeId: string,
    conversationId: string,
    maxRounds?: number,
  ): ExchangeState {
    const state: ExchangeState = {
      exchangeId,
      conversationId,
      currentRound: 0,
      maxRounds: maxRounds ?? OCIP_DEFAULT_MAX_ROUNDS,
      transcript: [],
    };
    this.exchanges.set(exchangeId, state);
    return state;
  }

  /**
   * Increment the round counter for an exchange and check the limit.
   * Throws ExchangeRoundLimitError if the limit is exceeded.
   *
   * @returns The updated exchange state
   * @throws ExchangeRoundLimitError if currentRound exceeds maxRounds
   */
  incrementRound(
    exchangeId: string,
    sender: string,
    messageSummary: string,
  ): ExchangeState {
    const state = this.exchanges.get(exchangeId);
    if (!state) {
      throw new Error(`Exchange "${exchangeId}" not found. Call initExchange first.`);
    }

    state.currentRound += 1;
    state.transcript.push({
      round: state.currentRound,
      sender,
      summary: messageSummary,
    });

    if (state.currentRound > state.maxRounds) {
      throw new ExchangeRoundLimitError(exchangeId, state.maxRounds);
    }

    return state;
  }

  /**
   * Build the escalation payload for human review when a round limit is reached.
   */
  buildEscalation(exchangeId: string): EscalationPayload {
    const state = this.exchanges.get(exchangeId);
    if (!state) {
      throw new Error(`Exchange "${exchangeId}" not found.`);
    }

    const conversationSummary = state.transcript
      .map((entry) => `Round ${entry.round} (${entry.sender}): ${entry.summary}`)
      .join('\n');

    return {
      exchangeId: state.exchangeId,
      conversationId: state.conversationId,
      currentRound: state.currentRound,
      maxRounds: state.maxRounds,
      conversationSummary,
      reason: `Exchange reached maximum round limit (${state.maxRounds}). Human review required.`,
    };
  }

  /**
   * Get current state for an exchange.
   */
  getState(exchangeId: string): ExchangeState | undefined {
    return this.exchanges.get(exchangeId);
  }

  /**
   * Remove tracking for a completed or expired exchange.
   */
  removeExchange(exchangeId: string): void {
    this.exchanges.delete(exchangeId);
  }
}
