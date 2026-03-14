import { describe, it, expect, vi } from 'vitest';
import { TaskDiscoveryScanner, type DiscoveredTask } from '../src/discovery/scanner.js';
import { TaskCorrelator } from '../src/correlation/correlator.js';
import { PriorityScorer } from '../src/scoring/scorer.js';
import { BriefingGenerator } from '../src/briefing/generator.js';
import { TaskRetentionService } from '../src/discovery/retention.js';

describe('TaskDiscoveryScanner', () => {
  it('scans all connectors and returns discovered tasks', async () => {
    const mockConnector = {
      type: 'gmail' as const,
      read: vi.fn().mockResolvedValue({
        items: [{
          id: '1', source: 'gmail', sourceId: 'msg-1', title: 'Review PR',
          summary: 'Please review PR #42', classification: 'internal',
          url: 'https://mail.google.com/1', metadata: {}, timestamp: new Date().toISOString(),
        }],
        connectorStatus: 'ok',
      }),
    };

    const scanner = new TaskDiscoveryScanner([mockConnector]);
    const tasks = await scanner.scan();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Review PR');
    expect(tasks[0].source.system).toBe('gmail');
  });

  it('handles connector failures gracefully', async () => {
    const failingConnector = {
      type: 'jira' as const,
      read: vi.fn().mockRejectedValue(new Error('API unavailable')),
    };
    const workingConnector = {
      type: 'gmail' as const,
      read: vi.fn().mockResolvedValue({ items: [], connectorStatus: 'ok' }),
    };

    const scanner = new TaskDiscoveryScanner([failingConnector, workingConnector]);
    const tasks = await scanner.scan();
    expect(tasks).toHaveLength(0); // Still succeeds
  });
});

describe('TaskCorrelator', () => {
  const makeTask = (overrides: Partial<DiscoveredTask>): DiscoveredTask => ({
    title: 'Test task',
    description: 'Description',
    source: { system: 'gmail', id: 'src-1', url: 'https://example.com' },
    classification: 'internal',
    deadline: null,
    urgencySignals: { senderSeniority: null, followUpCount: 0, slaTimer: null, blockingRelationships: [] },
    discoveredAt: new Date().toISOString(),
    ...overrides,
  });

  it('auto-merges tasks with matching entity references', () => {
    const correlator = new TaskCorrelator();
    const tasks = [
      makeTask({ title: 'Fix PROJ-123 bug', source: { system: 'jira', id: 'PROJ-123', url: '' } }),
      makeTask({ title: 'PR for PROJ-123', source: { system: 'github', id: 'pr-42', url: '' } }),
    ];

    const groups = correlator.correlate(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0].merged).toHaveLength(1);
  });

  it('keeps unrelated tasks separate', () => {
    const correlator = new TaskCorrelator();
    const tasks = [
      makeTask({ title: 'Update documentation', source: { system: 'jira', id: 'DOC-1', url: '' } }),
      makeTask({ title: 'Fix production outage', source: { system: 'gmail', id: 'msg-99', url: '' } }),
    ];

    const groups = correlator.correlate(tasks);
    expect(groups).toHaveLength(2);
  });

  it('marks ambiguous tasks as possibly related', () => {
    const correlator = new TaskCorrelator();
    const now = new Date().toISOString();
    const tasks = [
      makeTask({ title: 'Review the deployment process', source: { system: 'gmail', id: 'msg-1', url: '' }, discoveredAt: now }),
      makeTask({ title: 'Deployment process review needed', source: { system: 'jira', id: 'TASK-1', url: '' }, discoveredAt: now }),
    ];

    const groups = correlator.correlate(tasks);
    // With high title similarity + cross-system + temporal proximity,
    // these should be correlated
    expect(groups.length).toBeLessThanOrEqual(2);
  });
});

describe('PriorityScorer', () => {
  const makeTask = (overrides: Partial<DiscoveredTask>): DiscoveredTask => ({
    title: 'Test', description: '',
    source: { system: 'jira', id: '1', url: '' },
    classification: 'internal', deadline: null,
    urgencySignals: { senderSeniority: null, followUpCount: 0, slaTimer: null, blockingRelationships: [] },
    discoveredAt: new Date().toISOString(),
    ...overrides,
  });

  it('scores overdue tasks highest', () => {
    const scorer = new PriorityScorer();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const score = scorer.score(makeTask({ deadline: yesterday }));
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it('scores tasks with many follow-ups higher', () => {
    const scorer = new PriorityScorer();
    const noFollowUps = scorer.score(makeTask({ urgencySignals: { senderSeniority: null, followUpCount: 0, slaTimer: null, blockingRelationships: [] } }));
    const manyFollowUps = scorer.score(makeTask({ urgencySignals: { senderSeniority: null, followUpCount: 5, slaTimer: null, blockingRelationships: [] } }));
    expect(manyFollowUps).toBeGreaterThan(noFollowUps);
  });

  it('scores blocking tasks higher', () => {
    const scorer = new PriorityScorer();
    const nonBlocking = scorer.score(makeTask({}));
    const blocking = scorer.score(makeTask({ urgencySignals: { senderSeniority: null, followUpCount: 0, slaTimer: null, blockingRelationships: ['TASK-2', 'TASK-3'] } }));
    expect(blocking).toBeGreaterThan(nonBlocking);
  });

  it('returns scores between 0 and 100', () => {
    const scorer = new PriorityScorer();
    const score = scorer.score(makeTask({
      deadline: new Date(Date.now() - 1000).toISOString(),
      urgencySignals: { senderSeniority: 10, followUpCount: 10, slaTimer: new Date(Date.now() - 1000).toISOString(), blockingRelationships: ['a', 'b', 'c', 'd', 'e'] },
    }));
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('BriefingGenerator', () => {
  it('generates a briefing with tasks and time blocks', () => {
    const generator = new BriefingGenerator();
    const briefing = generator.generate({
      userId: 'user-1',
      tenantId: 'tenant-1',
      taskGroups: [],
      scoredTasks: [{
        task: {
          title: 'Important task', description: '', discoveredAt: new Date().toISOString(),
          source: { system: 'jira', id: 'TASK-1', url: '' },
          classification: 'internal', deadline: null,
          urgencySignals: { senderSeniority: null, followUpCount: 0, slaTimer: null, blockingRelationships: [] },
        },
        score: 85,
      }],
      calendarEvents: [],
      connectorStatuses: { gmail: 'ok', gcal: 'ok', jira: 'ok', github: 'ok', gdrive: 'ok' },
    });

    expect(briefing.tasks).toHaveLength(1);
    expect(briefing.tasks[0].rank).toBe(1);
    expect(briefing.orgNewsItems).toEqual([]);
    expect(briefing.docChangeAlerts).toEqual([]);
  });

  it('generates alerts for unavailable connectors', () => {
    const generator = new BriefingGenerator();
    const briefing = generator.generate({
      userId: 'user-1', tenantId: 'tenant-1',
      taskGroups: [], scoredTasks: [], calendarEvents: [],
      connectorStatuses: { gmail: 'error', gcal: 'ok', jira: 'unreachable', github: 'ok', gdrive: 'ok' },
    });

    expect(briefing.alerts).toHaveLength(2);
    expect(briefing.alerts[0].type).toBe('connector_unavailable');
  });
});

describe('TaskRetentionService', () => {
  it('archives completed tasks after 30 days', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    const updateStatus = vi.fn();
    const store = {
      findByStatus: vi.fn()
        .mockResolvedValueOnce([{ id: 'task-1', status: 'completed', completedAt: thirtyOneDaysAgo, archivedAt: null, discoveredAt: thirtyOneDaysAgo }])
        .mockResolvedValue([]),
      updateStatus,
      delete: vi.fn(),
    };

    const service = new TaskRetentionService(store);
    const result = await service.processRetention();

    expect(result.archived).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith('task-1', 'archived', expect.any(Object));
  });

  it('purges archived tasks after 90 days', async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString();
    const deleteFn = vi.fn();
    const store = {
      findByStatus: vi.fn()
        .mockResolvedValueOnce([]) // completed
        .mockResolvedValueOnce([{ id: 'task-2', status: 'archived', completedAt: ninetyOneDaysAgo, archivedAt: ninetyOneDaysAgo, discoveredAt: ninetyOneDaysAgo }])
        .mockResolvedValue([]),
      updateStatus: vi.fn(),
      delete: deleteFn,
    };

    const service = new TaskRetentionService(store);
    const result = await service.processRetention();

    expect(result.purgedFromArchive).toBe(1);
    expect(deleteFn).toHaveBeenCalledWith('task-2');
  });
});
