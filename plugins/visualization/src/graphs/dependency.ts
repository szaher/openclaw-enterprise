import type { Task } from '@openclaw-enterprise/shared/types.js';

/**
 * D3.js force-directed graph node.
 * Represents a task in the dependency graph.
 */
export interface GraphNode {
  id: string;
  title: string;
  status: string;
  priorityScore: number;
  deadline: string | null;
  classification: string;
  /** Number of tasks this task blocks */
  blockingCount: number;
  /** Number of tasks blocking this task */
  blockedByCount: number;
  /** Node group for D3 color mapping */
  group: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * D3.js force-directed graph link.
 * Represents a blocking relationship between tasks.
 */
export interface GraphLink {
  source: string;
  target: string;
  /** Relationship type */
  type: 'blocks';
}

/**
 * Complete D3.js force-directed graph data structure.
 */
export interface DependencyGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  metadata: {
    totalTasks: number;
    totalDependencies: number;
    criticalPathLength: number;
    generatedAt: string;
  };
}

/**
 * Generates a D3.js force-directed graph data structure from tasks
 * with blocking relationships.
 *
 * Tasks are connected via their urgencySignals.blockingRelationships,
 * which list the IDs of tasks that each task blocks.
 */
export class DependencyGraphGenerator {
  /**
   * Generate graph data from a set of tasks.
   * @param tasks Array of tasks with blocking relationships
   * @returns D3.js compatible force-directed graph data
   */
  generate(tasks: Task[]): DependencyGraphData {
    const taskMap = new Map<string, Task>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const blockedByCounts = new Map<string, number>();
    const blockingCounts = new Map<string, number>();
    const links: GraphLink[] = [];

    // Build links from blocking relationships
    for (const task of tasks) {
      const blockedIds = task.urgencySignals.blockingRelationships;
      blockingCounts.set(task.id, blockedIds.length);

      for (const blockedId of blockedIds) {
        // Only create links to tasks that exist in our set
        if (taskMap.has(blockedId)) {
          links.push({
            source: task.id,
            target: blockedId,
            type: 'blocks',
          });
          blockedByCounts.set(
            blockedId,
            (blockedByCounts.get(blockedId) ?? 0) + 1,
          );
        }
      }
    }

    // Build nodes with metadata
    const nodes: GraphNode[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priorityScore: task.priorityScore,
      deadline: task.deadline,
      classification: task.classification,
      blockingCount: blockingCounts.get(task.id) ?? 0,
      blockedByCount: blockedByCounts.get(task.id) ?? 0,
      group: this.assignGroup(task.priorityScore),
    }));

    const criticalPathLength = this.computeCriticalPathLength(tasks, taskMap);

    return {
      nodes,
      links,
      metadata: {
        totalTasks: nodes.length,
        totalDependencies: links.length,
        criticalPathLength,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Assign a visual group based on priority score.
   */
  private assignGroup(score: number): GraphNode['group'] {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Compute the longest chain of blocking relationships (critical path).
   * Uses iterative topological traversal to avoid stack overflow on large graphs.
   */
  private computeCriticalPathLength(
    tasks: Task[],
    taskMap: Map<string, Task>,
  ): number {
    if (tasks.length === 0) return 0;

    // Build adjacency list: task -> tasks it blocks
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const task of tasks) {
      adj.set(task.id, []);
      inDegree.set(task.id, 0);
    }

    for (const task of tasks) {
      for (const blockedId of task.urgencySignals.blockingRelationships) {
        if (taskMap.has(blockedId)) {
          adj.get(task.id)!.push(blockedId);
          inDegree.set(blockedId, (inDegree.get(blockedId) ?? 0) + 1);
        }
      }
    }

    // Topological sort with longest path computation
    const dist = new Map<string, number>();
    const queue: string[] = [];

    for (const task of tasks) {
      dist.set(task.id, 1);
      if ((inDegree.get(task.id) ?? 0) === 0) {
        queue.push(task.id);
      }
    }

    let maxPath = tasks.length > 0 ? 1 : 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = dist.get(current)!;

      for (const neighbor of adj.get(current) ?? []) {
        const newDist = currentDist + 1;
        if (newDist > (dist.get(neighbor) ?? 1)) {
          dist.set(neighbor, newDist);
        }
        if (newDist > maxPath) {
          maxPath = newDist;
        }

        const newInDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newInDegree);
        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return maxPath;
  }
}
