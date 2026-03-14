import type { DiscoveredTask } from '../discovery/scanner.js';

/**
 * Priority scoring engine.
 * Scores tasks 0-100 using urgency signals:
 * - Deadlines (closer = higher priority)
 * - Sender seniority (higher seniority = higher priority)
 * - Follow-up frequency (more follow-ups = higher urgency)
 * - SLA timers (approaching SLA = critical)
 * - Blocking relationships (blocking others = higher priority)
 */
export class PriorityScorer {
  score(task: DiscoveredTask): number {
    let score = 0;

    // Deadline proximity (0-30 points)
    score += this.scoreDeadline(task.deadline);

    // Sender seniority (0-15 points)
    score += this.scoreSeniority(task.urgencySignals.senderSeniority);

    // Follow-up frequency (0-20 points)
    score += this.scoreFollowUps(task.urgencySignals.followUpCount);

    // SLA timer (0-20 points)
    score += this.scoreSla(task.urgencySignals.slaTimer);

    // Blocking relationships (0-15 points)
    score += this.scoreBlocking(task.urgencySignals.blockingRelationships);

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  scoreBatch(tasks: DiscoveredTask[]): Array<{ task: DiscoveredTask; score: number }> {
    return tasks
      .map((task) => ({ task, score: this.score(task) }))
      .sort((a, b) => b.score - a.score);
  }

  private scoreDeadline(deadline: string | null): number {
    if (!deadline) return 5; // No deadline = low base priority

    const now = Date.now();
    const deadlineMs = new Date(deadline).getTime();
    const hoursUntil = (deadlineMs - now) / (3600 * 1000);

    if (hoursUntil < 0) return 30; // Overdue
    if (hoursUntil < 4) return 28; // Due within 4 hours
    if (hoursUntil < 24) return 22; // Due today
    if (hoursUntil < 72) return 15; // Due within 3 days
    if (hoursUntil < 168) return 10; // Due this week
    return 5;
  }

  private scoreSeniority(seniority: number | null): number {
    if (seniority === null) return 5;
    // Seniority 1-10 scale: 10 = C-level
    return Math.min(15, Math.round(seniority * 1.5));
  }

  private scoreFollowUps(count: number): number {
    if (count === 0) return 0;
    if (count === 1) return 5;
    if (count === 2) return 10;
    if (count <= 4) return 15;
    return 20; // 5+ follow-ups = very urgent
  }

  private scoreSla(slaTimer: string | null): number {
    if (!slaTimer) return 0;

    const slaMs = new Date(slaTimer).getTime();
    const now = Date.now();
    const hoursRemaining = (slaMs - now) / (3600 * 1000);

    if (hoursRemaining < 0) return 20; // SLA breached
    if (hoursRemaining < 1) return 18;
    if (hoursRemaining < 4) return 14;
    if (hoursRemaining < 24) return 8;
    return 3;
  }

  private scoreBlocking(relationships: string[]): number {
    const count = relationships.length;
    if (count === 0) return 0;
    if (count === 1) return 8;
    if (count <= 3) return 12;
    return 15; // Blocking 4+ items
  }
}
