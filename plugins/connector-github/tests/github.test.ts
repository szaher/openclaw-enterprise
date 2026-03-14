import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubReadTools } from '../src/tools/read.js';
import { GitHubWebhookHandler } from '../src/services/webhook.js';
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
      classification: 'public',
      assignedBy: 'connector_default',
      originalLevel: null,
      confidence: 1.0,
    }),
    'audit.log': vi.fn().mockResolvedValue({ id: 'audit-1' }),
    ...overrides,
  };
}

// --- Mock GitHub API Responses ---

function createMockPRs(count: number = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: 100 + i,
    number: i + 1,
    title: `Fix bug #${i + 1}`,
    body: `This PR fixes bug #${i + 1}`,
    state: 'open',
    html_url: `https://github.com/acme/repo/pull/${i + 1}`,
    user: { login: 'developer' },
    head: { ref: `fix/bug-${i + 1}`, sha: `abc${i}` },
    base: { ref: 'main' },
    labels: [{ name: 'bug' }],
    draft: false,
    merged: false,
    merged_at: null,
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-13T10:00:00Z',
    requested_reviewers: [{ login: 'reviewer1' }],
    repository_url: 'https://api.github.com/repos/acme/repo',
  }));
}

function createMockIssues(count: number = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: 200 + i,
    number: 10 + i,
    title: `Issue ${i + 1}`,
    body: `Description for issue ${i + 1}`,
    state: 'open',
    html_url: `https://github.com/acme/repo/issues/${10 + i}`,
    user: { login: 'reporter' },
    labels: [{ name: 'enhancement' }],
    assignees: [{ login: 'developer' }],
    milestone: { title: 'v1.0', due_on: '2026-04-01T00:00:00Z' },
    created_at: '2026-03-08T10:00:00Z',
    updated_at: '2026-03-13T10:00:00Z',
    repository_url: 'https://api.github.com/repos/acme/repo',
  }));
}

// --- GitHubReadTools Tests ---

describe('GitHubReadTools', () => {
  let gateway: GatewayMethods;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gateway = createMockGateway();
    mockFetch = vi.fn();
  });

  describe('github_pr_read', () => {
    it('fetches PRs and returns structured data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockPRs(2),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      const result = await tools.githubPrRead({});

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.source).toBe('github');
      expect(result.items[0]!.sourceId).toBe('acme/repo/pull/1');
      expect(result.items[0]!.title).toBe('Fix bug #1');
      expect(result.items[0]!.url).toBe('https://github.com/acme/repo/pull/1');
      expect(result.items[0]!.metadata).toMatchObject({
        number: 1,
        state: 'open',
        draft: false,
        merged: false,
        author: 'developer',
      });
    });

    it('calls policy.evaluate before fetching data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockPRs(1),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubPrRead({});

      expect(gateway['policy.evaluate']).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'github_pr_read',
        }),
      );
    });

    it('calls audit.log after successful read', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockPRs(1),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubPrRead({});

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
          reason: 'GitHub access not permitted',
          constraints: {},
        }),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      const result = await tools.githubPrRead({});

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('Denied by policy');
      expect(result.items).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error status when GitHub API is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('503 Service Unavailable'));

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      const result = await tools.githubPrRead({});

      expect(result.connectorStatus).toBe('error');
      expect(result.errorDetail).toContain('github API unavailable');
    });

    it('classifies each returned item', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockPRs(3),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubPrRead({});

      expect(gateway['policy.classify']).toHaveBeenCalledTimes(3);
    });

    it('passes state filter to GitHub API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubPrRead({ state: 'closed' });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('state=closed');
    });
  });

  describe('github_issue_read', () => {
    it('fetches issues and returns structured data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockIssues(2),
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      const result = await tools.githubIssueRead({});

      expect(result.connectorStatus).toBe('ok');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.source).toBe('github');
      expect(result.items[0]!.sourceId).toBe('acme/repo/issues/10');
      expect(result.items[0]!.metadata).toMatchObject({
        number: 10,
        state: 'open',
        author: 'reporter',
        milestone: 'v1.0',
      });
    });

    it('passes assignee and labels filters to GitHub API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubIssueRead({ assignee: 'developer', labels: 'bug,urgent' });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('assignee=developer');
      expect(calledUrl).toContain('labels=bug%2Curgent');
    });

    it('filters out pull requests from issue results', async () => {
      const mixedResults = [
        ...createMockIssues(1),
        {
          ...createMockIssues(1)[0]!,
          number: 99,
          pull_request: { url: 'https://api.github.com/repos/acme/repo/pulls/99' },
        },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mixedResults,
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      const result = await tools.githubIssueRead({});

      // Only the real issue should be returned, not the PR
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata['number']).toBe(10);
    });

    it('respects maxResults parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const tools = new GitHubReadTools(
        gateway, 'tenant-1', 'user-1', 'acme', 'repo', mockFetch,
      );
      await tools.githubIssueRead({ maxResults: 10 });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('per_page=10');
    });
  });
});

// --- GitHubWebhookHandler Tests ---

describe('GitHubWebhookHandler', () => {
  let emitEvent: ReturnType<typeof vi.fn>;
  let handler: GitHubWebhookHandler;

  const basePayload = {
    action: 'opened',
    sender: { login: 'developer' },
    repository: {
      name: 'repo',
      full_name: 'acme/repo',
      owner: { login: 'acme' },
    },
  };

  beforeEach(() => {
    emitEvent = vi.fn();
    handler = new GitHubWebhookHandler(emitEvent);
  });

  describe('parseEvent', () => {
    it('classifies pr_opened events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'opened',
          pull_request: {
            number: 1,
            title: 'Add feature',
            state: 'open',
            merged: false,
            html_url: 'https://github.com/acme/repo/pull/1',
            user: { login: 'developer' },
            head: { ref: 'feature-branch' },
            base: { ref: 'main' },
          },
        },
        'pull_request',
      );

      expect(event.eventType).toBe('pr_opened');
      expect(event.pullRequest).toBeDefined();
      expect(event.pullRequest!.number).toBe(1);
      expect(event.pullRequest!.title).toBe('Add feature');
    });

    it('classifies pr_merged events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'closed',
          pull_request: {
            number: 2,
            title: 'Merged PR',
            state: 'closed',
            merged: true,
            html_url: 'https://github.com/acme/repo/pull/2',
            user: { login: 'developer' },
            head: { ref: 'fix' },
            base: { ref: 'main' },
          },
        },
        'pull_request',
      );

      expect(event.eventType).toBe('pr_merged');
      expect(event.pullRequest!.merged).toBe(true);
    });

    it('classifies pr_closed (not merged) events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'closed',
          pull_request: {
            number: 3,
            title: 'Closed PR',
            state: 'closed',
            merged: false,
            html_url: 'https://github.com/acme/repo/pull/3',
            user: { login: 'developer' },
            head: { ref: 'stale' },
            base: { ref: 'main' },
          },
        },
        'pull_request',
      );

      expect(event.eventType).toBe('pr_closed');
    });

    it('classifies pr_review_requested events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'review_requested',
          pull_request: {
            number: 4,
            title: 'Needs review',
            state: 'open',
            merged: false,
            html_url: 'https://github.com/acme/repo/pull/4',
            user: { login: 'developer' },
            head: { ref: 'review-me' },
            base: { ref: 'main' },
          },
          requested_reviewer: { login: 'reviewer1' },
        },
        'pull_request',
      );

      expect(event.eventType).toBe('pr_review_requested');
      expect(event.reviewRequested).toBeDefined();
      expect(event.reviewRequested!.reviewer).toBe('reviewer1');
    });

    it('classifies issue_opened events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'opened',
          issue: {
            number: 10,
            title: 'Bug report',
            state: 'open',
            html_url: 'https://github.com/acme/repo/issues/10',
            user: { login: 'reporter' },
          },
        },
        'issues',
      );

      expect(event.eventType).toBe('issue_opened');
      expect(event.issue).toBeDefined();
      expect(event.issue!.number).toBe(10);
    });

    it('classifies issue_closed events', () => {
      const event = handler.parseEvent(
        {
          ...basePayload,
          action: 'closed',
          issue: {
            number: 11,
            title: 'Fixed issue',
            state: 'closed',
            html_url: 'https://github.com/acme/repo/issues/11',
            user: { login: 'developer' },
          },
        },
        'issues',
      );

      expect(event.eventType).toBe('issue_closed');
    });

    it('classifies unknown events', () => {
      const event = handler.parseEvent(
        { ...basePayload, action: 'labeled' },
        'some_other_event',
      );

      expect(event.eventType).toBe('unknown');
    });

    it('includes repository info in all events', () => {
      const event = handler.parseEvent(basePayload, 'issues');

      expect(event.repository).toEqual({
        owner: 'acme',
        name: 'repo',
        fullName: 'acme/repo',
      });
      expect(event.sender).toBe('developer');
    });
  });

  describe('handleWebhook', () => {
    it('returns 200 and emits event for valid PR payload', async () => {
      const jsonFn = vi.fn();
      const statusFn = vi.fn().mockReturnValue({ json: jsonFn });

      await handler.handleWebhook(
        {
          body: {
            ...basePayload,
            action: 'opened',
            pull_request: {
              number: 1,
              title: 'New PR',
              state: 'open',
              merged: false,
              html_url: 'https://github.com/acme/repo/pull/1',
              user: { login: 'dev' },
              head: { ref: 'feature' },
              base: { ref: 'main' },
            },
          },
          headers: { 'x-github-event': 'pull_request' },
        },
        { status: statusFn },
      );

      expect(statusFn).toHaveBeenCalledWith(200);
      expect(jsonFn).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, eventType: 'pr_opened' }),
      );
      expect(emitEvent).toHaveBeenCalledWith(
        'connector.github.event',
        expect.objectContaining({ eventType: 'pr_opened' }),
      );
    });

    it('returns 400 for missing x-github-event header', async () => {
      const jsonFn = vi.fn();
      const statusFn = vi.fn().mockReturnValue({ json: jsonFn });

      await handler.handleWebhook(
        {
          body: { ...basePayload },
          headers: {},
        },
        { status: statusFn },
      );

      expect(statusFn).toHaveBeenCalledWith(400);
    });

    it('returns 400 for missing payload', async () => {
      const jsonFn = vi.fn();
      const statusFn = vi.fn().mockReturnValue({ json: jsonFn });

      await handler.handleWebhook(
        { body: {}, headers: { 'x-github-event': 'pull_request' } },
        { status: statusFn },
      );

      expect(statusFn).toHaveBeenCalledWith(400);
    });

    it('registers route on POST /api/v1/webhooks/github', () => {
      const route = handler.getRouteRegistration();

      expect(route.method).toBe('POST');
      expect(route.path).toBe('/api/v1/webhooks/github');
    });
  });
});
