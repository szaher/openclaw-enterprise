import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraReadTools } from '../src/tools/read.js';
import { JiraWebhookHandler } from '../src/services/webhook.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

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

// --- Mock Jira API Response ---

function createMockJiraResponse(issues: number = 2) {
  const mockIssues = Array.from({ length: issues }, (_, i) => ({
    key: `PROJ-${i + 1}`,
    id: `${10000 + i}`,
    self: `https://jira.example.com/rest/api/3/issue/${10000 + i}`,
    fields: {
      summary: `Test issue ${i + 1}`,
      description: `Description for issue ${i + 1}`,
      status: { name: 'In Progress' },
      priority: { name: 'Medium' },
      assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
      reporter: { displayName: 'Reporter', emailAddress: 'reporter@example.com' },
      issuetype: { name: 'Story' },
      project: { key: 'PROJ', name: 'Test Project' },
      labels: ['backend', 'api'],
      updated: '2026-03-13T10:00:00.000Z',
      created: '2026-03-10T10:00:00.000Z',
      duedate: '2026-03-20',
    },
  }));

  return {
    issues: mockIssues,
    total: issues,
    maxResults: 50,
    startAt: 0,
  };
}

// --- JiraReadTools Tests ---

describe('JiraReadTools', () => {
  let gateway: GatewayMethods;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gateway = createMockGateway();
    mockFetch = vi.fn();
  });

  describe('jira_read', () => {
    it('fetches assigned issues and returns structured data', async () => {
      const mockResponse = createMockJiraResponse(2);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      const result = await tools.jiraRead({});

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.source).toBe('jira');
      expect(result.items[0]!.sourceId).toBe('PROJ-1');
      expect(result.items[0]!.title).toBe('Test issue 1');
      expect(result.items[0]!.url).toBe('https://jira.example.com/browse/PROJ-1');
      expect(result.items[0]!.metadata).toMatchObject({
        issueType: 'Story',
        status: 'In Progress',
        priority: 'Medium',
        project: 'PROJ',
      });
    });

    it('applies status filter to JQL query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(0),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraRead({ statusFilter: 'In Progress' });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('status');
      expect(calledUrl).toContain('In+Progress');
    });

    it('calls policy.evaluate before fetching data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(1),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraRead({});

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'jira_read',
        }),
      );
    });

    it('calls audit.log after successful read', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(1),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraRead({});

      expect(gateway['audit.log']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          actionType: 'data_access',
          outcome: 'success',
        }),
      );
    });

    it('returns denied result when policy denies access', async () => {
      gateway = createMockGateway({
        'policy.evaluate': vi.fn().mockResolvedValue({
          decision: 'deny',
          policyApplied: 'enterprise-policy',
          reason: 'Jira access not permitted',
          constraints: {},
        }),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      const result = await tools.jiraRead({});

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('Denied by policy');
      expect(result.items).toHaveLength(0);
      // Should NOT call fetch when policy denies
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error status when Jira API is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('503 Service Unavailable'));

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      const result = await tools.jiraRead({});

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('jira API unavailable');
    });

    it('classifies each returned item', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(2),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraRead({});

      expect(gateway['policy.classify']).toHaveBeenCalledTimes(2);
    });
  });

  describe('jira_search', () => {
    it('executes JQL search and returns results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(3),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      const result = await tools.jiraSearch({
        jql: 'project = PROJ AND status = "In Progress"',
      });

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(3);
    });

    it('passes JQL to the Jira API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(0),
      });

      const jql = 'project = PROJ AND type = Bug';
      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraSearch({ jql });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain(encodeURIComponent('project = PROJ AND type = Bug'));
    });

    it('respects maxResults parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockJiraResponse(0),
      });

      const tools = new JiraReadTools(
        gateway, 'tenant-1', 'user-1', 'https://jira.example.com', mockFetch,
      );
      await tools.jiraSearch({ jql: 'project = PROJ', maxResults: 10 });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('maxResults=10');
    });
  });
});

// --- JiraWebhookHandler Tests ---

describe('JiraWebhookHandler', () => {
  let emitEvent: ReturnType<typeof vi.fn>;
  let handler: JiraWebhookHandler;

  beforeEach(() => {
    emitEvent = vi.fn();
    handler = new JiraWebhookHandler(emitEvent);
  });

  describe('parseEvent', () => {
    it('classifies issue_created events', () => {
      const event = handler.parseEvent({
        webhookEvent: 'jira:issue_created',
        timestamp: 1710324000000,
        user: { displayName: 'Test User', emailAddress: 'test@example.com' },
        issue: { key: 'PROJ-1', fields: { project: { key: 'PROJ' } } },
      });

      expect(event.eventType).toBe('issue_created');
      expect(event.issueKey).toBe('PROJ-1');
      expect(event.projectKey).toBe('PROJ');
    });

    it('classifies issue_updated with status change', () => {
      const event = handler.parseEvent({
        webhookEvent: 'jira:issue_updated',
        timestamp: 1710324000000,
        user: { displayName: 'Test', emailAddress: 'test@example.com' },
        issue: { key: 'PROJ-2', fields: { project: { key: 'PROJ' } } },
        changelog: {
          items: [
            { field: 'status', fromString: 'To Do', toString: 'In Progress' },
          ],
        },
      });

      expect(event.eventType).toBe('status_changed');
      expect(event.changes).toHaveLength(1);
      expect(event.changes[0]!.field).toBe('status');
      expect(event.changes[0]!.fromValue).toBe('To Do');
      expect(event.changes[0]!.toValue).toBe('In Progress');
    });

    it('classifies issue_updated with assignee change', () => {
      const event = handler.parseEvent({
        webhookEvent: 'jira:issue_updated',
        timestamp: 1710324000000,
        user: { displayName: 'Test', emailAddress: 'test@example.com' },
        issue: { key: 'PROJ-3', fields: { project: { key: 'PROJ' } } },
        changelog: {
          items: [
            { field: 'assignee', fromString: 'User A', toString: 'User B' },
          ],
        },
      });

      expect(event.eventType).toBe('issue_assigned');
    });

    it('classifies comment_created events', () => {
      const event = handler.parseEvent({
        webhookEvent: 'comment_created',
        timestamp: 1710324000000,
        user: { displayName: 'Test', emailAddress: 'test@example.com' },
        issue: { key: 'PROJ-4', fields: { project: { key: 'PROJ' } } },
        comment: {
          id: 'comment-1',
          body: 'This is a comment',
          author: { displayName: 'Commenter' },
        },
      });

      expect(event.eventType).toBe('comment_added');
      expect(event.comment).toBeDefined();
      expect(event.comment!.body).toBe('This is a comment');
      expect(event.comment!.author).toBe('Commenter');
    });

    it('classifies unknown events', () => {
      const event = handler.parseEvent({
        webhookEvent: 'some:unknown_event',
        timestamp: 1710324000000,
      });

      expect(event.eventType).toBe('unknown');
    });
  });

  describe('handleWebhook', () => {
    it('returns 200 and emits event for valid payload', async () => {
      const jsonFn = vi.fn();
      const statusFn = vi.fn().mockReturnValue({ json: jsonFn });

      await handler.handleWebhook(
        {
          body: {
            webhookEvent: 'jira:issue_created',
            timestamp: 1710324000000,
            user: { displayName: 'Test', emailAddress: 'test@example.com' },
            issue: { key: 'PROJ-1', fields: { project: { key: 'PROJ' } } },
          },
          headers: {},
        },
        { status: statusFn },
      );

      expect(statusFn).toHaveBeenCalledWith(200);
      expect(jsonFn).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, eventType: 'issue_created' }),
      );
      expect(emitEvent).toHaveBeenCalledWith(
        'connector.jira.event',
        expect.objectContaining({ eventType: 'issue_created' }),
      );
    });

    it('returns 400 for invalid payload', async () => {
      const jsonFn = vi.fn();
      const statusFn = vi.fn().mockReturnValue({ json: jsonFn });

      await handler.handleWebhook(
        { body: {}, headers: {} },
        { status: statusFn },
      );

      expect(statusFn).toHaveBeenCalledWith(400);
    });

    it('registers route on POST /api/v1/webhooks/jira', () => {
      const route = handler.getRouteRegistration();

      expect(route.method).toBe('POST');
      expect(route.path).toBe('/api/v1/webhooks/jira');
    });
  });
});
