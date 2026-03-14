import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailReadTools } from '../src/tools/read.js';
import { GmailInboxPoller } from '../src/services/poller.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { OAuthRevocationError } from '@openclaw-enterprise/shared/errors.js';

// --- Helpers ---

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
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-001' }),
    ...overrides,
  };
}

function createMockGmailMessage(id: string, subject: string, from: string) {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ['INBOX'],
    snippet: `Snippet for ${subject}`,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
        { name: 'To', value: 'user@example.com' },
        { name: 'Date', value: 'Thu, 13 Mar 2026 10:00:00 +0000' },
      ],
      mimeType: 'text/plain',
      body: { data: '', size: 0 },
    },
    internalDate: '1773496800000',
  };
}

// --- Tests ---

describe('GmailReadTools', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
  });

  describe('email_read', () => {
    it('evaluates policy before reading email', async () => {
      const mockMessage = createMockGmailMessage('msg-1', 'Test Subject', 'alice@example.com');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessage,
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      await tools.emailRead({ messageId: 'msg-1' });

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'email_read',
        }),
      );
    });

    it('returns denied result when policy denies', async () => {
      gateway = createMockGateway({
        'policy.evaluate': vi.fn().mockResolvedValue({
          decision: 'deny',
          policyApplied: 'restrict-email',
          reason: 'User not authorized for email access',
          constraints: {},
        }),
      });

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.emailRead({ messageId: 'msg-1' });

      expect(result.items).toHaveLength(0);
      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('Denied by policy');
    });

    it('extracts structured data and classifies items', async () => {
      const mockMessage = createMockGmailMessage('msg-1', 'Quarterly Report', 'boss@example.com');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessage,
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.emailRead({ messageId: 'msg-1' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(1);

      const item = result.items[0]!;
      expect(item.title).toBe('Quarterly Report');
      expect(item.source).toBe('gmail');
      expect(item.sourceId).toBe('msg-1');
      expect(item.metadata).toHaveProperty('from', 'boss@example.com');
      expect(item.classification).toBe('internal');
    });

    it('classifies each item via policy.classify', async () => {
      const mockMessage = createMockGmailMessage('msg-1', 'Confidential Info', 'hr@example.com');
      gateway = createMockGateway({
        'policy.classify': vi.fn().mockResolvedValue({
          classification: 'confidential',
          assignedBy: 'ai_reclassification',
          originalLevel: 'internal',
          confidence: 0.95,
        }),
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessage,
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.emailRead({ messageId: 'msg-1' });

      expect(gateway['policy.classify']).toHaveBeenCalled();
      expect(result.items[0]!.classification).toBe('confidential');
    });

    it('logs audit entry after successful read', async () => {
      const mockMessage = createMockGmailMessage('msg-1', 'Test', 'test@example.com');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessage,
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      await tools.emailRead({ messageId: 'msg-1' });

      expect(gateway['audit.log']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          actionType: 'data_access',
          outcome: 'success',
        }),
      );
    });
  });

  describe('email_search', () => {
    it('returns empty results for no matches', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [], resultSizeEstimate: 0 }),
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.emailSearch({ query: 'from:nonexistent' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('OAuth revocation detection', () => {
    it('throws OAuthRevocationError on 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'bad-token');

      await expect(tools.emailRead({ messageId: 'msg-1' })).rejects.toThrow(OAuthRevocationError);
    });

    it('throws OAuthRevocationError on invalid_grant error', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error('invalid_grant: Token has been revoked'),
      ) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'revoked-token');

      await expect(tools.emailRead({ messageId: 'msg-1' })).rejects.toThrow(OAuthRevocationError);
    });
  });

  describe('API unavailability', () => {
    it('returns error status on 503', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error('503 Service Unavailable'),
      ) as unknown as typeof fetch;

      const tools = new GmailReadTools(gateway, 'tenant-1', 'user-1', 'token');
      const result = await tools.emailRead({ messageId: 'msg-1' });

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('gmail API unavailable');
    });
  });
});

describe('GmailInboxPoller', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it('refreshes OAuth token before polling', async () => {
    const refreshToken = vi.fn().mockResolvedValue('new-access-token');

    const mockMessage = createMockGmailMessage('msg-1', 'Test', 'test@example.com');
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-1' }], resultSizeEstimate: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      }) as unknown as typeof fetch;

    const poller = new GmailInboxPoller(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
      intervalMs: 60_000,
    });

    await poller.start();

    // refreshToken called on startup + before first poll
    expect(refreshToken).toHaveBeenCalled();

    await poller.stop();
  });

  it('disables connector on OAuth revocation during token refresh', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('invalid_grant: Token revoked'));

    const poller = new GmailInboxPoller(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await poller.start();

    const health = await poller.healthCheck();
    expect(health.status).toBe('disabled');
    expect(health.detail).toContain('revoked');
  });

  it('reports degraded status on API unavailability', async () => {
    const refreshToken = vi.fn().mockResolvedValue('token');
    global.fetch = vi.fn().mockRejectedValue(
      new Error('503 Service Unavailable'),
    ) as unknown as typeof fetch;

    const poller = new GmailInboxPoller(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await poller.start();

    const health = await poller.healthCheck();
    expect(health.status).toBe('degraded');

    await poller.stop();
  });

  it('reports healthy status after successful poll', async () => {
    const refreshToken = vi.fn().mockResolvedValue('token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], resultSizeEstimate: 0 }),
    }) as unknown as typeof fetch;

    const poller = new GmailInboxPoller(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await poller.start();

    const health = await poller.healthCheck();
    expect(health.status).toBe('healthy');

    await poller.stop();
  });
});
