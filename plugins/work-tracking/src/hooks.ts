import type { HookRegistration } from './openclaw-types.js';
import { correlatePrToJira } from './correlation/pr-jira.js';
import type {
  TicketUpdater,
  PrMergeDetails,
} from './updater/updater.js';

/**
 * GitHub webhook event shape as emitted by connector-github.
 * Matches GitHubWebhookEvent from plugins/connector-github/src/services/webhook.ts.
 */
export interface GitHubWebhookEvent {
  eventType: string;
  action: string;
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  timestamp: string;
  sender: string;
  pullRequest?: {
    number: number;
    title: string;
    state: string;
    author: string;
    headRef: string;
    baseRef: string;
    merged: boolean;
    url: string;
    description?: string;
  };
}

/**
 * Configuration for work-tracking hooks.
 */
export interface WorkTrackingHookConfig {
  /** Default transition to apply when a PR is merged (e.g., "Done") */
  defaultMergeTransition?: { id: string; name: string };
}

/**
 * Activity record for standup summary aggregation.
 */
export interface ActivityRecord {
  type: 'pr_merged' | 'pr_opened' | 'pr_closed' | 'ticket_updated';
  timestamp: string;
  summary: string;
  ticketKeys: string[];
  prNumber?: number;
  repository?: string;
}

/**
 * Create hook registrations for work-tracking plugin.
 * Listens for GitHub webhook events (PR merge/open/close) and triggers
 * the correlation + Jira update pipeline.
 */
export function createWorkTrackingHooks(
  updater: TicketUpdater,
  config: WorkTrackingHookConfig,
  activityLog: ActivityRecord[],
): HookRegistration[] {
  return [
    {
      event: 'connector.github.event',
      handler: async (context: Record<string, unknown>) => {
        const event = context as unknown as GitHubWebhookEvent;

        if (!event.pullRequest) {
          return;
        }

        const pr = event.pullRequest;
        const repo = event.repository;

        // Correlate PR to Jira tickets
        const correlation = correlatePrToJira({
          branchName: pr.headRef,
          title: pr.title,
          description: pr.description ?? '',
        });

        if (correlation.ticketKeys.length === 0) {
          // No Jira tickets found, record activity without ticket link
          activityLog.push({
            type: mapEventType(event.eventType),
            timestamp: event.timestamp,
            summary: `PR #${pr.number}: ${pr.title} (${repo.fullName})`,
            ticketKeys: [],
            prNumber: pr.number,
            repository: repo.fullName,
          });
          return;
        }

        // Handle PR merge: update linked Jira tickets
        if (event.eventType === 'pr_merged' && pr.merged) {
          const prDetails: PrMergeDetails = {
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.url,
            author: pr.author,
            repository: repo.fullName,
            baseBranch: pr.baseRef,
            headBranch: pr.headRef,
            mergedAt: event.timestamp,
          };

          await updater.updateTicketsForMerge(
            correlation.ticketKeys,
            prDetails,
            config.defaultMergeTransition,
          );

          activityLog.push({
            type: 'pr_merged',
            timestamp: event.timestamp,
            summary: `PR #${pr.number} merged: ${pr.title} (${repo.fullName}) -> ${correlation.ticketKeys.join(', ')}`,
            ticketKeys: correlation.ticketKeys,
            prNumber: pr.number,
            repository: repo.fullName,
          });
        } else {
          // PR opened or closed (not merged) — record activity only
          activityLog.push({
            type: mapEventType(event.eventType),
            timestamp: event.timestamp,
            summary: `PR #${pr.number}: ${pr.title} (${repo.fullName}) -> ${correlation.ticketKeys.join(', ')}`,
            ticketKeys: correlation.ticketKeys,
            prNumber: pr.number,
            repository: repo.fullName,
          });
        }
      },
    },
  ];
}

function mapEventType(
  eventType: string,
): 'pr_merged' | 'pr_opened' | 'pr_closed' | 'ticket_updated' {
  switch (eventType) {
    case 'pr_merged':
      return 'pr_merged';
    case 'pr_opened':
      return 'pr_opened';
    case 'pr_closed':
      return 'pr_closed';
    default:
      return 'pr_closed';
  }
}
