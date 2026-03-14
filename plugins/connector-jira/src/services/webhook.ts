import { API_BASE_PATH } from '@openclaw-enterprise/shared/constants.js';
import type { HttpRouteRegistration } from '../openclaw-types.js';

/**
 * Parsed Jira webhook event, ready for consumption by work-tracking plugin.
 */
export interface JiraWebhookEvent {
  eventType: JiraEventType;
  issueKey: string;
  projectKey: string;
  timestamp: string;
  user: {
    displayName: string;
    emailAddress: string;
  };
  changes: JiraChangeItem[];
  comment?: {
    id: string;
    body: string;
    author: string;
  };
}

export type JiraEventType =
  | 'issue_created'
  | 'issue_updated'
  | 'issue_deleted'
  | 'comment_added'
  | 'comment_updated'
  | 'issue_assigned'
  | 'status_changed'
  | 'unknown';

export interface JiraChangeItem {
  field: string;
  fromValue: string | null;
  toValue: string | null;
}

/**
 * Raw Jira webhook payload shape (subset).
 */
interface JiraWebhookPayload {
  webhookEvent: string;
  timestamp: number;
  user?: {
    displayName: string;
    emailAddress: string;
  };
  issue?: {
    key: string;
    fields: {
      project: { key: string };
      [key: string]: unknown;
    };
  };
  changelog?: {
    items: Array<{
      field: string;
      fromString: string | null;
      toString: string | null;
    }>;
  };
  comment?: {
    id: string;
    body: string;
    author?: {
      displayName: string;
    };
  };
}

export type EventEmitter = (event: string, data: JiraWebhookEvent) => void;

/**
 * Jira webhook handler.
 * Receives incoming Jira webhooks, parses them into structured events,
 * and emits them for the work-tracking plugin to consume.
 */
export class JiraWebhookHandler {
  constructor(private readonly emitEvent: EventEmitter) {}

  /**
   * Returns the HTTP route registration for the webhook endpoint.
   */
  getRouteRegistration(): HttpRouteRegistration {
    return {
      method: 'POST',
      path: `${API_BASE_PATH}/webhooks/jira`,
      handler: async (req: unknown, res: unknown) => {
        await this.handleWebhook(req, res);
      },
    };
  }

  /**
   * Handle an incoming Jira webhook request.
   */
  async handleWebhook(req: unknown, res: unknown): Promise<void> {
    const request = req as { body: JiraWebhookPayload; headers: Record<string, string> };
    const response = res as {
      status: (code: number) => { json: (body: unknown) => void };
    };

    try {
      const payload = request.body;

      if (!payload || !payload.webhookEvent) {
        response.status(400).json({ error: 'Invalid webhook payload' });
        return;
      }

      const event = this.parseEvent(payload);
      this.emitEvent('connector.jira.event', event);

      response.status(200).json({ received: true, eventType: event.eventType });
    } catch {
      response.status(500).json({ error: 'Internal error processing webhook' });
    }
  }

  /**
   * Parse a raw Jira webhook payload into a structured JiraWebhookEvent.
   */
  parseEvent(payload: JiraWebhookPayload): JiraWebhookEvent {
    const eventType = this.classifyEvent(payload);
    const changes: JiraChangeItem[] = (payload.changelog?.items ?? []).map((item) => ({
      field: item.field,
      fromValue: item.fromString,
      toValue: item.toString,
    }));

    return {
      eventType,
      issueKey: payload.issue?.key ?? 'unknown',
      projectKey: payload.issue?.fields.project.key ?? 'unknown',
      timestamp: new Date(payload.timestamp).toISOString(),
      user: {
        displayName: payload.user?.displayName ?? 'unknown',
        emailAddress: payload.user?.emailAddress ?? 'unknown',
      },
      changes,
      comment: payload.comment
        ? {
            id: payload.comment.id,
            body: payload.comment.body,
            author: payload.comment.author?.displayName ?? 'unknown',
          }
        : undefined,
    };
  }

  private classifyEvent(payload: JiraWebhookPayload): JiraEventType {
    const event = payload.webhookEvent;

    if (event === 'jira:issue_created') return 'issue_created';
    if (event === 'jira:issue_deleted') return 'issue_deleted';

    if (event === 'comment_created') return 'comment_added';
    if (event === 'comment_updated') return 'comment_updated';

    if (event === 'jira:issue_updated') {
      const changes = payload.changelog?.items ?? [];

      const hasAssigneeChange = changes.some((c) => c.field === 'assignee');
      if (hasAssigneeChange) return 'issue_assigned';

      const hasStatusChange = changes.some((c) => c.field === 'status');
      if (hasStatusChange) return 'status_changed';

      return 'issue_updated';
    }

    return 'unknown';
  }
}
