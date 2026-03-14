import type {
  ConnectorReadResult,
  ConnectorType,
  DataClassificationLevel,
} from '@openclaw-enterprise/shared/types.js';

export interface DiscoveredTask {
  title: string;
  description: string;
  source: {
    system: string;
    id: string;
    url: string;
  };
  classification: DataClassificationLevel;
  deadline: string | null;
  urgencySignals: {
    senderSeniority: number | null;
    followUpCount: number;
    slaTimer: string | null;
    blockingRelationships: string[];
  };
  discoveredAt: string;
}

export interface ConnectorReader {
  type: ConnectorType;
  read(params: Record<string, unknown>): Promise<ConnectorReadResult>;
}

/**
 * Scans all active connectors to discover task-like items.
 * Also includes Slack messages from OpenClaw's existing session data.
 *
 * Extracts tasks from:
 * - Gmail: emails with action items, follow-ups, requests
 * - GCal: meetings with action items, deadlines
 * - Jira: assigned tickets, mentioned tickets
 * - GitHub: PRs needing review, assigned issues
 * - GDrive: documents with pending comments/suggestions
 * - Slack (via OpenClaw session data): messages with requests, mentions
 */
export class TaskDiscoveryScanner {
  constructor(
    private readonly connectors: ConnectorReader[],
    private readonly getSlackMessages?: () => Promise<ConnectorReadResult>,
  ) {}

  async scan(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];
    const connectorStatuses: Record<string, string> = {};

    // Scan each connector in parallel
    const results = await Promise.allSettled(
      this.connectors.map(async (connector) => {
        const result = await connector.read({});
        connectorStatuses[connector.type] = result.connectorStatus;
        return { type: connector.type, result };
      }),
    );

    for (const settled of results) {
      if (settled.status === 'rejected') {
        continue; // Graceful degradation — skip unavailable connectors
      }

      const { type, result } = settled.value;
      if (result.connectorStatus === 'error') {
        continue;
      }

      for (const item of result.items) {
        tasks.push(this.extractTask(type, item));
      }
    }

    // Include Slack messages from OpenClaw session data
    if (this.getSlackMessages) {
      try {
        const slackResult = await this.getSlackMessages();
        for (const item of slackResult.items) {
          tasks.push(this.extractTask('slack' as ConnectorType, item));
        }
      } catch {
        // Slack data is optional — don't fail the scan
      }
    }

    return tasks;
  }

  private extractTask(
    connectorType: string,
    item: ConnectorReadResult['items'][0],
  ): DiscoveredTask {
    return {
      title: item.title,
      description: item.summary,
      source: {
        system: connectorType,
        id: item.sourceId,
        url: item.url,
      },
      classification: item.classification,
      deadline: (item.metadata.deadline as string) ?? null,
      urgencySignals: {
        senderSeniority: (item.metadata.senderSeniority as number) ?? null,
        followUpCount: (item.metadata.followUpCount as number) ?? 0,
        slaTimer: (item.metadata.slaTimer as string) ?? null,
        blockingRelationships: (item.metadata.blockingRelationships as string[]) ?? [],
      },
      discoveredAt: new Date().toISOString(),
    };
  }
}
