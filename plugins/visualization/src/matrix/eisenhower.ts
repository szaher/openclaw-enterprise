import type { Task } from '@openclaw-enterprise/shared/types.js';

/**
 * A task plotted on the Eisenhower matrix with computed coordinates.
 */
export interface PlottedTask {
  id: string;
  title: string;
  status: string;
  priorityScore: number;
  /** Urgency score 0-100 (x-axis) */
  urgency: number;
  /** Importance score 0-100 (y-axis) */
  importance: number;
  /** Which quadrant the task falls into */
  quadrant: EisenhowerQuadrant;
  deadline: string | null;
  classification: string;
}

export type EisenhowerQuadrant = 'do-first' | 'schedule' | 'delegate' | 'eliminate';

/**
 * Eisenhower matrix data structure for D3.js rendering.
 */
export interface EisenhowerMatrixData {
  tasks: PlottedTask[];
  quadrants: {
    'do-first': PlottedTask[];
    schedule: PlottedTask[];
    delegate: PlottedTask[];
    eliminate: PlottedTask[];
  };
  metadata: {
    totalTasks: number;
    quadrantCounts: Record<EisenhowerQuadrant, number>;
    generatedAt: string;
  };
}

/**
 * Urgency threshold: tasks above this x-value are considered urgent.
 */
const URGENCY_THRESHOLD = 50;

/**
 * Importance threshold: tasks above this y-value are considered important.
 */
const IMPORTANCE_THRESHOLD = 50;

/**
 * Generates Eisenhower (urgent/important) matrix data from tasks.
 *
 * Urgency is computed from real-time signals:
 * - Deadline proximity
 * - Follow-up frequency
 * - SLA timer proximity
 *
 * Importance is computed from:
 * - Sender seniority
 * - Blocking relationships count
 * - Data classification level
 */
export class EisenhowerMatrixGenerator {
  /**
   * Generate matrix data from tasks.
   * @param tasks Array of tasks with urgency signals
   * @returns Eisenhower matrix data for D3.js rendering
   */
  generate(tasks: Task[]): EisenhowerMatrixData {
    const plottedTasks = tasks.map((task) => this.plotTask(task));

    const quadrants: EisenhowerMatrixData['quadrants'] = {
      'do-first': [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };

    for (const task of plottedTasks) {
      quadrants[task.quadrant].push(task);
    }

    // Sort each quadrant by priority score descending
    for (const key of Object.keys(quadrants) as EisenhowerQuadrant[]) {
      quadrants[key].sort((a, b) => b.priorityScore - a.priorityScore);
    }

    return {
      tasks: plottedTasks,
      quadrants,
      metadata: {
        totalTasks: plottedTasks.length,
        quadrantCounts: {
          'do-first': quadrants['do-first'].length,
          schedule: quadrants.schedule.length,
          delegate: quadrants.delegate.length,
          eliminate: quadrants.eliminate.length,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Plot a single task on the urgency/importance axes.
   */
  private plotTask(task: Task): PlottedTask {
    const urgency = this.computeUrgency(task);
    const importance = this.computeImportance(task);
    const quadrant = this.assignQuadrant(urgency, importance);

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priorityScore: task.priorityScore,
      urgency,
      importance,
      quadrant,
      deadline: task.deadline,
      classification: task.classification,
    };
  }

  /**
   * Compute urgency score (0-100) from time-sensitive signals.
   *
   * Signals:
   * - Deadline proximity: 0-40 points
   * - Follow-up frequency: 0-30 points
   * - SLA timer proximity: 0-30 points
   */
  computeUrgency(task: Task): number {
    let score = 0;

    // Deadline proximity (0-40 points)
    score += this.scoreDeadlineUrgency(task.deadline);

    // Follow-up frequency (0-30 points)
    score += this.scoreFollowUpUrgency(task.urgencySignals.followUpCount);

    // SLA timer (0-30 points)
    score += this.scoreSlaUrgency(task.urgencySignals.slaTimer);

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Compute importance score (0-100) from impact signals.
   *
   * Signals:
   * - Sender seniority: 0-35 points
   * - Blocking relationships: 0-35 points
   * - Data classification level: 0-30 points
   */
  computeImportance(task: Task): number {
    let score = 0;

    // Sender seniority (0-35 points)
    score += this.scoreSeniorityImportance(task.urgencySignals.senderSeniority);

    // Blocking relationships (0-35 points)
    score += this.scoreBlockingImportance(task.urgencySignals.blockingRelationships);

    // Data classification (0-30 points)
    score += this.scoreClassificationImportance(task.classification);

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Assign quadrant based on urgency and importance thresholds.
   *
   * - do-first:  urgent AND important (top-right)
   * - schedule:  NOT urgent AND important (top-left)
   * - delegate:  urgent AND NOT important (bottom-right)
   * - eliminate: NOT urgent AND NOT important (bottom-left)
   */
  private assignQuadrant(urgency: number, importance: number): EisenhowerQuadrant {
    const isUrgent = urgency >= URGENCY_THRESHOLD;
    const isImportant = importance >= IMPORTANCE_THRESHOLD;

    if (isUrgent && isImportant) return 'do-first';
    if (!isUrgent && isImportant) return 'schedule';
    if (isUrgent && !isImportant) return 'delegate';
    return 'eliminate';
  }

  private scoreDeadlineUrgency(deadline: string | null): number {
    if (!deadline) return 5;

    const now = Date.now();
    const deadlineMs = new Date(deadline).getTime();
    const hoursUntil = (deadlineMs - now) / (3600 * 1000);

    if (hoursUntil < 0) return 40;    // Overdue
    if (hoursUntil < 4) return 36;    // Due within 4 hours
    if (hoursUntil < 24) return 28;   // Due today
    if (hoursUntil < 72) return 20;   // Due within 3 days
    if (hoursUntil < 168) return 12;  // Due this week
    return 5;
  }

  private scoreFollowUpUrgency(count: number): number {
    if (count === 0) return 0;
    if (count === 1) return 8;
    if (count === 2) return 15;
    if (count <= 4) return 22;
    return 30; // 5+ follow-ups
  }

  private scoreSlaUrgency(slaTimer: string | null): number {
    if (!slaTimer) return 0;

    const slaMs = new Date(slaTimer).getTime();
    const now = Date.now();
    const hoursRemaining = (slaMs - now) / (3600 * 1000);

    if (hoursRemaining < 0) return 30;   // SLA breached
    if (hoursRemaining < 1) return 26;
    if (hoursRemaining < 4) return 20;
    if (hoursRemaining < 24) return 12;
    return 5;
  }

  private scoreSeniorityImportance(seniority: number | null): number {
    if (seniority === null) return 10;
    // Seniority 1-10 scale: 10 = C-level
    return Math.min(35, Math.round(seniority * 3.5));
  }

  private scoreBlockingImportance(relationships: string[]): number {
    const count = relationships.length;
    if (count === 0) return 0;
    if (count === 1) return 15;
    if (count <= 3) return 25;
    return 35; // Blocking 4+ items
  }

  private scoreClassificationImportance(classification: string): number {
    switch (classification) {
      case 'restricted': return 30;
      case 'confidential': return 22;
      case 'internal': return 12;
      case 'public': return 5;
      default: return 10;
    }
  }
}
