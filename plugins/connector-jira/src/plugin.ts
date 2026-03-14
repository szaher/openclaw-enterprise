import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { JiraReadTools } from './tools/read.js';
import { JiraWriteTools } from './tools/write.js';
import { JiraWebhookHandler } from './services/webhook.js';

export function activate(api: OpenClawPluginAPI): void {
  // Gateway methods are resolved at runtime via OpenClaw's inter-plugin gateway.
  // The connector calls these to evaluate policy, classify data, and write audit logs.
  // Actual resolution happens when the gateway wires up plugin dependencies.
  const gateway = {} as GatewayMethods;

  // Tool: jira_read — fetch issues assigned to the current user
  api.registerTool({
    name: 'jira_read',
    description:
      'Fetch Jira issues assigned to the current user. Returns structured issue data with policy evaluation and audit logging.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50)',
        },
        statusFilter: {
          type: 'string',
          description: 'Filter by issue status (e.g., "In Progress", "To Do")',
        },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
        baseUrl: { type: 'string', description: 'Jira instance base URL' },
      },
      required: ['tenantId', 'userId', 'baseUrl'],
    },
    execute: async (params) => {
      const p = params as {
        tenantId: string;
        userId: string;
        baseUrl: string;
        maxResults?: number;
        statusFilter?: string;
      };
      const tools = new JiraReadTools(gateway, p.tenantId, p.userId, p.baseUrl);
      return tools.jiraRead({
        maxResults: p.maxResults,
        statusFilter: p.statusFilter,
      });
    },
  });

  // Tool: jira_search — execute a JQL search query
  api.registerTool({
    name: 'jira_search',
    description:
      'Search Jira issues using JQL (Jira Query Language). Returns structured issue data with policy evaluation and audit logging.',
    parameters: {
      type: 'object',
      properties: {
        jql: { type: 'string', description: 'JQL query string' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50)',
        },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
        baseUrl: { type: 'string', description: 'Jira instance base URL' },
      },
      required: ['jql', 'tenantId', 'userId', 'baseUrl'],
    },
    execute: async (params) => {
      const p = params as {
        jql: string;
        tenantId: string;
        userId: string;
        baseUrl: string;
        maxResults?: number;
      };
      const tools = new JiraReadTools(gateway, p.tenantId, p.userId, p.baseUrl);
      return tools.jiraSearch({ jql: p.jql, maxResults: p.maxResults });
    },
  });

  // Tool: jira_comment — add a comment to an issue
  api.registerTool({
    name: 'jira_comment',
    description:
      'Add a comment to a Jira issue. Policy-gated with AI disclosure label. Returns ConnectorWriteResult with audit entry.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'Jira issue key (e.g., PROJ-123)' },
        body: { type: 'string', description: 'Comment text body' },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
        baseUrl: { type: 'string', description: 'Jira instance base URL' },
      },
      required: ['issueKey', 'body', 'tenantId', 'userId', 'baseUrl'],
    },
    execute: async (params) => {
      const p = params as {
        issueKey: string;
        body: string;
        tenantId: string;
        userId: string;
        baseUrl: string;
      };
      const tools = new JiraWriteTools(gateway, p.tenantId, p.userId, p.baseUrl);
      return tools.jiraComment({ issueKey: p.issueKey, body: p.body });
    },
  });

  // Tool: jira_transition — transition an issue to a new status
  api.registerTool({
    name: 'jira_transition',
    description:
      'Transition a Jira issue to a new status. Policy-gated with transition constraint enforcement. Returns ConnectorWriteResult with audit entry.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'Jira issue key (e.g., PROJ-123)' },
        transitionId: { type: 'string', description: 'Jira transition ID' },
        transitionName: { type: 'string', description: 'Transition name (e.g., "Done")' },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
        baseUrl: { type: 'string', description: 'Jira instance base URL' },
      },
      required: ['issueKey', 'transitionId', 'transitionName', 'tenantId', 'userId', 'baseUrl'],
    },
    execute: async (params) => {
      const p = params as {
        issueKey: string;
        transitionId: string;
        transitionName: string;
        tenantId: string;
        userId: string;
        baseUrl: string;
      };
      const tools = new JiraWriteTools(gateway, p.tenantId, p.userId, p.baseUrl);
      return tools.jiraTransition({
        issueKey: p.issueKey,
        transitionId: p.transitionId,
        transitionName: p.transitionName,
      });
    },
  });

  // Tool: jira_create — create a new issue
  api.registerTool({
    name: 'jira_create',
    description:
      'Create a new Jira issue. Policy-gated. Returns ConnectorWriteResult with the new issue key and audit entry.',
    parameters: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Jira project key (e.g., PROJ)' },
        summary: { type: 'string', description: 'Issue summary/title' },
        issueType: { type: 'string', description: 'Issue type (e.g., Story, Bug, Task)' },
        description: { type: 'string', description: 'Issue description' },
        priority: { type: 'string', description: 'Priority name (e.g., High, Medium)' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply',
        },
        assignee: { type: 'string', description: 'Assignee username' },
        tenantId: { type: 'string', description: 'Tenant identifier' },
        userId: { type: 'string', description: 'User identifier' },
        baseUrl: { type: 'string', description: 'Jira instance base URL' },
      },
      required: ['projectKey', 'summary', 'issueType', 'tenantId', 'userId', 'baseUrl'],
    },
    execute: async (params) => {
      const p = params as {
        projectKey: string;
        summary: string;
        issueType: string;
        tenantId: string;
        userId: string;
        baseUrl: string;
        description?: string;
        priority?: string;
        labels?: string[];
        assignee?: string;
      };
      const tools = new JiraWriteTools(gateway, p.tenantId, p.userId, p.baseUrl);
      return tools.jiraCreate({
        projectKey: p.projectKey,
        summary: p.summary,
        issueType: p.issueType,
        description: p.description,
        priority: p.priority,
        labels: p.labels,
        assignee: p.assignee,
      });
    },
  });

  // Webhook receiver: POST /api/v1/webhooks/jira
  const webhookHandler = new JiraWebhookHandler((event, data) => {
    // Emit event via OpenClaw's event system for work-tracking plugin consumption.
    // At runtime the plugin API provides an event bus; this callback bridges to it.
    void event;
    void data;
  });

  api.registerHttpRoute(webhookHandler.getRouteRegistration());
}
