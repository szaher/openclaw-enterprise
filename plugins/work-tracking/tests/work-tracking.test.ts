import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTicketKeysFromBranch,
  extractTicketKeysFromDescription,
  extractTicketKeysFromTitle,
  correlatePrToJira,
} from '../src/correlation/pr-jira.js';
import {
  TicketUpdater,
  type JiraWriteOperations,
  type PrMergeDetails,
} from '../src/updater/updater.js';
import { generateStandupSummary } from '../src/standup/generator.js';
import { createWorkTrackingHooks, type ActivityRecord } from '../src/hooks.js';
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

// --- Mock Jira Write Operations ---

function createMockJiraOps(): JiraWriteOperations {
  return {
    jiraComment: vi.fn().mockResolvedValue({
      success: true,
      sourceId: 'PROJ-123/comment/1',
      action: 'jira_comment',
      policyApplied: 'test-policy',
      auditEntryId: 'audit-1',
    }),
    jiraTransition: vi.fn().mockResolvedValue({
      success: true,
      sourceId: 'PROJ-123',
      action: 'jira_transition',
      policyApplied: 'test-policy',
      auditEntryId: 'audit-2',
    }),
  };
}

// --- PR-Jira Correlation Tests ---

describe('PR-Jira Correlation', () => {
  describe('extractTicketKeysFromBranch', () => {
    it('extracts ticket key from feature branch', () => {
      const keys = extractTicketKeysFromBranch('feature/PROJ-123-fix-bug');
      expect(keys).toContain('PROJ-123');
    });

    it('extracts ticket key from bugfix branch', () => {
      const keys = extractTicketKeysFromBranch('bugfix/PROJ-456');
      expect(keys).toContain('PROJ-456');
    });

    it('extracts ticket key from simple branch', () => {
      const keys = extractTicketKeysFromBranch('PROJ-789-some-fix');
      expect(keys).toContain('PROJ-789');
    });

    it('extracts multiple ticket keys from branch', () => {
      const keys = extractTicketKeysFromBranch('fix/PROJ-123-TEAM-456');
      expect(keys).toContain('PROJ-123');
      expect(keys).toContain('TEAM-456');
    });

    it('returns empty array for branch without ticket key', () => {
      const keys = extractTicketKeysFromBranch('feature/add-new-widget');
      expect(keys).toHaveLength(0);
    });

    it('handles branch with underscores', () => {
      const keys = extractTicketKeysFromBranch('feature/PROJ-123_fix_bug');
      expect(keys).toContain('PROJ-123');
    });

    it('does not match single-letter project keys', () => {
      const keys = extractTicketKeysFromBranch('feature/X-123-fix');
      expect(keys).toHaveLength(0);
    });
  });

  describe('extractTicketKeysFromDescription', () => {
    it('extracts ticket key from plain text', () => {
      const keys = extractTicketKeysFromDescription('Fixes PROJ-123');
      expect(keys).toContain('PROJ-123');
    });

    it('extracts multiple ticket keys', () => {
      const keys = extractTicketKeysFromDescription(
        'Addresses PROJ-123 and TEAM-456. Also related to PROJ-789.',
      );
      expect(keys).toContain('PROJ-123');
      expect(keys).toContain('TEAM-456');
      expect(keys).toContain('PROJ-789');
    });

    it('extracts from markdown', () => {
      const keys = extractTicketKeysFromDescription(
        '## Changes\n- Fix [PROJ-123](https://jira.example.com/browse/PROJ-123)\n- Close TEAM-456',
      );
      expect(keys).toContain('PROJ-123');
      expect(keys).toContain('TEAM-456');
    });

    it('returns empty for description without tickets', () => {
      const keys = extractTicketKeysFromDescription('General improvements and fixes.');
      expect(keys).toHaveLength(0);
    });

    it('deduplicates repeated ticket keys', () => {
      const keys = extractTicketKeysFromDescription('PROJ-123 is fixed. See PROJ-123 for details.');
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe('PROJ-123');
    });
  });

  describe('extractTicketKeysFromTitle', () => {
    it('extracts ticket key from PR title', () => {
      const keys = extractTicketKeysFromTitle('[PROJ-123] Fix login bug');
      expect(keys).toContain('PROJ-123');
    });

    it('extracts ticket key at start of title', () => {
      const keys = extractTicketKeysFromTitle('PROJ-456: Update dependencies');
      expect(keys).toContain('PROJ-456');
    });
  });

  describe('correlatePrToJira', () => {
    it('correlates from branch name', () => {
      const result = correlatePrToJira({
        branchName: 'feature/PROJ-123-fix-bug',
        title: 'Fix the login bug',
        description: 'General fix for login.',
      });

      expect(result.ticketKeys).toContain('PROJ-123');
      expect(result.sources).toContainEqual({
        ticketKey: 'PROJ-123',
        foundIn: 'branch',
      });
    });

    it('correlates from multiple sources', () => {
      const result = correlatePrToJira({
        branchName: 'feature/PROJ-123-fix',
        title: '[PROJ-123] Fix login',
        description: 'Also related to TEAM-456',
      });

      expect(result.ticketKeys).toContain('PROJ-123');
      expect(result.ticketKeys).toContain('TEAM-456');
    });

    it('deduplicates across sources', () => {
      const result = correlatePrToJira({
        branchName: 'feature/PROJ-123-fix',
        title: 'PROJ-123 fix',
        description: 'Fixes PROJ-123',
      });

      expect(result.ticketKeys).toHaveLength(1);
      expect(result.ticketKeys[0]).toBe('PROJ-123');
      // But sources has entries from all locations
      expect(result.sources.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty when no tickets found', () => {
      const result = correlatePrToJira({
        branchName: 'feature/new-widget',
        title: 'Add new widget',
        description: 'A cool new widget.',
      });

      expect(result.ticketKeys).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
    });
  });
});

// --- Ticket Updater Tests ---

describe('TicketUpdater', () => {
  let gateway: GatewayMethods;
  let jiraOps: JiraWriteOperations;
  let updater: TicketUpdater;

  const prDetails: PrMergeDetails = {
    prNumber: 42,
    prTitle: 'Fix login bug',
    prUrl: 'https://github.com/org/repo/pull/42',
    author: 'developer',
    repository: 'org/repo',
    baseBranch: 'main',
    headBranch: 'feature/PROJ-123-fix',
    mergedAt: '2026-03-13T15:00:00Z',
  };

  beforeEach(() => {
    gateway = createMockGateway();
    jiraOps = createMockJiraOps();
    updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');
  });

  it('adds a comment to the Jira ticket on PR merge', async () => {
    const result = await updater.updateTicketForMerge('PROJ-123', prDetails);

    expect(result.ticketKey).toBe('PROJ-123');
    expect(result.commentResult).not.toBeNull();
    expect(result.commentResult!.success).toBe(true);
    expect(jiraOps.jiraComment).toHaveBeenCalledWith(
      expect.objectContaining({ issueKey: 'PROJ-123' }),
    );
  });

  it('includes PR URL in the comment body', async () => {
    await updater.updateTicketForMerge('PROJ-123', prDetails);

    const callArgs = (jiraOps.jiraComment as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      body: string;
    };
    expect(callArgs.body).toContain('https://github.com/org/repo/pull/42');
    expect(callArgs.body).toContain('#42');
    expect(callArgs.body).toContain('Fix login bug');
  });

  it('transitions ticket when target transition is provided', async () => {
    const result = await updater.updateTicketForMerge(
      'PROJ-123',
      prDetails,
      { id: '31', name: 'Done' },
    );

    expect(result.transitionResult).not.toBeNull();
    expect(result.transitionResult!.success).toBe(true);
    expect(jiraOps.jiraTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        issueKey: 'PROJ-123',
        transitionId: '31',
        transitionName: 'Done',
      }),
    );
  });

  it('does not transition when no target transition provided', async () => {
    const result = await updater.updateTicketForMerge('PROJ-123', prDetails);

    expect(result.transitionResult).toBeNull();
    expect(jiraOps.jiraTransition).not.toHaveBeenCalled();
  });

  it('skips transition when policy denies it', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'deny',
        policyApplied: 'enterprise-policy',
        reason: 'Transition not allowed',
        constraints: {},
      }),
    });
    updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');

    const result = await updater.updateTicketForMerge(
      'PROJ-123',
      prDetails,
      { id: '31', name: 'Done' },
    );

    // Comment still added
    expect(result.commentResult).not.toBeNull();
    // Transition skipped
    expect(result.transitionResult).toBeNull();
    expect(jiraOps.jiraTransition).not.toHaveBeenCalled();
  });

  it('skips transition when not in allowedTransitions list', async () => {
    gateway = createMockGateway({
      'policy.evaluate': vi.fn().mockResolvedValue({
        decision: 'allow',
        policyApplied: 'test-policy',
        reason: 'Allowed',
        constraints: {
          allowedTransitions: ['In Review', 'Ready for QA'],
        },
      }),
    });
    updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');

    const result = await updater.updateTicketForMerge(
      'PROJ-123',
      prDetails,
      { id: '31', name: 'Done' },
    );

    expect(result.transitionResult).toBeNull();
    expect(jiraOps.jiraTransition).not.toHaveBeenCalled();
  });

  it('updates multiple tickets for a single PR', async () => {
    const results = await updater.updateTicketsForMerge(
      ['PROJ-123', 'PROJ-456'],
      prDetails,
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.ticketKey).toBe('PROJ-123');
    expect(results[1]!.ticketKey).toBe('PROJ-456');
    expect(jiraOps.jiraComment).toHaveBeenCalledTimes(2);
  });
});

// --- Standup Summary Generator Tests ---

describe('Standup Summary Generator', () => {
  const baseActivities: ActivityRecord[] = [
    {
      type: 'pr_merged',
      timestamp: '2026-03-13T10:00:00Z',
      summary: 'PR #1 merged: Fix bug (org/repo)',
      ticketKeys: ['PROJ-123'],
      prNumber: 1,
      repository: 'org/repo',
    },
    {
      type: 'pr_opened',
      timestamp: '2026-03-13T11:00:00Z',
      summary: 'PR #2 opened: New feature (org/repo)',
      ticketKeys: ['PROJ-456'],
      prNumber: 2,
      repository: 'org/repo',
    },
    {
      type: 'pr_merged',
      timestamp: '2026-03-13T14:00:00Z',
      summary: 'PR #3 merged: Refactor (org/repo)',
      ticketKeys: ['PROJ-789', 'TEAM-100'],
      prNumber: 3,
      repository: 'org/repo',
    },
    {
      type: 'pr_closed',
      timestamp: '2026-03-12T09:00:00Z',
      summary: 'PR #0 closed (yesterday)',
      ticketKeys: [],
      prNumber: 0,
      repository: 'org/other',
    },
  ];

  it('aggregates activities for the given date', () => {
    const summary = generateStandupSummary('user-1', '2026-03-13', baseActivities);

    expect(summary.date).toBe('2026-03-13');
    expect(summary.userId).toBe('user-1');
    expect(summary.prsMerged).toHaveLength(2);
    expect(summary.prsOpened).toHaveLength(1);
    expect(summary.prsClosed).toHaveLength(0); // the closed one is from 03-12
    expect(summary.totalActivities).toBe(3);
  });

  it('collects unique updated tickets', () => {
    const summary = generateStandupSummary('user-1', '2026-03-13', baseActivities);

    expect(summary.ticketsUpdated).toContain('PROJ-123');
    expect(summary.ticketsUpdated).toContain('PROJ-456');
    expect(summary.ticketsUpdated).toContain('PROJ-789');
    expect(summary.ticketsUpdated).toContain('TEAM-100');
    // No duplicates
    expect(new Set(summary.ticketsUpdated).size).toBe(summary.ticketsUpdated.length);
  });

  it('generates readable summary text', () => {
    const summary = generateStandupSummary('user-1', '2026-03-13', baseActivities);

    expect(summary.summaryText).toContain('Merged 2 PR(s)');
    expect(summary.summaryText).toContain('Opened 1 PR(s)');
    expect(summary.summaryText).toContain('Updated 4 ticket(s)');
  });

  it('returns no-activity message for empty day', () => {
    const summary = generateStandupSummary('user-1', '2026-03-15', baseActivities);

    expect(summary.totalActivities).toBe(0);
    expect(summary.summaryText).toBe('No tracked activity for this day.');
  });

  it('filters out activities from other dates', () => {
    const summary = generateStandupSummary('user-1', '2026-03-12', baseActivities);

    expect(summary.totalActivities).toBe(1);
    expect(summary.prsClosed).toHaveLength(1);
    expect(summary.prsMerged).toHaveLength(0);
  });
});

// --- Work Tracking Hooks Tests ---

describe('Work Tracking Hooks', () => {
  let jiraOps: JiraWriteOperations;
  let gateway: GatewayMethods;
  let activityLog: ActivityRecord[];

  beforeEach(() => {
    jiraOps = createMockJiraOps();
    gateway = createMockGateway();
    activityLog = [];
  });

  it('creates hook registration for connector.github.event', () => {
    const updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');
    const hooks = createWorkTrackingHooks(updater, {}, activityLog);

    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.event).toBe('connector.github.event');
  });

  it('records activity for PR merged with ticket correlation', async () => {
    const updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');
    const hooks = createWorkTrackingHooks(updater, {}, activityLog);

    await hooks[0]!.handler({
      eventType: 'pr_merged',
      action: 'closed',
      repository: { owner: 'org', name: 'repo', fullName: 'org/repo' },
      timestamp: '2026-03-13T10:00:00Z',
      sender: 'developer',
      pullRequest: {
        number: 42,
        title: 'Fix login',
        state: 'closed',
        author: 'developer',
        headRef: 'feature/PROJ-123-fix',
        baseRef: 'main',
        merged: true,
        url: 'https://github.com/org/repo/pull/42',
      },
    } as unknown as Record<string, unknown>);

    expect(activityLog).toHaveLength(1);
    expect(activityLog[0]!.type).toBe('pr_merged');
    expect(activityLog[0]!.ticketKeys).toContain('PROJ-123');
    expect(jiraOps.jiraComment).toHaveBeenCalled();
  });

  it('records activity without ticket update for PRs without ticket keys', async () => {
    const updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');
    const hooks = createWorkTrackingHooks(updater, {}, activityLog);

    await hooks[0]!.handler({
      eventType: 'pr_opened',
      action: 'opened',
      repository: { owner: 'org', name: 'repo', fullName: 'org/repo' },
      timestamp: '2026-03-13T11:00:00Z',
      sender: 'developer',
      pullRequest: {
        number: 43,
        title: 'Add new widget',
        state: 'open',
        author: 'developer',
        headRef: 'feature/new-widget',
        baseRef: 'main',
        merged: false,
        url: 'https://github.com/org/repo/pull/43',
      },
    } as unknown as Record<string, unknown>);

    expect(activityLog).toHaveLength(1);
    expect(activityLog[0]!.type).toBe('pr_opened');
    expect(activityLog[0]!.ticketKeys).toHaveLength(0);
    expect(jiraOps.jiraComment).not.toHaveBeenCalled();
  });

  it('ignores events without pullRequest', async () => {
    const updater = new TicketUpdater(jiraOps, gateway, 'tenant-1', 'user-1');
    const hooks = createWorkTrackingHooks(updater, {}, activityLog);

    await hooks[0]!.handler({
      eventType: 'issue_opened',
      action: 'opened',
      repository: { owner: 'org', name: 'repo', fullName: 'org/repo' },
      timestamp: '2026-03-13T11:00:00Z',
      sender: 'developer',
    } as unknown as Record<string, unknown>);

    expect(activityLog).toHaveLength(0);
  });
});
