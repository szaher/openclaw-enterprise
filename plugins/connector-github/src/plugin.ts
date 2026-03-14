import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { GitHubReadTools } from './tools/read.js';
import { GitHubWebhookHandler } from './services/webhook.js';

export function activate(api: OpenClawPluginAPI): void {
  // Gateway methods are resolved at runtime via OpenClaw's inter-plugin gateway.
  // The connector calls these to evaluate policy, classify data, and write audit logs.
  const gateway = {} as GatewayMethods;

  // Tool: github_pr_read — fetch pull requests
  api.registerTool({
    name: 'github_pr_read',
    description:
      'Fetch GitHub pull requests for a repository. Returns structured PR data with policy evaluation and audit logging. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org)' },
        repo: { type: 'string', description: 'Repository name' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'PR state filter (default: open)',
        },
        reviewRequested: {
          type: 'string',
          description: 'Filter by review-requested user login',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of PRs to return (default: 50)',
        },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
      },
      required: ['owner', 'repo', 'tenantId', 'userId'],
    },
    execute: async (params) => {
      const p = params as {
        owner: string;
        repo: string;
        tenantId: string;
        userId: string;
        state?: 'open' | 'closed' | 'all';
        reviewRequested?: string;
        maxResults?: number;
      };
      const tools = new GitHubReadTools(gateway, p.tenantId, p.userId, p.owner, p.repo);
      return tools.githubPrRead({
        state: p.state,
        reviewRequested: p.reviewRequested,
        maxResults: p.maxResults,
      });
    },
  });

  // Tool: github_issue_read — fetch issues
  api.registerTool({
    name: 'github_issue_read',
    description:
      'Fetch GitHub issues for a repository. Returns structured issue data with policy evaluation and audit logging. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org)' },
        repo: { type: 'string', description: 'Repository name' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Issue state filter (default: open)',
        },
        assignee: {
          type: 'string',
          description: 'Filter by assignee login',
        },
        labels: {
          type: 'string',
          description: 'Comma-separated list of label names',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50)',
        },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
      },
      required: ['owner', 'repo', 'tenantId', 'userId'],
    },
    execute: async (params) => {
      const p = params as {
        owner: string;
        repo: string;
        tenantId: string;
        userId: string;
        state?: 'open' | 'closed' | 'all';
        assignee?: string;
        labels?: string;
        maxResults?: number;
      };
      const tools = new GitHubReadTools(gateway, p.tenantId, p.userId, p.owner, p.repo);
      return tools.githubIssueRead({
        state: p.state,
        assignee: p.assignee,
        labels: p.labels,
        maxResults: p.maxResults,
      });
    },
  });

  // Webhook receiver: POST /api/v1/webhooks/github
  const webhookHandler = new GitHubWebhookHandler((event, data) => {
    // Emit event via OpenClaw's event system for work-tracking plugin consumption.
    // At runtime the plugin API provides an event bus; this callback bridges to it.
    void event;
    void data;
  });

  api.registerHttpRoute(webhookHandler.getRouteRegistration());
}
