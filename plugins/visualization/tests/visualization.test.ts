import { describe, it, expect } from 'vitest';
import { DependencyGraphGenerator } from '../src/graphs/dependency.js';
import { EisenhowerMatrixGenerator } from '../src/matrix/eisenhower.js';
import { MindMapGenerator } from '../src/mindmap/generator.js';
import type { Task } from '@openclaw-enterprise/shared/types.js';
import type { CrossSystemItem } from '../src/mindmap/generator.js';

// --- Test Helpers ---

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    userId: 'user-1',
    title: 'Test task',
    description: 'A test task',
    priorityScore: 50,
    status: 'active',
    sources: [{ system: 'jira', id: 'PROJ-1', url: 'https://jira.example.com/PROJ-1' }],
    correlationId: null,
    correlationConfidence: null,
    deadline: null,
    urgencySignals: {
      senderSeniority: null,
      followUpCount: 0,
      slaTimer: null,
      blockingRelationships: [],
    },
    classification: 'internal',
    discoveredAt: '2026-03-13T10:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    purgeAt: null,
    ...overrides,
  };
}

function createTaskSet(): Task[] {
  return [
    createTask({
      id: 'task-a',
      title: 'Design API schema',
      priorityScore: 85,
      urgencySignals: {
        senderSeniority: 8,
        followUpCount: 3,
        slaTimer: null,
        blockingRelationships: ['task-b', 'task-c'],
      },
      deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      classification: 'confidential',
    }),
    createTask({
      id: 'task-b',
      title: 'Implement API endpoints',
      priorityScore: 60,
      urgencySignals: {
        senderSeniority: 5,
        followUpCount: 0,
        slaTimer: null,
        blockingRelationships: ['task-d'],
      },
      deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    }),
    createTask({
      id: 'task-c',
      title: 'Write unit tests',
      priorityScore: 45,
      sources: [{ system: 'github', id: 'PR-42', url: 'https://github.com/org/repo/pull/42' }],
      urgencySignals: {
        senderSeniority: null,
        followUpCount: 0,
        slaTimer: null,
        blockingRelationships: [],
      },
    }),
    createTask({
      id: 'task-d',
      title: 'Update documentation',
      priorityScore: 20,
      urgencySignals: {
        senderSeniority: null,
        followUpCount: 0,
        slaTimer: null,
        blockingRelationships: [],
      },
      classification: 'public',
    }),
  ];
}

// --- DependencyGraphGenerator Tests ---

describe('DependencyGraphGenerator', () => {
  const generator = new DependencyGraphGenerator();

  it('creates correct number of nodes from tasks', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    expect(graph.nodes).toHaveLength(4);
    expect(graph.metadata.totalTasks).toBe(4);
  });

  it('creates correct links from blocking relationships', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    // task-a blocks task-b and task-c; task-b blocks task-d
    expect(graph.links).toHaveLength(3);
    expect(graph.metadata.totalDependencies).toBe(3);

    const linkSources = graph.links.map((l) => l.source);
    const linkTargets = graph.links.map((l) => l.target);
    expect(linkSources).toContain('task-a');
    expect(linkSources).toContain('task-b');
    expect(linkTargets).toContain('task-b');
    expect(linkTargets).toContain('task-c');
    expect(linkTargets).toContain('task-d');
  });

  it('includes task metadata on nodes', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    const nodeA = graph.nodes.find((n) => n.id === 'task-a');
    expect(nodeA).toBeDefined();
    expect(nodeA!.title).toBe('Design API schema');
    expect(nodeA!.priorityScore).toBe(85);
    expect(nodeA!.status).toBe('active');
    expect(nodeA!.blockingCount).toBe(2);
  });

  it('assigns correct group based on priority score', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    const nodeA = graph.nodes.find((n) => n.id === 'task-a')!;
    const nodeB = graph.nodes.find((n) => n.id === 'task-b')!;
    const nodeC = graph.nodes.find((n) => n.id === 'task-c')!;
    const nodeD = graph.nodes.find((n) => n.id === 'task-d')!;

    expect(nodeA.group).toBe('critical'); // score 85
    expect(nodeB.group).toBe('high');     // score 60
    expect(nodeC.group).toBe('medium');   // score 45
    expect(nodeD.group).toBe('low');      // score 20
  });

  it('computes blockedByCount correctly', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    const nodeB = graph.nodes.find((n) => n.id === 'task-b')!;
    expect(nodeB.blockedByCount).toBe(1); // blocked by task-a
  });

  it('ignores links to tasks not in the set', () => {
    const tasks = [
      createTask({
        id: 'task-x',
        urgencySignals: {
          senderSeniority: null,
          followUpCount: 0,
          slaTimer: null,
          blockingRelationships: ['task-nonexistent'],
        },
      }),
    ];
    const graph = generator.generate(tasks);

    expect(graph.links).toHaveLength(0);
  });

  it('handles empty task list', () => {
    const graph = generator.generate([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
    expect(graph.metadata.criticalPathLength).toBe(0);
  });

  it('computes critical path length', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    // Critical path: task-a -> task-b -> task-d = length 3
    expect(graph.metadata.criticalPathLength).toBe(3);
  });

  it('all links have type "blocks"', () => {
    const tasks = createTaskSet();
    const graph = generator.generate(tasks);

    for (const link of graph.links) {
      expect(link.type).toBe('blocks');
    }
  });
});

// --- EisenhowerMatrixGenerator Tests ---

describe('EisenhowerMatrixGenerator', () => {
  const generator = new EisenhowerMatrixGenerator();

  it('plots tasks into correct quadrants', () => {
    const tasks = createTaskSet();
    const matrix = generator.generate(tasks);

    expect(matrix.metadata.totalTasks).toBe(4);

    // task-a: overdue deadline + high follow-ups = urgent,
    //         high seniority + blocking 2 + confidential = important -> do-first
    const taskA = matrix.tasks.find((t) => t.id === 'task-a')!;
    expect(taskA.quadrant).toBe('do-first');
  });

  it('assigns do-first quadrant for urgent and important tasks', () => {
    const task = createTask({
      id: 'urgent-important',
      deadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), // 2h from now
      urgencySignals: {
        senderSeniority: 9,
        followUpCount: 4,
        slaTimer: new Date(Date.now() + 1 * 3600 * 1000).toISOString(),
        blockingRelationships: ['x', 'y', 'z', 'w'],
      },
      classification: 'restricted',
    });

    const matrix = generator.generate([task]);
    expect(matrix.tasks[0]!.quadrant).toBe('do-first');
    expect(matrix.quadrants['do-first']).toHaveLength(1);
  });

  it('assigns eliminate quadrant for low urgency and low importance tasks', () => {
    const task = createTask({
      id: 'low-low',
      deadline: null,
      urgencySignals: {
        senderSeniority: null,
        followUpCount: 0,
        slaTimer: null,
        blockingRelationships: [],
      },
      classification: 'public',
    });

    const matrix = generator.generate([task]);
    expect(matrix.tasks[0]!.quadrant).toBe('eliminate');
    expect(matrix.quadrants.eliminate).toHaveLength(1);
  });

  it('assigns schedule quadrant for important but not urgent tasks', () => {
    const task = createTask({
      id: 'not-urgent-important',
      deadline: null, // no deadline = low urgency
      urgencySignals: {
        senderSeniority: 10, // C-level = high importance
        followUpCount: 0,
        slaTimer: null,
        blockingRelationships: ['a', 'b', 'c', 'd'], // many blocked = high importance
      },
      classification: 'restricted',
    });

    const matrix = generator.generate([task]);
    expect(matrix.tasks[0]!.quadrant).toBe('schedule');
    expect(matrix.quadrants.schedule).toHaveLength(1);
  });

  it('assigns delegate quadrant for urgent but not important tasks', () => {
    const task = createTask({
      id: 'urgent-not-important',
      deadline: new Date(Date.now() - 1000).toISOString(), // overdue
      urgencySignals: {
        senderSeniority: 1,
        followUpCount: 5,
        slaTimer: new Date(Date.now() - 1000).toISOString(), // breached
        blockingRelationships: [],
      },
      classification: 'public',
    });

    const matrix = generator.generate([task]);
    expect(matrix.tasks[0]!.quadrant).toBe('delegate');
    expect(matrix.quadrants.delegate).toHaveLength(1);
  });

  it('computes urgency and importance scores in range 0-100', () => {
    const tasks = createTaskSet();
    const matrix = generator.generate(tasks);

    for (const task of matrix.tasks) {
      expect(task.urgency).toBeGreaterThanOrEqual(0);
      expect(task.urgency).toBeLessThanOrEqual(100);
      expect(task.importance).toBeGreaterThanOrEqual(0);
      expect(task.importance).toBeLessThanOrEqual(100);
    }
  });

  it('returns correct quadrant counts in metadata', () => {
    const tasks = createTaskSet();
    const matrix = generator.generate(tasks);

    const totalFromCounts = Object.values(matrix.metadata.quadrantCounts).reduce((a, b) => a + b, 0);
    expect(totalFromCounts).toBe(tasks.length);
  });

  it('sorts tasks within quadrants by priority score descending', () => {
    const tasks = [
      createTask({ id: 't1', priorityScore: 30, classification: 'public' }),
      createTask({ id: 't2', priorityScore: 90, classification: 'public' }),
      createTask({ id: 't3', priorityScore: 60, classification: 'public' }),
    ];
    const matrix = generator.generate(tasks);

    // Find the quadrant where all tasks ended up and check sort order
    for (const quadrant of Object.values(matrix.quadrants)) {
      if (quadrant.length > 1) {
        for (let i = 1; i < quadrant.length; i++) {
          expect(quadrant[i]!.priorityScore).toBeLessThanOrEqual(quadrant[i - 1]!.priorityScore);
        }
      }
    }
  });

  it('handles empty task list', () => {
    const matrix = generator.generate([]);
    expect(matrix.tasks).toHaveLength(0);
    expect(matrix.metadata.totalTasks).toBe(0);
  });
});

// --- MindMapGenerator Tests ---

describe('MindMapGenerator', () => {
  const generator = new MindMapGenerator();

  function createItems(): CrossSystemItem[] {
    return [
      {
        id: 'item-1',
        title: 'Fix authentication bug',
        source: 'jira',
        sourceId: 'PROJ-101',
        url: 'https://jira.example.com/PROJ-101',
        labels: ['engineering', 'security'],
        classification: 'internal',
        metadata: {},
      },
      {
        id: 'item-2',
        title: 'Update API documentation',
        source: 'gdrive',
        sourceId: 'doc-abc',
        url: 'https://docs.google.com/abc',
        labels: ['documentation'],
        classification: 'internal',
        metadata: {},
      },
      {
        id: 'item-3',
        title: 'Review PR for authentication module',
        source: 'github',
        sourceId: 'PR-42',
        url: 'https://github.com/org/repo/pull/42',
        labels: ['security'],
        classification: 'confidential',
        metadata: {},
      },
      {
        id: 'item-4',
        title: 'Deploy staging environment',
        source: 'jira',
        sourceId: 'OPS-55',
        url: 'https://jira.example.com/OPS-55',
        labels: ['infrastructure'],
        classification: 'internal',
        metadata: {},
      },
      {
        id: 'item-5',
        title: 'Design new onboarding flow',
        source: 'jira',
        sourceId: 'UX-12',
        url: 'https://jira.example.com/UX-12',
        labels: ['design'],
        classification: 'public',
        metadata: {},
      },
    ];
  }

  it('organizes items by theme, not by source', () => {
    const items = createItems();
    const mindMap = generator.generate('TestProject', items);

    // Root should have theme children, not source children
    const themeNames = mindMap.root.children.map((c) => c.name.toLowerCase());
    expect(themeNames).not.toContain('jira');
    expect(themeNames).not.toContain('github');
    expect(themeNames).not.toContain('gdrive');

    // Should have theme-based groups
    expect(themeNames.some((t) => t.includes('engineering') || t.includes('security'))).toBe(true);
    expect(themeNames.some((t) => t.includes('documentation'))).toBe(true);
  });

  it('creates correct tree structure (root -> themes -> items)', () => {
    const items = createItems();
    const mindMap = generator.generate('TestProject', items);

    expect(mindMap.root.type).toBe('root');
    expect(mindMap.root.name).toBe('TestProject');
    expect(mindMap.root.children.length).toBeGreaterThan(0);

    for (const theme of mindMap.root.children) {
      expect(theme.type).toBe('theme');
      for (const item of theme.children) {
        expect(item.type).toBe('item');
      }
    }
  });

  it('reports correct metadata', () => {
    const items = createItems();
    const mindMap = generator.generate('TestProject', items);

    expect(mindMap.metadata.projectName).toBe('TestProject');
    expect(mindMap.metadata.totalItems).toBe(5);
    expect(mindMap.metadata.themeCount).toBeGreaterThan(0);
    expect(mindMap.metadata.sourceCount).toBe(3); // jira, github, gdrive
  });

  it('groups items from different sources under same theme', () => {
    const items: CrossSystemItem[] = [
      {
        id: 'a',
        title: 'Security audit from Jira',
        source: 'jira',
        sourceId: 'SEC-1',
        url: '',
        labels: ['security'],
        classification: 'confidential',
        metadata: {},
      },
      {
        id: 'b',
        title: 'Security fix PR',
        source: 'github',
        sourceId: 'PR-99',
        url: '',
        labels: ['security'],
        classification: 'confidential',
        metadata: {},
      },
    ];

    const mindMap = generator.generate('SecProject', items);

    // Both items should be under the same security theme
    const securityTheme = mindMap.root.children.find(
      (c) => c.name.toLowerCase() === 'security',
    );
    expect(securityTheme).toBeDefined();
    expect(securityTheme!.children).toHaveLength(2);
    expect(securityTheme!.sources).toContain('jira');
    expect(securityTheme!.sources).toContain('github');
  });

  it('sorts themes by item count descending', () => {
    const items: CrossSystemItem[] = [
      { id: '1', title: 'Test A', source: 'jira', sourceId: '1', url: '', labels: ['testing'], classification: 'internal', metadata: {} },
      { id: '2', title: 'Test B', source: 'jira', sourceId: '2', url: '', labels: ['testing'], classification: 'internal', metadata: {} },
      { id: '3', title: 'Test C', source: 'jira', sourceId: '3', url: '', labels: ['testing'], classification: 'internal', metadata: {} },
      { id: '4', title: 'Design X', source: 'jira', sourceId: '4', url: '', labels: ['design'], classification: 'internal', metadata: {} },
    ];

    const mindMap = generator.generate('Project', items);
    expect(mindMap.root.children[0]!.value).toBeGreaterThanOrEqual(mindMap.root.children[1]!.value);
  });

  it('converts tasks to cross-system items', () => {
    const tasks = createTaskSet();
    const items = generator.tasksToItems(tasks);

    expect(items).toHaveLength(4);
    expect(items[0]!.source).toBe('jira');
    expect(items[0]!.title).toBe('Design API schema');
    expect(items[2]!.source).toBe('github');
  });

  it('handles empty items list', () => {
    const mindMap = generator.generate('Empty', []);
    expect(mindMap.root.children).toHaveLength(0);
    expect(mindMap.metadata.totalItems).toBe(0);
  });

  it('preserves classification metadata on leaf nodes', () => {
    const items = createItems();
    const mindMap = generator.generate('Project', items);

    const allLeaves: Array<{ metadata: Record<string, unknown> }> = [];
    for (const theme of mindMap.root.children) {
      for (const item of theme.children) {
        allLeaves.push(item);
      }
    }

    // Every leaf should have classification in metadata
    for (const leaf of allLeaves) {
      expect(leaf.metadata['classification']).toBeDefined();
    }
  });

  it('uses keyword extraction when no explicit labels match', () => {
    const items: CrossSystemItem[] = [
      {
        id: '1',
        title: 'Fix CI pipeline',
        source: 'jira',
        sourceId: 'INFRA-1',
        url: '',
        labels: [], // no labels
        classification: 'internal',
        metadata: {},
      },
    ];

    const mindMap = generator.generate('Project', items);
    // Should be categorized under 'infrastructure' via keyword 'pipeline'
    const theme = mindMap.root.children[0];
    expect(theme).toBeDefined();
    expect(theme!.name.toLowerCase()).toBe('infrastructure');
  });
});
