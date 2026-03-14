import { API_BASE_PATH } from '@openclaw-enterprise/shared/constants.js';
import type { HttpRouteRegistration } from '../openclaw-types.js';

/**
 * Parsed GitHub webhook event, ready for consumption by work-tracking plugin.
 */
export interface GitHubWebhookEvent {
  eventType: GitHubEventType;
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
  };
  issue?: {
    number: number;
    title: string;
    state: string;
    author: string;
    url: string;
  };
  reviewRequested?: {
    reviewer: string;
  };
}

export type GitHubEventType =
  | 'pr_opened'
  | 'pr_closed'
  | 'pr_merged'
  | 'pr_review_requested'
  | 'issue_opened'
  | 'issue_closed'
  | 'issue_reopened'
  | 'unknown';

/**
 * Raw GitHub webhook payload shapes (subset).
 */
interface GitHubWebhookPayload {
  action: string;
  sender: {
    login: string;
  };
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  pull_request?: {
    number: number;
    title: string;
    state: string;
    merged: boolean;
    html_url: string;
    user: { login: string };
    head: { ref: string };
    base: { ref: string };
  };
  issue?: {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
  };
  requested_reviewer?: {
    login: string;
  };
}

export type EventEmitter = (event: string, data: GitHubWebhookEvent) => void;

/**
 * GitHub webhook handler.
 * Receives incoming GitHub webhooks, parses them into structured events,
 * and emits them for the work-tracking plugin to consume.
 */
export class GitHubWebhookHandler {
  constructor(private readonly emitEvent: EventEmitter) {}

  /**
   * Returns the HTTP route registration for the webhook endpoint.
   */
  getRouteRegistration(): HttpRouteRegistration {
    return {
      method: 'POST',
      path: `${API_BASE_PATH}/webhooks/github`,
      handler: async (req: unknown, res: unknown) => {
        await this.handleWebhook(req, res);
      },
    };
  }

  /**
   * Handle an incoming GitHub webhook request.
   */
  async handleWebhook(req: unknown, res: unknown): Promise<void> {
    const request = req as {
      body: GitHubWebhookPayload;
      headers: Record<string, string>;
    };
    const response = res as {
      status: (code: number) => { json: (body: unknown) => void };
    };

    try {
      const payload = request.body;
      const githubEvent = request.headers['x-github-event'];

      if (!payload || !payload.action || !githubEvent) {
        response.status(400).json({ error: 'Invalid webhook payload' });
        return;
      }

      const event = this.parseEvent(payload, githubEvent);
      this.emitEvent('connector.github.event', event);

      response.status(200).json({ received: true, eventType: event.eventType });
    } catch {
      response.status(500).json({ error: 'Internal error processing webhook' });
    }
  }

  /**
   * Parse a raw GitHub webhook payload into a structured GitHubWebhookEvent.
   */
  parseEvent(payload: GitHubWebhookPayload, githubEvent: string): GitHubWebhookEvent {
    const eventType = this.classifyEvent(payload, githubEvent);

    const event: GitHubWebhookEvent = {
      eventType,
      action: payload.action,
      repository: {
        owner: payload.repository.owner.login,
        name: payload.repository.name,
        fullName: payload.repository.full_name,
      },
      timestamp: new Date().toISOString(),
      sender: payload.sender.login,
    };

    if (payload.pull_request) {
      event.pullRequest = {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        state: payload.pull_request.state,
        author: payload.pull_request.user.login,
        headRef: payload.pull_request.head.ref,
        baseRef: payload.pull_request.base.ref,
        merged: payload.pull_request.merged,
        url: payload.pull_request.html_url,
      };
    }

    if (payload.issue) {
      event.issue = {
        number: payload.issue.number,
        title: payload.issue.title,
        state: payload.issue.state,
        author: payload.issue.user.login,
        url: payload.issue.html_url,
      };
    }

    if (payload.requested_reviewer) {
      event.reviewRequested = {
        reviewer: payload.requested_reviewer.login,
      };
    }

    return event;
  }

  private classifyEvent(payload: GitHubWebhookPayload, githubEvent: string): GitHubEventType {
    if (githubEvent === 'pull_request') {
      if (payload.action === 'opened') return 'pr_opened';
      if (payload.action === 'closed' && payload.pull_request?.merged) return 'pr_merged';
      if (payload.action === 'closed') return 'pr_closed';
      if (payload.action === 'review_requested') return 'pr_review_requested';
    }

    if (githubEvent === 'issues') {
      if (payload.action === 'opened') return 'issue_opened';
      if (payload.action === 'closed') return 'issue_closed';
      if (payload.action === 'reopened') return 'issue_reopened';
    }

    return 'unknown';
  }
}
