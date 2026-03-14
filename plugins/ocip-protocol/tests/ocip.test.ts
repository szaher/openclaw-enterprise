import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OcipEnvelopeBuilder } from '../src/envelope/builder.js';
import type { BuildEnvelopeParams, OcipEnvelope } from '../src/envelope/builder.js';
import { OcipEnvelopeParser } from '../src/envelope/parser.js';
import { ClassificationFilter } from '../src/classification/filter.js';
import type { ClassifiableDataItem } from '../src/classification/filter.js';
import { ExchangeRoundCounter } from '../src/loop-prevention/counter.js';
import { CommitmentDetector } from '../src/envelope/commitment.js';
import { CrossOrgPolicyChecker } from '../src/classification/cross-org.js';
import { ExchangeLogger } from '../src/exchange-log/logger.js';
import type { GatewayMethods } from '../src/exchange-log/gateway.js';
import {
  ExchangeRoundLimitError,
  CommitmentRequiresHumanError,
  CrossEnterpriseBlockedError,
} from '@openclaw-enterprise/shared/errors.js';
import { OCIP_PROTOCOL_VERSION, OCIP_DEFAULT_MAX_ROUNDS } from '@openclaw-enterprise/shared/constants.js';
import type { AgentIdentity, DataClassificationLevel, ExchangeType } from '@openclaw-enterprise/shared/types.js';

// --- Helpers ---

function createMockGateway(overrides?: Partial<GatewayMethods>): GatewayMethods {
  return {
    'policy.evaluate': vi.fn().mockResolvedValue({
      decision: 'allow',
      policyApplied: 'test-policy',
      reason: 'Allowed by test',
      constraints: {},
    }),
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-1' }),
    ...overrides,
  };
}

function createMockAgent(overrides?: Partial<AgentIdentity>): AgentIdentity {
  return {
    instanceId: 'agent-001',
    userId: 'user-1',
    tenantId: 'tenant-1',
    orgUnit: 'engineering',
    canReceiveQueries: true,
    canAutoRespond: true,
    canMakeCommitments: false,
    maxClassificationShared: 'internal',
    supportedExchangeTypes: ['information_query', 'commitment_request', 'meeting_scheduling'],
    maxRoundsAccepted: 3,
    ...overrides,
  };
}

function createValidEnvelope(overrides?: Partial<OcipEnvelope>): OcipEnvelope {
  return {
    version: OCIP_PROTOCOL_VERSION,
    message_type: 'agent-generated',
    source_agent: {
      instance_id: 'agent-002',
      user_id: 'user-2',
      org_unit: 'product',
      tenant_id: 'tenant-1',
    },
    classification: 'internal',
    conversation_id: 'conv-123',
    exchange_round: 1,
    max_rounds: OCIP_DEFAULT_MAX_ROUNDS,
    capabilities: {
      can_commit: false,
      can_share: ['public', 'internal'],
    },
    reply_policy: 'agent-ok',
    requires_commitment: false,
    expires_at: '2026-03-14T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// Envelope Builder Tests (T113)
// ============================================================================

describe('OcipEnvelopeBuilder', () => {
  let builder: OcipEnvelopeBuilder;

  beforeEach(() => {
    builder = new OcipEnvelopeBuilder();
  });

  it('builds an envelope with OCIP_PROTOCOL_VERSION', () => {
    const agent = createMockAgent();
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.version).toBe(OCIP_PROTOCOL_VERSION);
  });

  it('uses OCIP_DEFAULT_MAX_ROUNDS when maxRounds is not specified', () => {
    const agent = createMockAgent();
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.max_rounds).toBe(OCIP_DEFAULT_MAX_ROUNDS);
  });

  it('respects custom maxRounds', () => {
    const agent = createMockAgent();
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
      maxRounds: 5,
    });

    expect(envelope.max_rounds).toBe(5);
  });

  it('sets message_type to agent-generated', () => {
    const agent = createMockAgent();
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.message_type).toBe('agent-generated');
  });

  it('populates source_agent from AgentIdentity', () => {
    const agent = createMockAgent({
      instanceId: 'my-agent',
      userId: 'my-user',
      orgUnit: 'my-org',
      tenantId: 'my-tenant',
    });
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.source_agent).toEqual({
      instance_id: 'my-agent',
      user_id: 'my-user',
      org_unit: 'my-org',
      tenant_id: 'my-tenant',
    });
  });

  it('sets can_commit to false (always)', () => {
    const agent = createMockAgent();
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.capabilities.can_commit).toBe(false);
  });

  it('computes can_share levels from maxClassificationShared', () => {
    const agent = createMockAgent({ maxClassificationShared: 'confidential' });
    const envelope = builder.build({
      sourceAgent: agent,
      conversationId: 'conv-1',
      exchangeType: 'information_query',
      exchangeRound: 1,
      classification: 'internal',
    });

    expect(envelope.capabilities.can_share).toEqual([
      'public',
      'internal',
      'confidential',
    ]);
  });

  describe('exchange type semantics', () => {
    it('information_query: agent-ok, no commitment', () => {
      const agent = createMockAgent();
      const envelope = builder.build({
        sourceAgent: agent,
        conversationId: 'conv-1',
        exchangeType: 'information_query',
        exchangeRound: 1,
        classification: 'internal',
      });

      expect(envelope.reply_policy).toBe('agent-ok');
      expect(envelope.requires_commitment).toBe(false);
    });

    it('commitment_request: agent-ok, requires commitment', () => {
      const agent = createMockAgent();
      const envelope = builder.build({
        sourceAgent: agent,
        conversationId: 'conv-1',
        exchangeType: 'commitment_request',
        exchangeRound: 1,
        classification: 'internal',
      });

      expect(envelope.reply_policy).toBe('agent-ok');
      expect(envelope.requires_commitment).toBe(true);
    });

    it('meeting_scheduling: human-only, requires commitment', () => {
      const agent = createMockAgent();
      const envelope = builder.build({
        sourceAgent: agent,
        conversationId: 'conv-1',
        exchangeType: 'meeting_scheduling',
        exchangeRound: 1,
        classification: 'internal',
      });

      expect(envelope.reply_policy).toBe('human-only');
      expect(envelope.requires_commitment).toBe(true);
    });
  });
});

// ============================================================================
// Envelope Parser Tests (T114)
// ============================================================================

describe('OcipEnvelopeParser', () => {
  let parser: OcipEnvelopeParser;

  beforeEach(() => {
    parser = new OcipEnvelopeParser();
  });

  it('parses a valid OCIP envelope', () => {
    const envelope = createValidEnvelope();
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(true);
    expect(result.envelope).not.toBeNull();
    expect(result.envelope!.version).toBe(OCIP_PROTOCOL_VERSION);
    expect(result.envelope!.source_agent.instance_id).toBe('agent-002');
    expect(result.parseError).toBeNull();
  });

  it('treats missing ocip metadata as human message', () => {
    const result = parser.parse({ content: 'Hello, human here!' });

    expect(result.isOcip).toBe(false);
    expect(result.envelope).toBeNull();
    expect(result.parseError).toBeNull();
  });

  it('treats null ocip metadata as human message', () => {
    const result = parser.parse({ ocip: null });

    expect(result.isOcip).toBe(false);
    expect(result.envelope).toBeNull();
  });

  it('returns parse error for non-object ocip metadata', () => {
    const result = parser.parse({ ocip: 'not-an-object' });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('not a valid object');
  });

  it('returns parse error for array ocip metadata', () => {
    const result = parser.parse({ ocip: [1, 2, 3] });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('not a valid object');
  });

  it('returns parse error for missing required fields', () => {
    const result = parser.parse({ ocip: { version: '1.0' } });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).not.toBeNull();
  });

  it('returns parse error for invalid message_type', () => {
    const envelope = createValidEnvelope({ message_type: 'invalid' as never });
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('Invalid message_type');
  });

  it('returns parse error for invalid classification', () => {
    const envelope = createValidEnvelope({ classification: 'top-secret' as never });
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('Invalid classification');
  });

  it('returns parse error for invalid reply_policy', () => {
    const envelope = createValidEnvelope({ reply_policy: 'maybe' as never });
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('Invalid reply_policy');
  });

  it('handles malformed source_agent gracefully', () => {
    const envelope = createValidEnvelope();
    (envelope as Record<string, unknown>)['source_agent'] = 'not-an-object';
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('source_agent');
  });

  it('handles malformed capabilities gracefully', () => {
    const envelope = createValidEnvelope();
    (envelope as Record<string, unknown>)['capabilities'] = null;
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(false);
    expect(result.parseError).toContain('capabilities');
  });

  it('filters invalid can_share levels', () => {
    const envelope = createValidEnvelope();
    envelope.capabilities.can_share = ['public', 'invalid-level' as never, 'internal'];
    const result = parser.parse({ ocip: envelope });

    expect(result.isOcip).toBe(true);
    expect(result.envelope!.capabilities.can_share).toEqual(['public', 'internal']);
  });
});

// ============================================================================
// Classification Filter Tests (T115)
// ============================================================================

describe('ClassificationFilter', () => {
  let filter: ClassificationFilter;

  beforeEach(() => {
    filter = new ClassificationFilter();
  });

  function createItem(
    classification: DataClassificationLevel,
    source: string = 'test-source',
  ): ClassifiableDataItem {
    return {
      source,
      fields: ['field1', 'field2'],
      classification,
      description: `${source} data at ${classification} level`,
    };
  }

  it('allows items within receiver can_share and exchange ceiling', () => {
    const items = [createItem('public'), createItem('internal')];
    const result = filter.filter(items, ['public', 'internal'], 'internal');

    expect(result.allowed).toHaveLength(2);
    expect(result.withheld).toHaveLength(0);
  });

  it('withholds items exceeding exchange classification ceiling', () => {
    const items = [createItem('public'), createItem('confidential')];
    const result = filter.filter(items, ['public', 'internal', 'confidential'], 'internal');

    expect(result.allowed).toHaveLength(1);
    expect(result.withheld).toHaveLength(1);
    expect(result.withheld[0]!.reason).toContain('exceeds exchange ceiling');
  });

  it('withholds items not in receiver can_share', () => {
    const items = [createItem('public'), createItem('internal')];
    const result = filter.filter(items, ['public'], 'internal');

    expect(result.allowed).toHaveLength(1);
    expect(result.withheld).toHaveLength(1);
    expect(result.withheld[0]!.reason).toContain('Receiver cannot accept');
  });

  it('withholds restricted data when exchange is internal', () => {
    const items = [createItem('restricted')];
    const result = filter.filter(items, ['public', 'internal'], 'internal');

    expect(result.allowed).toHaveLength(0);
    expect(result.withheld).toHaveLength(1);
  });

  it('allows everything when exchange and receiver support restricted', () => {
    const items = [
      createItem('public'),
      createItem('internal'),
      createItem('confidential'),
      createItem('restricted'),
    ];
    const result = filter.filter(
      items,
      ['public', 'internal', 'confidential', 'restricted'],
      'restricted',
    );

    expect(result.allowed).toHaveLength(4);
    expect(result.withheld).toHaveLength(0);
  });

  it('returns empty arrays for empty input', () => {
    const result = filter.filter([], ['public', 'internal'], 'internal');

    expect(result.allowed).toHaveLength(0);
    expect(result.withheld).toHaveLength(0);
  });

  it('includes source and description in withheld records', () => {
    const items = [createItem('confidential', 'jira')];
    const result = filter.filter(items, ['public'], 'public');

    expect(result.withheld[0]!.description).toContain('jira');
  });
});

// ============================================================================
// Loop Prevention Tests (T116)
// ============================================================================

describe('ExchangeRoundCounter', () => {
  let counter: ExchangeRoundCounter;

  beforeEach(() => {
    counter = new ExchangeRoundCounter();
  });

  it('initializes an exchange with round 0', () => {
    const state = counter.initExchange('ex-1', 'conv-1');

    expect(state.currentRound).toBe(0);
    expect(state.maxRounds).toBe(OCIP_DEFAULT_MAX_ROUNDS);
    expect(state.transcript).toHaveLength(0);
  });

  it('initializes with custom maxRounds', () => {
    const state = counter.initExchange('ex-1', 'conv-1', 5);

    expect(state.maxRounds).toBe(5);
  });

  it('increments round and adds to transcript', () => {
    counter.initExchange('ex-1', 'conv-1', 3);
    const state = counter.incrementRound('ex-1', 'agent-1', 'Asked about status');

    expect(state.currentRound).toBe(1);
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0]!.sender).toBe('agent-1');
    expect(state.transcript[0]!.summary).toBe('Asked about status');
  });

  it('allows rounds up to max_rounds', () => {
    counter.initExchange('ex-1', 'conv-1', 3);
    counter.incrementRound('ex-1', 'agent-1', 'Round 1');
    counter.incrementRound('ex-1', 'agent-2', 'Round 2');
    const state = counter.incrementRound('ex-1', 'agent-1', 'Round 3');

    expect(state.currentRound).toBe(3);
  });

  it('throws ExchangeRoundLimitError when exceeding max_rounds', () => {
    counter.initExchange('ex-1', 'conv-1', 3);
    counter.incrementRound('ex-1', 'agent-1', 'Round 1');
    counter.incrementRound('ex-1', 'agent-2', 'Round 2');
    counter.incrementRound('ex-1', 'agent-1', 'Round 3');

    expect(() => {
      counter.incrementRound('ex-1', 'agent-2', 'Round 4');
    }).toThrow(ExchangeRoundLimitError);
  });

  it('throws when incrementing an unknown exchange', () => {
    expect(() => {
      counter.incrementRound('unknown', 'agent-1', 'msg');
    }).toThrow('not found');
  });

  it('builds escalation with conversation summary', () => {
    counter.initExchange('ex-1', 'conv-1', 2);
    counter.incrementRound('ex-1', 'agent-1', 'Initial query');
    counter.incrementRound('ex-1', 'agent-2', 'Response');

    try {
      counter.incrementRound('ex-1', 'agent-1', 'Follow-up');
    } catch {
      // Expected
    }

    const escalation = counter.buildEscalation('ex-1');

    expect(escalation.exchangeId).toBe('ex-1');
    expect(escalation.conversationSummary).toContain('Round 1 (agent-1): Initial query');
    expect(escalation.conversationSummary).toContain('Round 2 (agent-2): Response');
    expect(escalation.reason).toContain('maximum round limit');
  });

  it('removes exchange tracking', () => {
    counter.initExchange('ex-1', 'conv-1');
    counter.removeExchange('ex-1');

    expect(counter.getState('ex-1')).toBeUndefined();
  });
});

// ============================================================================
// Commitment Detection Tests (T117)
// ============================================================================

describe('CommitmentDetector', () => {
  let detector: CommitmentDetector;

  beforeEach(() => {
    detector = new CommitmentDetector();
  });

  it('detects requires_commitment flag', () => {
    const envelope = createValidEnvelope({ requires_commitment: true });
    const result = detector.detect(envelope);

    expect(result.requiresHuman).toBe(true);
    expect(result.reason).toContain('requires_commitment=true');
  });

  it('detects human-only reply_policy', () => {
    const envelope = createValidEnvelope({ reply_policy: 'human-only' });
    const result = detector.detect(envelope);

    expect(result.requiresHuman).toBe(true);
    expect(result.reason).toContain('human-only');
  });

  it('detects commitment keywords in message content', () => {
    const envelope = createValidEnvelope();
    const result = detector.detect(envelope, 'Can we schedule a meeting for next week?');

    expect(result.requiresHuman).toBe(true);
    expect(result.detectedKeywords).toContain('schedule');
    expect(result.detectedKeywords).toContain('meeting');
  });

  it('does not flag information queries without commitment language', () => {
    const envelope = createValidEnvelope();
    const result = detector.detect(envelope, 'What is the project status?');

    expect(result.requiresHuman).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('throws CommitmentRequiresHumanError on enforce', () => {
    const envelope = createValidEnvelope({ requires_commitment: true });

    expect(() => {
      detector.enforceCommitmentPolicy('ex-1', envelope);
    }).toThrow(CommitmentRequiresHumanError);
  });

  it('does not throw for information queries on enforce', () => {
    const envelope = createValidEnvelope();

    expect(() => {
      detector.enforceCommitmentPolicy('ex-1', envelope, 'What is the status?');
    }).not.toThrow();
  });

  it('identifies commitment exchange types', () => {
    expect(detector.isCommitmentExchangeType('commitment_request')).toBe(true);
    expect(detector.isCommitmentExchangeType('meeting_scheduling')).toBe(true);
    expect(detector.isCommitmentExchangeType('information_query')).toBe(false);
  });

  it('detects resource allocation keywords', () => {
    const envelope = createValidEnvelope();
    const result = detector.detect(envelope, 'Please allocate 3 servers for this project');

    expect(result.requiresHuman).toBe(true);
    expect(result.detectedKeywords).toContain('allocate');
  });
});

// ============================================================================
// Cross-Org Policy Tests (T119)
// ============================================================================

describe('CrossOrgPolicyChecker', () => {
  it('blocks cross-enterprise exchanges unconditionally', async () => {
    const policyEvaluate = vi.fn();
    const checker = new CrossOrgPolicyChecker(policyEvaluate);

    await expect(
      checker.enforce(
        { tenantId: 'tenant-A', orgUnit: 'eng' },
        { tenantId: 'tenant-B', orgUnit: 'eng' },
        'user-1',
      ),
    ).rejects.toThrow(CrossEnterpriseBlockedError);

    // Should not even call policy.evaluate for cross-enterprise
    expect(policyEvaluate).not.toHaveBeenCalled();
  });

  it('allows same org unit without policy check', async () => {
    const policyEvaluate = vi.fn();
    const checker = new CrossOrgPolicyChecker(policyEvaluate);

    const result = await checker.enforce(
      { tenantId: 'tenant-1', orgUnit: 'engineering' },
      { tenantId: 'tenant-1', orgUnit: 'engineering' },
      'user-1',
    );

    expect(result.allowed).toBe(true);
    expect(policyEvaluate).not.toHaveBeenCalled();
  });

  it('checks org-level policy for cross-org within same tenant', async () => {
    const policyEvaluate = vi.fn().mockResolvedValue({
      decision: 'allow',
      policyApplied: 'org-cross-policy',
      reason: 'Cross-org allowed between engineering and product',
      constraints: {},
    });
    const checker = new CrossOrgPolicyChecker(policyEvaluate);

    const result = await checker.enforce(
      { tenantId: 'tenant-1', orgUnit: 'engineering' },
      { tenantId: 'tenant-1', orgUnit: 'product' },
      'user-1',
    );

    expect(result.allowed).toBe(true);
    expect(result.policyApplied).toBe('org-cross-policy');
    expect(policyEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_exchange_cross_org',
      }),
    );
  });

  it('denies cross-org when policy denies', async () => {
    const policyEvaluate = vi.fn().mockResolvedValue({
      decision: 'deny',
      policyApplied: 'org-isolation-policy',
      reason: 'No cross-org exchange between finance and engineering',
      constraints: {},
    });
    const checker = new CrossOrgPolicyChecker(policyEvaluate);

    const result = await checker.enforce(
      { tenantId: 'tenant-1', orgUnit: 'finance' },
      { tenantId: 'tenant-1', orgUnit: 'engineering' },
      'user-1',
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('finance');
  });

  it('static isSameTenant returns correct result', () => {
    expect(
      CrossOrgPolicyChecker.isSameTenant(
        { tenantId: 'a', orgUnit: 'x' },
        { tenantId: 'a', orgUnit: 'y' },
      ),
    ).toBe(true);
    expect(
      CrossOrgPolicyChecker.isSameTenant(
        { tenantId: 'a', orgUnit: 'x' },
        { tenantId: 'b', orgUnit: 'x' },
      ),
    ).toBe(false);
  });

  it('static isSameOrgUnit returns correct result', () => {
    expect(
      CrossOrgPolicyChecker.isSameOrgUnit(
        { tenantId: 'a', orgUnit: 'x' },
        { tenantId: 'a', orgUnit: 'x' },
      ),
    ).toBe(true);
    expect(
      CrossOrgPolicyChecker.isSameOrgUnit(
        { tenantId: 'a', orgUnit: 'x' },
        { tenantId: 'a', orgUnit: 'y' },
      ),
    ).toBe(false);
  });
});

// ============================================================================
// Exchange Logger Tests (T118)
// ============================================================================

describe('ExchangeLogger', () => {
  let gateway: GatewayMethods;
  let logger: ExchangeLogger;

  beforeEach(() => {
    gateway = createMockGateway();
    logger = new ExchangeLogger(gateway);
  });

  it('logs exchange with full details on initiator side', async () => {
    const result = await logger.logExchange({
      exchangeId: 'ex-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'initiator',
      exchangeType: 'information_query',
      currentRound: 1,
      maxRounds: 3,
      classificationLevel: 'internal',
      counterpartyAgentId: 'agent-2',
      counterpartyUserId: 'user-2',
      dataShared: [{ source: 'jira', fields: ['summary', 'status'] }],
      dataWithheld: [{ reason: 'Confidential', description: 'Financial report' }],
      policyApplied: 'ocip-policy',
      outcome: 'in_progress',
      escalationReason: null,
      transcript: [{ round: 1, sender: 'agent-1', content: 'Query' }],
      channel: 'sessions_send',
    });

    expect(result.id).toBe('audit-1');
    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'agent_exchange',
        actionDetail: expect.objectContaining({
          exchangeId: 'ex-1',
          role: 'initiator',
        }),
      }),
    );
  });

  it('logs exchange on responder side', async () => {
    await logger.logExchange({
      exchangeId: 'ex-1',
      conversationId: 'conv-1',
      agentId: 'agent-2',
      userId: 'user-2',
      tenantId: 'tenant-1',
      role: 'responder',
      exchangeType: 'information_query',
      currentRound: 1,
      maxRounds: 3,
      classificationLevel: 'internal',
      counterpartyAgentId: 'agent-1',
      counterpartyUserId: 'user-1',
      dataShared: [],
      dataWithheld: [],
      policyApplied: 'ocip-policy',
      outcome: 'in_progress',
      escalationReason: null,
      transcript: [],
      channel: 'sessions_send',
    });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionDetail: expect.objectContaining({
          role: 'responder',
        }),
      }),
    );
  });

  it('maps denied outcome to deny policy result', async () => {
    await logger.logExchange({
      exchangeId: 'ex-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'initiator',
      exchangeType: 'information_query',
      currentRound: 1,
      maxRounds: 3,
      classificationLevel: 'internal',
      counterpartyAgentId: 'agent-2',
      counterpartyUserId: 'user-2',
      dataShared: [],
      dataWithheld: [],
      policyApplied: 'cross-org-policy',
      outcome: 'denied',
      escalationReason: 'Cross-org blocked',
      transcript: [],
      channel: 'sessions_send',
    });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        policyResult: 'deny',
        outcome: 'denied',
      }),
    );
  });

  it('maps escalated outcome to pending_approval', async () => {
    await logger.logExchange({
      exchangeId: 'ex-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'initiator',
      exchangeType: 'commitment_request',
      currentRound: 1,
      maxRounds: 3,
      classificationLevel: 'internal',
      counterpartyAgentId: 'agent-2',
      counterpartyUserId: 'user-2',
      dataShared: [],
      dataWithheld: [],
      policyApplied: 'commitment-policy',
      outcome: 'escalated',
      escalationReason: 'Commitment requires human approval',
      transcript: [],
      channel: 'sessions_send',
    });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'pending_approval',
      }),
    );
  });

  it('logs data_withheld events for transparency', async () => {
    await logger.logDataWithheld(
      'tenant-1',
      'user-1',
      'ex-1',
      [
        { reason: 'Classification too high', description: 'Financial data' },
        { reason: 'Receiver cannot accept', description: 'HR records' },
      ],
      'classification-policy',
    );

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionDetail: expect.objectContaining({
          event: 'data_withheld',
          withheldCount: 2,
        }),
      }),
    );
  });

  it('skips logging when no data is withheld', async () => {
    await logger.logDataWithheld('tenant-1', 'user-1', 'ex-1', [], 'policy');

    expect(gateway['audit.log']).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Dual-Sided Logging Verification
// ============================================================================

describe('Dual-sided logging verification', () => {
  it('both initiator and responder produce audit entries', async () => {
    const gateway = createMockGateway();
    const logger = new ExchangeLogger(gateway);

    const commonParams = {
      exchangeId: 'ex-dual',
      conversationId: 'conv-dual',
      exchangeType: 'information_query' as ExchangeType,
      currentRound: 1,
      maxRounds: 3,
      classificationLevel: 'internal' as DataClassificationLevel,
      dataShared: [{ source: 'jira', fields: ['summary'] }],
      dataWithheld: [],
      policyApplied: 'ocip-policy',
      outcome: 'in_progress' as const,
      escalationReason: null,
      transcript: [],
      channel: 'sessions_send',
    };

    // Initiator logs
    await logger.logExchange({
      ...commonParams,
      agentId: 'agent-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'initiator',
      counterpartyAgentId: 'agent-2',
      counterpartyUserId: 'user-2',
    });

    // Responder logs
    await logger.logExchange({
      ...commonParams,
      agentId: 'agent-2',
      userId: 'user-2',
      tenantId: 'tenant-1',
      role: 'responder',
      counterpartyAgentId: 'agent-1',
      counterpartyUserId: 'user-1',
    });

    // Both sides should have logged
    expect(gateway['audit.log']).toHaveBeenCalledTimes(2);

    const calls = (gateway['audit.log'] as ReturnType<typeof vi.fn>).mock.calls;

    // First call = initiator
    const initiatorLog = calls[0]![0] as Record<string, unknown>;
    expect((initiatorLog['actionDetail'] as Record<string, unknown>)['role']).toBe('initiator');

    // Second call = responder
    const responderLog = calls[1]![0] as Record<string, unknown>;
    expect((responderLog['actionDetail'] as Record<string, unknown>)['role']).toBe('responder');
  });
});
