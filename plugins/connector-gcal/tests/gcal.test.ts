import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCalReadTools } from '../src/tools/read.js';
import { GCalSyncService } from '../src/services/sync.js';
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

function createMockCalendarEvent(id: string, summary: string, startHour: number, endHour: number) {
  const baseDate = '2026-03-13';
  return {
    id,
    status: 'confirmed',
    htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`,
    summary,
    location: 'Conference Room A',
    start: { dateTime: `${baseDate}T${String(startHour).padStart(2, '0')}:00:00Z` },
    end: { dateTime: `${baseDate}T${String(endHour).padStart(2, '0')}:00:00Z` },
    attendees: [
      { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
      { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'tentative' },
    ],
    organizer: { email: 'alice@example.com', displayName: 'Alice' },
    creator: { email: 'alice@example.com', displayName: 'Alice' },
    created: '2026-03-10T08:00:00Z',
    updated: '2026-03-12T10:00:00Z',
    visibility: 'default',
  };
}

// --- Tests ---

describe('GCalReadTools', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
  });

  describe('calendar_read', () => {
    it('evaluates policy before reading events', async () => {
      const mockEvent = createMockCalendarEvent('evt-1', 'Team Standup', 9, 10);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [mockEvent], summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      await tools.calendarRead({});

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'calendar_read',
        }),
      );
    });

    it('returns denied result when policy denies', async () => {
      gateway = createMockGateway({
        'policy.evaluate': vi.fn().mockResolvedValue({
          decision: 'deny',
          policyApplied: 'restrict-calendar',
          reason: 'User not authorized for calendar access',
          constraints: {},
        }),
      });

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.calendarRead({});

      expect(result.items).toHaveLength(0);
      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('Denied by policy');
    });

    it('extracts structured event data', async () => {
      const mockEvent = createMockCalendarEvent('evt-1', 'Product Review', 14, 15);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [mockEvent], summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.calendarRead({});

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(1);

      const item = result.items[0]!;
      expect(item.title).toBe('Product Review');
      expect(item.source).toBe('gcal');
      expect(item.sourceId).toBe('evt-1');
      expect(item.metadata).toHaveProperty('start');
      expect(item.metadata).toHaveProperty('end');
      expect(item.metadata).toHaveProperty('location', 'Conference Room A');
      expect(item.metadata).toHaveProperty('attendees');
      expect(item.metadata).toHaveProperty('organizer');
    });

    it('classifies each event via policy.classify', async () => {
      const mockEvent = createMockCalendarEvent('evt-1', 'Board Meeting - Confidential', 10, 12);
      gateway = createMockGateway({
        'policy.classify': vi.fn().mockResolvedValue({
          classification: 'confidential',
          assignedBy: 'ai_reclassification',
          originalLevel: 'internal',
          confidence: 0.92,
        }),
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [mockEvent], summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.calendarRead({});

      expect(gateway['policy.classify']).toHaveBeenCalled();
      expect(result.items[0]!.classification).toBe('confidential');
    });

    it('returns empty items for no events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.calendarRead({});

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(0);
    });

    it('logs audit entry after successful read', async () => {
      const mockEvent = createMockCalendarEvent('evt-1', 'Test', 9, 10);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [mockEvent], summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      await tools.calendarRead({});

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

  describe('calendar_search', () => {
    it('includes free/busy blocks in search results', async () => {
      const events = [
        createMockCalendarEvent('evt-1', 'Morning Standup', 9, 10),
        createMockCalendarEvent('evt-2', 'Lunch Meeting', 12, 13),
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: events, summary: 'Primary', timeZone: 'UTC' }),
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'access-token');
      const result = await tools.calendarSearch({ query: 'meeting' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(2);

      // Each item should have freeBusyBlocks in metadata
      const firstItem = result.items[0]!;
      expect(firstItem.metadata).toHaveProperty('freeBusyBlocks');
      const blocks = firstItem.metadata['freeBusyBlocks'] as Array<{ start: string; end: string; status: string }>;
      expect(blocks).toHaveLength(2);
      expect(blocks[0]!.status).toBe('busy');
    });
  });

  describe('OAuth revocation detection', () => {
    it('throws OAuthRevocationError on 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'bad-token');

      await expect(tools.calendarRead({})).rejects.toThrow(OAuthRevocationError);
    });

    it('throws OAuthRevocationError on invalid_grant error', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error('invalid_grant: Token has been revoked'),
      ) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'revoked-token');

      await expect(tools.calendarRead({})).rejects.toThrow(OAuthRevocationError);
    });
  });

  describe('API unavailability', () => {
    it('returns error status on 503', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error('503 Service Unavailable'),
      ) as unknown as typeof fetch;

      const tools = new GCalReadTools(gateway, 'tenant-1', 'user-1', 'token');
      const result = await tools.calendarRead({});

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('gcal API unavailable');
    });
  });
});

describe('GCalSyncService', () => {
  let gateway: GatewayMethods;

  beforeEach(() => {
    gateway = createMockGateway();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it('refreshes OAuth token before syncing', async () => {
    const refreshToken = vi.fn().mockResolvedValue('new-access-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], summary: 'Primary', timeZone: 'UTC' }),
    }) as unknown as typeof fetch;

    const syncService = new GCalSyncService(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
      intervalMs: 60_000,
    });

    await syncService.start();
    expect(refreshToken).toHaveBeenCalled();
    await syncService.stop();
  });

  it('disables connector on OAuth revocation during token refresh', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('invalid_grant: Token revoked'));

    const syncService = new GCalSyncService(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await syncService.start();

    const health = await syncService.healthCheck();
    expect(health.status).toBe('disabled');
    expect(health.detail).toContain('revoked');
  });

  it('reports degraded status on API unavailability', async () => {
    const refreshToken = vi.fn().mockResolvedValue('token');
    global.fetch = vi.fn().mockRejectedValue(
      new Error('503 Service Unavailable'),
    ) as unknown as typeof fetch;

    const syncService = new GCalSyncService(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await syncService.start();

    const health = await syncService.healthCheck();
    expect(health.status).toBe('degraded');

    await syncService.stop();
  });

  it('reports healthy status after successful sync', async () => {
    const refreshToken = vi.fn().mockResolvedValue('token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], summary: 'Primary', timeZone: 'UTC' }),
    }) as unknown as typeof fetch;

    const syncService = new GCalSyncService(gateway, {
      refreshToken,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await syncService.start();

    const health = await syncService.healthCheck();
    expect(health.status).toBe('healthy');

    await syncService.stop();
  });
});
