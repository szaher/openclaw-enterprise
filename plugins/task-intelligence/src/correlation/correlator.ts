import {
  CORRELATION_AUTO_MERGE_THRESHOLD,
  CORRELATION_POSSIBLY_RELATED_THRESHOLD,
} from '@openclaw-enterprise/shared/constants.js';
import type { DiscoveredTask } from '../discovery/scanner.js';

export interface CorrelatedTaskGroup {
  primary: DiscoveredTask;
  merged: DiscoveredTask[];
  possiblyRelated: DiscoveredTask[];
  correlationId: string;
  confidence: number;
}

/**
 * Multi-signal task correlation engine.
 * Deduplicates tasks discovered across multiple systems.
 *
 * Confidence thresholds:
 * - >= 0.8: auto-merge (same work item across systems)
 * - 0.5-0.8: "possibly related" (shown together with indicator)
 * - < 0.5: separate tasks
 *
 * Signals:
 * - Title/description similarity (Jaccard on words)
 * - Entity references (ticket IDs like PROJ-123, PR #456)
 * - Temporal proximity (discovered within same time window)
 * - Participant overlap (same people involved)
 */
export class TaskCorrelator {
  correlate(tasks: DiscoveredTask[]): CorrelatedTaskGroup[] {
    if (tasks.length === 0) return [];

    const groups: CorrelatedTaskGroup[] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < tasks.length; i++) {
      if (assigned.has(i)) continue;

      const group: CorrelatedTaskGroup = {
        primary: tasks[i],
        merged: [],
        possiblyRelated: [],
        correlationId: crypto.randomUUID(),
        confidence: 1.0,
      };

      assigned.add(i);

      for (let j = i + 1; j < tasks.length; j++) {
        if (assigned.has(j)) continue;

        const confidence = this.computeConfidence(tasks[i], tasks[j]);

        if (confidence >= CORRELATION_AUTO_MERGE_THRESHOLD) {
          group.merged.push(tasks[j]);
          group.confidence = Math.min(group.confidence, confidence);
          assigned.add(j);
        } else if (confidence >= CORRELATION_POSSIBLY_RELATED_THRESHOLD) {
          group.possiblyRelated.push(tasks[j]);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private computeConfidence(a: DiscoveredTask, b: DiscoveredTask): number {
    const signals: number[] = [];

    // Signal 1: Title similarity (Jaccard coefficient on words)
    const titleSim = this.jaccardSimilarity(
      this.tokenize(a.title),
      this.tokenize(b.title),
    );
    signals.push(titleSim * 0.3);

    // Signal 2: Entity reference matching (ticket IDs, PR numbers)
    const entityMatch = this.entityReferenceMatch(a, b);
    signals.push(entityMatch * 0.4);

    // Signal 3: Temporal proximity (within 1 hour = high, 1 day = medium)
    const temporalSim = this.temporalProximity(a.discoveredAt, b.discoveredAt);
    signals.push(temporalSim * 0.1);

    // Signal 4: Cross-system indicator (different sources mentioning same thing)
    const crossSystem = a.source.system !== b.source.system ? 0.2 : 0;
    signals.push(crossSystem);

    return Math.min(1.0, signals.reduce((sum, s) => sum + s, 0));
  }

  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  }

  private entityReferenceMatch(a: DiscoveredTask, b: DiscoveredTask): number {
    const refsA = this.extractEntityReferences(a);
    const refsB = this.extractEntityReferences(b);

    if (refsA.size === 0 || refsB.size === 0) return 0;

    const matching = [...refsA].filter((ref) => refsB.has(ref));
    return matching.length > 0 ? 1.0 : 0;
  }

  private extractEntityReferences(task: DiscoveredTask): Set<string> {
    const refs = new Set<string>();
    const text = `${task.title} ${task.description} ${task.source.id}`;

    // Jira ticket keys: PROJ-123
    const jiraMatches = text.match(/[A-Z][A-Z0-9]+-\d+/g);
    if (jiraMatches) jiraMatches.forEach((m) => refs.add(m.toUpperCase()));

    // GitHub PR/Issue references: #123
    const ghMatches = text.match(/#\d+/g);
    if (ghMatches) ghMatches.forEach((m) => refs.add(m));

    // Source IDs as references
    refs.add(task.source.id);

    return refs;
  }

  private temporalProximity(timeA: string, timeB: string): number {
    const diff = Math.abs(new Date(timeA).getTime() - new Date(timeB).getTime());
    const oneHour = 3600 * 1000;
    const oneDay = 24 * oneHour;

    if (diff < oneHour) return 1.0;
    if (diff < oneDay) return 0.5;
    return 0.1;
  }
}
