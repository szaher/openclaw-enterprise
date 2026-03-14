import type {
  Briefing,
  ConnectorType,
  DataClassificationLevel,
} from '@openclaw-enterprise/shared/types.js';
import type { DiscoveredTask } from '../discovery/scanner.js';
import type { CorrelatedTaskGroup } from '../correlation/correlator.js';

export interface CalendarEvent {
  start: string;
  end: string;
  title: string;
}

export interface BriefingInput {
  userId: string;
  tenantId: string;
  taskGroups: CorrelatedTaskGroup[];
  scoredTasks: Array<{ task: DiscoveredTask; score: number }>;
  calendarEvents: CalendarEvent[];
  connectorStatuses: Record<ConnectorType, 'ok' | 'partial' | 'error' | 'unreachable'>;
  autoResponseSummary?: Record<string, unknown>;
}

/**
 * Generates a daily briefing containing:
 * - Prioritized task list (deduplicated, ranked)
 * - Time-block suggestions based on calendar free slots
 * - Connector status (which data sources were available)
 * - Alerts for unavailable connectors
 *
 * Note: org_news_items and doc_change_alerts are populated as empty
 * until the org-intelligence plugin (US5) is implemented.
 */
export class BriefingGenerator {
  generate(input: BriefingInput): Briefing {
    const now = new Date().toISOString();

    // Build prioritized task list
    const tasks = input.scoredTasks
      .slice(0, 20) // Top 20 tasks
      .map((scored, index) => ({
        taskId: scored.task.source.id,
        rank: index + 1,
      }));

    // Find free time blocks
    const timeBlocks = this.findFreeBlocks(input.calendarEvents, input.scoredTasks);

    // Generate alerts for problematic connectors
    const alerts = this.generateAlerts(input.connectorStatuses);

    return {
      id: crypto.randomUUID(),
      userId: input.userId,
      tenantId: input.tenantId,
      generatedAt: now,
      tasks,
      timeBlocks,
      autoResponseSummary: input.autoResponseSummary ?? {},
      orgNewsItems: [],       // Populated by US5 (org-intelligence)
      docChangeAlerts: [],    // Populated by US5 (org-intelligence)
      alerts,
      connectorStatus: input.connectorStatuses,
      deliveryChannel: 'slack',
      deliveredAt: null,
    };
  }

  private findFreeBlocks(
    events: CalendarEvent[],
    scoredTasks: Array<{ task: DiscoveredTask; score: number }>,
  ): Briefing['timeBlocks'] {
    if (events.length === 0) return [];

    // Sort events by start time
    const sorted = [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );

    const freeBlocks: Briefing['timeBlocks'] = [];
    const workDayStart = 9; // 9 AM
    const workDayEnd = 17;  // 5 PM

    // Find gaps between meetings
    const today = new Date();
    today.setHours(workDayStart, 0, 0, 0);
    let cursor = today.toISOString();

    for (const event of sorted) {
      const eventStart = new Date(event.start);
      const cursorDate = new Date(cursor);

      if (eventStart > cursorDate) {
        const gapMinutes = (eventStart.getTime() - cursorDate.getTime()) / 60000;
        if (gapMinutes >= 30) {
          // Suggest the highest priority unassigned task for this block
          const suggestedTask = scoredTasks[freeBlocks.length];
          freeBlocks.push({
            start: cursor,
            end: event.start,
            taskId: suggestedTask?.task.source.id ?? null,
            label: suggestedTask
              ? `Deep work: ${suggestedTask.task.title}`
              : 'Free block',
          });
        }
      }
      cursor = event.end;
    }

    // Check for free time after last meeting until end of work day
    const endOfDay = new Date(today);
    endOfDay.setHours(workDayEnd, 0, 0, 0);
    const cursorDate = new Date(cursor);
    if (cursorDate < endOfDay) {
      const suggestedTask = scoredTasks[freeBlocks.length];
      freeBlocks.push({
        start: cursor,
        end: endOfDay.toISOString(),
        taskId: suggestedTask?.task.source.id ?? null,
        label: suggestedTask
          ? `Deep work: ${suggestedTask.task.title}`
          : 'Free block',
      });
    }

    return freeBlocks;
  }

  private generateAlerts(
    statuses: Record<ConnectorType, string>,
  ): Briefing['alerts'] {
    const alerts: Briefing['alerts'] = [];

    for (const [connector, status] of Object.entries(statuses)) {
      if (status === 'error' || status === 'unreachable') {
        alerts.push({
          type: 'connector_unavailable',
          message: `${connector} connector was ${status}. Briefing may be incomplete.`,
          severity: 'warning',
        });
      }
    }

    return alerts;
  }
}
