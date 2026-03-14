import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GDriveReadConnector } from '../src/tools/read.js';
import type { GDriveApiClient, GDriveFileResponse, GDriveSearchResponse } from '../src/tools/read.js';
import { GDriveDocumentPoller } from '../src/services/poller.js';
import type { GDriveChangesApiClient, GDriveChangeEvent } from '../src/services/poller.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared';

// --- Test helpers ---

function createMockGateway(): GatewayMethods {
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
      confidence: 0.9,
    }),
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-001' }),
  };
}

function createMockFile(overrides?: Partial<GDriveFileResponse>): GDriveFileResponse {
  return {
    id: 'file-123',
    name: 'Test Document',
    mimeType: 'application/vnd.google-apps.document',
    webViewLink: 'https://docs.google.com/document/d/file-123/edit',
    modifiedTime: '2026-03-10T12:00:00Z',
    exportedContent: 'This is the content of the test document with important information.',
    owners: [{ displayName: 'Alice', emailAddress: 'alice@example.com' }],
    lastModifyingUser: { displayName: 'Bob', emailAddress: 'bob@example.com' },
    size: '1024',
    ...overrides,
  };
}

function createMockApiClient(overrides?: Partial<GDriveApiClient>): GDriveApiClient {
  return {
    getFile: vi.fn().mockResolvedValue(createMockFile()),
    searchFiles: vi.fn().mockResolvedValue({
      files: [createMockFile(), createMockFile({ id: 'file-456', name: 'Second Doc' })],
    } satisfies GDriveSearchResponse),
    ...overrides,
  };
}

function createMockChangesApiClient(overrides?: Partial<GDriveChangesApiClient>): GDriveChangesApiClient {
  return {
    getStartPageToken: vi.fn().mockResolvedValue('page-token-1'),
    listChanges: vi.fn().mockResolvedValue({
      changes: [],
      newStartPageToken: 'page-token-2',
    }),
    getRevisions: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue('content'),
    ...overrides,
  };
}

// --- gdrive_read tests ---

describe('GDriveReadConnector', () => {
  let gateway: GatewayMethods;
  let apiClient: GDriveApiClient;
  let connector: GDriveReadConnector;

  beforeEach(() => {
    gateway = createMockGateway();
    apiClient = createMockApiClient();
    connector = new GDriveReadConnector(gateway, 'tenant-1', 'user-1', apiClient);
  });

  describe('gdrive_read', () => {
    it('should fetch a document by ID and return structured result', async () => {
      const result = await connector.read({ fileId: 'file-123' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Test Document');
      expect(result.items[0]!.sourceId).toBe('file-123');
      expect(result.items[0]!.source).toBe('gdrive');
      expect(result.items[0]!.url).toBe('https://docs.google.com/document/d/file-123/edit');
      expect(result.items[0]!.metadata['mimeType']).toBe('application/vnd.google-apps.document');
    });

    it('should call policy.evaluate before accessing data', async () => {
      await connector.read({ fileId: 'file-123' });

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'gdrive_read',
        }),
      );
    });

    it('should call policy.classify for each returned item', async () => {
      await connector.read({ fileId: 'file-123' });

      expect(gateway['policy.classify']).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorType: 'gdrive',
          sourceId: 'file-123',
        }),
      );
    });

    it('should create an audit log entry', async () => {
      await connector.read({ fileId: 'file-123' });

      expect(gateway['audit.log']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          actionType: 'data_access',
          outcome: 'success',
        }),
      );
    });

    it('should return denied result when policy denies access', async () => {
      (gateway['policy.evaluate'] as ReturnType<typeof vi.fn>).mockResolvedValue({
        decision: 'deny',
        policyApplied: 'restricted-policy',
        reason: 'User lacks gdrive access',
        constraints: {},
      });

      const result = await connector.read({ fileId: 'file-123' });

      expect(result.connectorStatus).toBe('error');
      expect(result.items).toHaveLength(0);
      expect(result.errorDetail).toContain('Denied by policy');
    });

    it('should not call the API when policy denies access', async () => {
      (gateway['policy.evaluate'] as ReturnType<typeof vi.fn>).mockResolvedValue({
        decision: 'deny',
        policyApplied: 'restricted-policy',
        reason: 'Denied',
        constraints: {},
      });

      await connector.read({ fileId: 'file-123' });

      expect(apiClient.getFile).not.toHaveBeenCalled();
    });

    it('should handle empty document content gracefully', async () => {
      (apiClient.getFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFile({ exportedContent: '' }),
      );

      const result = await connector.read({ fileId: 'file-123' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items[0]!.summary).toContain('no extractable text content');
    });

    it('should truncate long document content in summary', async () => {
      const longContent = 'A'.repeat(1000);
      (apiClient.getFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockFile({ exportedContent: longContent }),
      );

      const result = await connector.read({ fileId: 'file-123' });

      expect(result.items[0]!.summary.length).toBeLessThanOrEqual(503); // 500 + "..."
    });

    it('should handle OAuth revocation errors', async () => {
      (apiClient.getFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('401 Unauthorized: token revoked'),
      );

      await expect(connector.read({ fileId: 'file-123' })).rejects.toThrow('OAuth access revoked');
    });

    it('should return error status for API unavailability', async () => {
      (apiClient.getFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('503 Service Unavailable'),
      );

      const result = await connector.read({ fileId: 'file-123' });

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('API unavailable');
    });
  });

  describe('gdrive_search', () => {
    it('should search documents and return structured results', async () => {
      const result = await connector.search({ query: 'project plan' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.title).toBe('Test Document');
      expect(result.items[1]!.title).toBe('Second Doc');
    });

    it('should pass maxResults to the API client', async () => {
      await connector.search({ query: 'test', maxResults: 5 });

      expect(apiClient.searchFiles).toHaveBeenCalledWith('test', 5);
    });

    it('should use default maxResults of 10', async () => {
      await connector.search({ query: 'test' });

      expect(apiClient.searchFiles).toHaveBeenCalledWith('test', 10);
    });

    it('should call policy.evaluate with gdrive_search action', async () => {
      await connector.search({ query: 'test' });

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'gdrive_search',
        }),
      );
    });

    it('should classify each search result item', async () => {
      await connector.search({ query: 'test' });

      expect(gateway['policy.classify']).toHaveBeenCalledTimes(2);
    });

    it('should return empty results when search finds nothing', async () => {
      (apiClient.searchFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        files: [],
      } satisfies GDriveSearchResponse);

      const result = await connector.search({ query: 'nonexistent' });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(0);
    });
  });
});

// --- Poller tests ---

describe('GDriveDocumentPoller', () => {
  let changesClient: GDriveChangesApiClient;
  let onChangeEvent: ReturnType<typeof vi.fn>;
  let poller: GDriveDocumentPoller;

  beforeEach(() => {
    vi.useFakeTimers();
    changesClient = createMockChangesApiClient();
    onChangeEvent = vi.fn();
    poller = new GDriveDocumentPoller({
      tenantId: 'tenant-1',
      userId: 'user-1',
      apiClient: changesClient,
      onChangeEvent,
      pollIntervalMs: 1000, // 1 second for tests
    });
  });

  afterEach(async () => {
    await poller.stop();
    vi.useRealTimers();
  });

  it('should start and obtain initial page token', async () => {
    await poller.start();

    expect(changesClient.getStartPageToken).toHaveBeenCalled();
    const health = await poller.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('should report stopped status before start', async () => {
    const health = await poller.healthCheck();
    expect(health.status).toBe('stopped');
  });

  it('should detect document modifications', async () => {
    (changesClient.listChanges as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      changes: [
        {
          fileId: 'file-123',
          file: {
            id: 'file-123',
            name: 'Changed Doc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-10T13:00:00Z',
            version: '2',
            webViewLink: 'https://docs.google.com/document/d/file-123/edit',
            lastModifyingUser: { displayName: 'Alice', emailAddress: 'alice@example.com' },
          },
          removed: false,
          time: '2026-03-10T13:00:00Z',
        },
      ],
      newStartPageToken: 'page-token-3',
    });

    await poller.start();
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-123',
        fileName: 'Changed Doc',
        changeType: 'created', // first time seeing this file
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    );
  });

  it('should detect document deletions', async () => {
    (changesClient.listChanges as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      changes: [
        {
          fileId: 'file-999',
          file: null,
          removed: true,
          time: '2026-03-10T14:00:00Z',
        },
      ],
      newStartPageToken: 'page-token-4',
    });

    await poller.start();
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-999',
        changeType: 'deleted',
      }),
    );
  });

  it('should handle OAuth revocation and stop polling', async () => {
    (changesClient.listChanges as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('401 Unauthorized: invalid_grant'),
    );

    await poller.start();
    await vi.advanceTimersByTimeAsync(1500);

    const health = await poller.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(health.detail).toContain('OAuth access revoked');
  });

  it('should handle transient API errors without stopping', async () => {
    (changesClient.listChanges as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({
        changes: [],
        newStartPageToken: 'page-token-5',
      });

    await poller.start();
    await vi.advanceTimersByTimeAsync(1500);

    // Should still be running after transient error
    const health = await poller.healthCheck();
    // Poller stays running for transient errors
    expect(health.status).toBe('healthy');
  });

  it('should classify changes by comparing revision content', async () => {
    // First poll: establish baseline
    (changesClient.listChanges as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      changes: [
        {
          fileId: 'file-abc',
          file: {
            id: 'file-abc',
            name: 'Evolving Doc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-10T12:00:00Z',
            version: '1',
            webViewLink: 'https://docs.google.com/document/d/file-abc/edit',
          },
          removed: false,
          time: '2026-03-10T12:00:00Z',
        },
      ],
      newStartPageToken: 'page-token-6',
    });

    // Second poll: file modified
    (changesClient.listChanges as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      changes: [
        {
          fileId: 'file-abc',
          file: {
            id: 'file-abc',
            name: 'Evolving Doc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-10T13:00:00Z',
            version: '2',
            webViewLink: 'https://docs.google.com/document/d/file-abc/edit',
          },
          removed: false,
          time: '2026-03-10T13:00:00Z',
        },
      ],
      newStartPageToken: 'page-token-7',
    });

    // Setup revision content comparison: small change = cosmetic
    const originalContent = 'A'.repeat(1000);
    const modifiedContent = 'A'.repeat(1005);
    (changesClient.getFileContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(originalContent) // previous revision
      .mockResolvedValueOnce(modifiedContent); // current revision

    await poller.start();

    // First poll: creates baseline
    await vi.advanceTimersByTimeAsync(1500);
    expect(onChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'created' }),
    );

    // Second poll: detects modification
    await vi.advanceTimersByTimeAsync(1500);
    expect(onChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'modified',
        changeClassification: 'cosmetic', // < 1% change
      }),
    );
  });

  it('should provide a valid ServiceRegistration', () => {
    const registration = poller.getServiceRegistration();

    expect(registration.name).toBe('gdrive-document-poller');
    expect(typeof registration.start).toBe('function');
    expect(typeof registration.stop).toBe('function');
    expect(typeof registration.healthCheck).toBe('function');
  });

  it('should stop cleanly', async () => {
    await poller.start();
    await poller.stop();

    const health = await poller.healthCheck();
    expect(health.status).toBe('stopped');
  });
});
