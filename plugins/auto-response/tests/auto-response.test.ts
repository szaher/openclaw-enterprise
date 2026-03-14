import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { AI_DISCLOSURE_LABEL } from '@openclaw-enterprise/shared/constants.js';
import type { MessageClassification } from '@openclaw-enterprise/shared/types.js';
import {
  MessageClassifier,
  DefaultClassificationModel,
} from '../src/classifier/classifier.js';
import type { ClassificationModel } from '../src/classifier/classifier.js';
import { ResponseGenerator } from '../src/responder/responder.js';
import type { ResponseModel } from '../src/responder/responder.js';
import { ApprovalQueue } from '../src/approval/queue.js';
import {
  AutoResponseHook,
  resolveAutonomyLevel,
  DEFAULT_SCOPE_CONFIG,
} from '../src/hooks.js';
import type { AutoResponseScopeConfig } from '../src/hooks.js';
import { AutoResponseSummarizer } from '../src/responder/summary.js';

// --- Mock Gateway ---

function createMockGateway(overrides?: Partial<GatewayMethods>): GatewayMethods {
  return {
    'policy.evaluate': vi.fn().mockResolvedValue({
      decision: 'allow',
      policyApplied: 'test-policy',
      reason: 'Allowed by test',
      constraints: {},
    }),
    'policy.classify': vi.fn().mockResolvedValue({
      classification: 'internal',
      assignedBy: 'connector_default',
      originalLevel: null,
      confidence: 1.0,
    }),
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-1' }),
    ...overrides,
  };
}

// --- Mock Classification Model ---

function createMockClassificationModel(
  classification: MessageClassification = 'needs-response',
): ClassificationModel {
  return {
    classify: vi.fn().mockResolvedValue({
      classification,
      confidence: 0.90,
      reasoning: 'Mock classification',
    }),
  };
}

// --- Mock Response Model ---

function createMockResponseModel(): ResponseModel {
  return {
    generateResponse: vi.fn().mockResolvedValue({
      responseBody: 'Mock response body',
    }),
  };
}

// --- Classification Tests ---

describe('MessageClassifier', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
  });

  describe('classification accuracy', () => {
    it('classifies urgent messages as critical', async () => {
      const model = new DefaultClassificationModel();
      const classifier = new MessageClassifier(gateway, model);

      const result = await classifier.classify({
        messageId: 'msg-1',
        channel: 'email',
        sender: 'boss@company.com',
        subject: 'URGENT: Production is down',
        body: 'This is urgent — production servers are not responding.',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.classification).toBe('critical');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('classifies questions as needs-response', async () => {
      const model = new DefaultClassificationModel();
      const classifier = new MessageClassifier(gateway, model);

      const result = await classifier.classify({
        messageId: 'msg-2',
        channel: 'slack',
        sender: 'colleague@company.com',
        subject: 'Quick question',
        body: 'Can you send me the latest report?',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.classification).toBe('needs-response');
    });

    it('classifies FYI messages as informational', async () => {
      const model = new DefaultClassificationModel();
      const classifier = new MessageClassifier(gateway, model);

      const result = await classifier.classify({
        messageId: 'msg-3',
        channel: 'email',
        sender: 'team@company.com',
        subject: 'Team update',
        body: 'FYI — the new release is deployed. No action needed.',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.classification).toBe('informational');
    });

    it('classifies automated notifications as noise', async () => {
      const model = new DefaultClassificationModel();
      const classifier = new MessageClassifier(gateway, model);

      const result = await classifier.classify({
        messageId: 'msg-4',
        channel: 'email',
        sender: 'noreply@service.com',
        subject: 'Automated notification',
        body: 'This is an automated notification. Do not reply.',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.classification).toBe('noise');
    });
  });

  it('logs classification to audit', async () => {
    const model = createMockClassificationModel('critical');
    const classifier = new MessageClassifier(gateway, model);

    await classifier.classify({
      messageId: 'msg-5',
      channel: 'email',
      sender: 'test@example.com',
      subject: 'Test',
      body: 'Test body',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actionType: 'model_call',
        actionDetail: expect.objectContaining({
          tool: 'auto-response.classify',
          messageId: 'msg-5',
          classification: 'critical',
        }),
      }),
    );
  });
});

// --- Response Generator Tests ---

describe('ResponseGenerator', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
  });

  it('injects AI disclosure label into response', async () => {
    const model = createMockResponseModel();
    const generator = new ResponseGenerator(gateway, model);

    const result = await generator.generate({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'test@example.com',
      subject: 'Hello',
      body: 'Can you help?',
      classification: 'needs-response',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.responseBody).toContain(AI_DISCLOSURE_LABEL);
    expect(result.disclosureLabel).toBe(AI_DISCLOSURE_LABEL);
  });

  it('returns autonomous level when policy allows', async () => {
    const model = createMockResponseModel();
    const generator = new ResponseGenerator(gateway, model);

    const result = await generator.generate({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'test@example.com',
      subject: 'Hello',
      body: 'Can you help?',
      classification: 'needs-response',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.autonomyLevel).toBe('autonomous');
  });

  it('returns approve level when policy requires approval', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'require_approval',
        policyApplied: 'enterprise-policy',
        reason: 'Auto-response requires approval',
        constraints: {},
      }),
    });

    const model = createMockResponseModel();
    const generator = new ResponseGenerator(gateway, model);

    const result = await generator.generate({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'test@example.com',
      subject: 'Hello',
      body: 'Can you help?',
      classification: 'needs-response',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.autonomyLevel).toBe('approve');
  });

  it('returns block level when policy denies', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'enterprise-policy',
        reason: 'Auto-response blocked',
        constraints: {},
      }),
    });

    const model = createMockResponseModel();
    const generator = new ResponseGenerator(gateway, model);

    const result = await generator.generate({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'external@example.com',
      subject: 'Hello',
      body: 'Can you help?',
      classification: 'needs-response',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.autonomyLevel).toBe('block');
  });

  it('logs response generation to audit', async () => {
    const model = createMockResponseModel();
    const generator = new ResponseGenerator(gateway, model);

    await generator.generate({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'test@example.com',
      subject: 'Hello',
      body: 'Can you help?',
      classification: 'needs-response',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        actionType: 'tool_invocation',
        actionDetail: expect.objectContaining({
          tool: 'auto-response.generate',
          messageId: 'msg-1',
          autonomyLevel: 'autonomous',
        }),
      }),
    );
  });
});

// --- Approval Queue Tests ---

describe('ApprovalQueue', () => {
  let gateway: GatewayMethods;
  let queue: ApprovalQueue;

  beforeEach(() => {
    gateway = createMockGateway();
    queue = new ApprovalQueue(gateway);
  });

  const createEntry = (overrides?: Record<string, unknown>) => ({
    messageId: 'msg-1',
    channel: 'email',
    sender: 'test@example.com',
    subject: 'Hello',
    originalBody: 'Can you help?',
    responseBody: 'Sure, I can help.\n\n---\nSent by user\'s OpenClaw assistant',
    classification: 'needs-response' as MessageClassification,
    policyApplied: 'test-policy',
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  });

  it('enqueues a pending response and returns an ID', async () => {
    const id = await queue.enqueue(createEntry());

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('lists pending responses for a user', async () => {
    await queue.enqueue(createEntry());
    await queue.enqueue(createEntry({ messageId: 'msg-2' }));
    await queue.enqueue(createEntry({ messageId: 'msg-3', userId: 'user-2' }));

    const pending = queue.listPending('user-1');
    expect(pending).toHaveLength(2);
  });

  it('approves a pending response and removes it from queue', async () => {
    const id = await queue.enqueue(createEntry());

    const result = await queue.approve(id, 'tenant-1', 'user-1');

    expect(result.action).toBe('approved');
    expect(result.responseBody).toContain('Sure, I can help');
    expect(queue.listPending('user-1')).toHaveLength(0);
  });

  it('rejects a pending response and removes it from queue', async () => {
    const id = await queue.enqueue(createEntry());

    const result = await queue.reject(id, 'tenant-1', 'user-1');

    expect(result.action).toBe('rejected');
    expect(queue.listPending('user-1')).toHaveLength(0);
  });

  it('throws when approving a non-existent entry', async () => {
    await expect(queue.approve('nonexistent', 'tenant-1', 'user-1')).rejects.toThrow(
      'not found',
    );
  });

  it('throws when rejecting a non-existent entry', async () => {
    await expect(queue.reject('nonexistent', 'tenant-1', 'user-1')).rejects.toThrow(
      'not found',
    );
  });

  it('logs enqueue to audit as pending_approval', async () => {
    await queue.enqueue(createEntry());

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'pending_approval',
        policyResult: 'require_approval',
      }),
    );
  });

  it('logs approval to audit', async () => {
    const id = await queue.enqueue(createEntry());
    await queue.approve(id, 'tenant-1', 'user-1');

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionDetail: expect.objectContaining({
          tool: 'auto-response.approve',
          queueEntryId: id,
        }),
        policyResult: 'allow',
      }),
    );
  });

  it('logs rejection to audit', async () => {
    const id = await queue.enqueue(createEntry());
    await queue.reject(id, 'tenant-1', 'user-1');

    expect(gateway['audit.log']).toHaveBeenCalledWith(
      expect.objectContaining({
        actionDetail: expect.objectContaining({
          tool: 'auto-response.reject',
          queueEntryId: id,
        }),
        policyResult: 'deny',
      }),
    );
  });

  it('returns correct pending count', async () => {
    await queue.enqueue(createEntry());
    await queue.enqueue(createEntry({ messageId: 'msg-2' }));

    expect(queue.pendingCount('user-1')).toBe(2);
    expect(queue.pendingCount('user-other')).toBe(0);
  });
});

// --- Graduated Autonomy Routing Tests ---

describe('resolveAutonomyLevel', () => {
  const baseConfig: AutoResponseScopeConfig = {
    channelOverrides: { slack: 'autonomous', 'external-email': 'block' },
    contactOverrides: { 'vip@company.com': 'notify', 'spam@example.com': 'block' },
    classificationOverrides: { critical: 'notify', noise: 'autonomous' },
    defaultAutonomy: 'approve',
    disabledChannels: [],
    disabledContacts: [],
  };

  it('uses contact override when sender matches (highest priority)', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'email', 'vip@company.com', 'needs-response', 'autonomous',
    );
    expect(result).toBe('notify');
  });

  it('uses channel override when no contact override', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'slack', 'unknown@example.com', 'needs-response', 'autonomous',
    );
    expect(result).toBe('autonomous');
  });

  it('uses classification override when no contact or channel override', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'email', 'unknown@example.com', 'critical', 'autonomous',
    );
    expect(result).toBe('notify');
  });

  it('uses policy autonomy when no overrides match and policy is not autonomous', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'email', 'unknown@example.com', 'needs-response', 'approve',
    );
    expect(result).toBe('approve');
  });

  it('falls back to default autonomy when policy is autonomous and no overrides', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'email', 'unknown@example.com', 'needs-response', 'autonomous',
    );
    expect(result).toBe('approve');
  });

  it('blocks external email channel', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'external-email', 'someone@outside.com', 'needs-response', 'autonomous',
    );
    expect(result).toBe('block');
  });

  it('contact override takes precedence over channel override', () => {
    const result = resolveAutonomyLevel(
      baseConfig, 'external-email', 'vip@company.com', 'needs-response', 'autonomous',
    );
    // Contact (notify) beats channel (block)
    expect(result).toBe('notify');
  });
});

// --- Auto-Response Hook (End-to-End Pipeline) Tests ---

describe('AutoResponseHook', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
  });

  const createContext = (overrides?: Record<string, unknown>) => ({
    messageId: 'msg-1',
    channel: 'email',
    sender: 'test@example.com',
    subject: 'Test subject',
    body: 'Can you help me with this?',
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  });

  it('classifies and routes a message through the pipeline', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      classificationOverrides: { ...DEFAULT_SCOPE_CONFIG.classificationOverrides },
      defaultAutonomy: 'approve',
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.classification).toBe('needs-response');
    expect(result.action).toBe('queued');
    expect(result.queueEntryId).toBeTruthy();
  });

  it('sends immediately when autonomy is autonomous', async () => {
    const classModel = createMockClassificationModel('noise');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      classificationOverrides: { noise: 'autonomous', critical: 'notify' },
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.classification).toBe('noise');
    expect(result.autonomyLevel).toBe('autonomous');
    expect(result.action).toBe('sent');
    expect(result.responseBody).toContain(AI_DISCLOSURE_LABEL);
  });

  it('notifies when autonomy is notify', async () => {
    const classModel = createMockClassificationModel('critical');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      classificationOverrides: { critical: 'notify', noise: 'autonomous' },
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.classification).toBe('critical');
    expect(result.autonomyLevel).toBe('notify');
    expect(result.action).toBe('notified');
  });

  it('blocks when policy denies', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'block-policy',
        reason: 'Auto-response blocked',
        constraints: {},
      }),
    });

    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      defaultAutonomy: 'autonomous',
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.autonomyLevel).toBe('block');
    expect(result.action).toBe('blocked');
  });

  it('skips disabled channels', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      disabledChannels: ['internal-chat'],
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext({ channel: 'internal-chat' }));

    expect(result.action).toBe('skipped');
  });

  it('skips disabled contacts', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      disabledContacts: ['blocked@example.com'],
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(
      createContext({ sender: 'blocked@example.com' }),
    );

    expect(result.action).toBe('skipped');
  });

  it('per-channel scope: different channels get different autonomy', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      channelOverrides: { slack: 'autonomous', email: 'approve' },
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);

    const slackResult = await hook.processMessage(
      createContext({ messageId: 'msg-slack', channel: 'slack' }),
    );
    expect(slackResult.action).toBe('sent');

    const emailResult = await hook.processMessage(
      createContext({ messageId: 'msg-email', channel: 'email' }),
    );
    expect(emailResult.action).toBe('queued');
  });

  it('per-contact scope: different contacts get different autonomy', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      contactOverrides: {
        'trusted@company.com': 'autonomous',
        'external@outside.com': 'approve',
      },
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);

    const trustedResult = await hook.processMessage(
      createContext({ messageId: 'msg-t', sender: 'trusted@company.com' }),
    );
    expect(trustedResult.action).toBe('sent');

    const externalResult = await hook.processMessage(
      createContext({ messageId: 'msg-e', sender: 'external@outside.com' }),
    );
    expect(externalResult.action).toBe('queued');
  });

  it('AI disclosure label is present in every generated response', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      defaultAutonomy: 'autonomous',
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.responseBody).toBeDefined();
    expect(result.responseBody).toContain(AI_DISCLOSURE_LABEL);
  });

  it('queued responses can be approved from the approval queue', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();
    const scopeConfig: AutoResponseScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      defaultAutonomy: 'approve',
    };

    const hook = new AutoResponseHook(gateway, scopeConfig, classModel, respModel);
    const result = await hook.processMessage(createContext());

    expect(result.action).toBe('queued');
    expect(result.queueEntryId).toBeTruthy();

    const approveResult = await hook.getApprovalQueue().approve(
      result.queueEntryId!,
      'tenant-1',
      'user-1',
    );
    expect(approveResult.action).toBe('approved');
  });

  it('returns a valid hook registration', () => {
    const hook = new AutoResponseHook(gateway);
    const registration = hook.getHookRegistration();

    expect(registration.event).toBe('incoming_message');
    expect(typeof registration.handler).toBe('function');
  });

  it('scope config can be updated dynamically', async () => {
    const classModel = createMockClassificationModel('needs-response');
    const respModel = createMockResponseModel();

    const hook = new AutoResponseHook(
      gateway,
      { ...DEFAULT_SCOPE_CONFIG, defaultAutonomy: 'approve' },
      classModel,
      respModel,
    );

    // Initially queued
    const result1 = await hook.processMessage(createContext({ messageId: 'msg-a' }));
    expect(result1.action).toBe('queued');

    // Update config to autonomous
    hook.updateScopeConfig({
      ...DEFAULT_SCOPE_CONFIG,
      defaultAutonomy: 'autonomous',
    });

    const result2 = await hook.processMessage(createContext({ messageId: 'msg-b' }));
    expect(result2.action).toBe('sent');
  });
});

// --- Briefing Summary Tests ---

describe('AutoResponseSummarizer', () => {
  it('aggregates records since a given timestamp', () => {
    const summarizer = new AutoResponseSummarizer();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 7200_000).toISOString();

    summarizer.addRecord({
      messageId: 'msg-1',
      channel: 'email',
      sender: 'a@example.com',
      subject: 'Urgent',
      classification: 'critical',
      action: 'notified',
      timestamp: oneHourAgo,
    });

    summarizer.addRecord({
      messageId: 'msg-2',
      channel: 'slack',
      sender: 'b@example.com',
      subject: 'FYI',
      classification: 'informational',
      action: 'sent',
      timestamp: oneHourAgo,
    });

    summarizer.addRecord({
      messageId: 'msg-3',
      channel: 'email',
      sender: 'c@example.com',
      subject: 'Question',
      classification: 'needs-response',
      action: 'queued',
      timestamp: oneHourAgo,
    });

    const summary = summarizer.getSummary(twoHoursAgo, 1);

    expect(summary.totalProcessed).toBe(3);
    expect(summary.byClassification.critical).toBe(1);
    expect(summary.byClassification.informational).toBe(1);
    expect(summary.byClassification['needs-response']).toBe(1);
    expect(summary.byClassification.noise).toBe(0);
    expect(summary.byAction['notified']).toBe(1);
    expect(summary.byAction['sent']).toBe(1);
    expect(summary.byAction['queued']).toBe(1);
    expect(summary.byChannel['email']).toBe(2);
    expect(summary.byChannel['slack']).toBe(1);
    expect(summary.criticalMessages).toHaveLength(1);
    expect(summary.criticalMessages[0]!.messageId).toBe('msg-1');
    expect(summary.pendingApprovalCount).toBe(1);
  });

  it('filters out records before the since timestamp', () => {
    const summarizer = new AutoResponseSummarizer();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const threeHoursAgo = new Date(now.getTime() - 10800_000).toISOString();

    summarizer.addRecord({
      messageId: 'msg-old',
      channel: 'email',
      sender: 'old@example.com',
      subject: 'Old',
      classification: 'noise',
      action: 'sent',
      timestamp: threeHoursAgo,
    });

    summarizer.addRecord({
      messageId: 'msg-recent',
      channel: 'email',
      sender: 'recent@example.com',
      subject: 'Recent',
      classification: 'needs-response',
      action: 'queued',
      timestamp: new Date().toISOString(),
    });

    const summary = summarizer.getSummary(oneHourAgo);

    expect(summary.totalProcessed).toBe(1);
    expect(summary.byClassification['needs-response']).toBe(1);
    expect(summary.byClassification.noise).toBe(0);
  });

  it('returns empty summary when no records exist', () => {
    const summarizer = new AutoResponseSummarizer();
    const summary = summarizer.getSummary(new Date().toISOString());

    expect(summary.totalProcessed).toBe(0);
    expect(summary.criticalMessages).toHaveLength(0);
    expect(summary.pendingApprovalCount).toBe(0);
  });
});
