import type { ActivityRecord } from '../hooks.js';

/**
 * Structured standup summary for end-of-day reporting.
 */
export interface StandupSummary {
  /** Date of the standup (ISO date string, e.g., "2026-03-13") */
  date: string;
  /** User identifier */
  userId: string;
  /** PRs merged during the day */
  prsMerged: PrSummaryItem[];
  /** PRs opened during the day */
  prsOpened: PrSummaryItem[];
  /** PRs closed (not merged) during the day */
  prsClosed: PrSummaryItem[];
  /** Jira tickets updated (via auto-update) */
  ticketsUpdated: string[];
  /** Total activity count */
  totalActivities: number;
  /** Human-readable summary text */
  summaryText: string;
}

export interface PrSummaryItem {
  prNumber: number;
  summary: string;
  repository: string;
  linkedTickets: string[];
  timestamp: string;
}

/**
 * Generate an end-of-day standup summary from accumulated activity records.
 *
 * Aggregates code activity, PR events, and ticket updates into a structured
 * daily standup report.
 */
export function generateStandupSummary(
  userId: string,
  date: string,
  activities: ActivityRecord[],
): StandupSummary {
  // Filter activities to the given date
  const dayActivities = activities.filter((a) => a.timestamp.startsWith(date));

  const prsMerged: PrSummaryItem[] = [];
  const prsOpened: PrSummaryItem[] = [];
  const prsClosed: PrSummaryItem[] = [];
  const ticketsUpdatedSet = new Set<string>();

  for (const activity of dayActivities) {
    const item: PrSummaryItem = {
      prNumber: activity.prNumber ?? 0,
      summary: activity.summary,
      repository: activity.repository ?? '',
      linkedTickets: activity.ticketKeys,
      timestamp: activity.timestamp,
    };

    switch (activity.type) {
      case 'pr_merged':
        prsMerged.push(item);
        break;
      case 'pr_opened':
        prsOpened.push(item);
        break;
      case 'pr_closed':
        prsClosed.push(item);
        break;
      case 'ticket_updated':
        // ticket_updated is tracked via ticketKeys
        break;
    }

    for (const key of activity.ticketKeys) {
      ticketsUpdatedSet.add(key);
    }
  }

  const ticketsUpdated = [...ticketsUpdatedSet];
  const totalActivities = dayActivities.length;

  const summaryText = buildSummaryText(
    prsMerged,
    prsOpened,
    prsClosed,
    ticketsUpdated,
  );

  return {
    date,
    userId,
    prsMerged,
    prsOpened,
    prsClosed,
    ticketsUpdated,
    totalActivities,
    summaryText,
  };
}

function buildSummaryText(
  prsMerged: PrSummaryItem[],
  prsOpened: PrSummaryItem[],
  prsClosed: PrSummaryItem[],
  ticketsUpdated: string[],
): string {
  const parts: string[] = [];

  if (prsMerged.length > 0) {
    parts.push(`Merged ${prsMerged.length} PR(s): ${prsMerged.map((p) => `#${p.prNumber}`).join(', ')}`);
  }

  if (prsOpened.length > 0) {
    parts.push(`Opened ${prsOpened.length} PR(s): ${prsOpened.map((p) => `#${p.prNumber}`).join(', ')}`);
  }

  if (prsClosed.length > 0) {
    parts.push(`Closed ${prsClosed.length} PR(s): ${prsClosed.map((p) => `#${p.prNumber}`).join(', ')}`);
  }

  if (ticketsUpdated.length > 0) {
    parts.push(`Updated ${ticketsUpdated.length} ticket(s): ${ticketsUpdated.join(', ')}`);
  }

  if (parts.length === 0) {
    return 'No tracked activity for this day.';
  }

  return parts.join('. ') + '.';
}
