import { ConnectorBase } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

/**
 * Raw Jira issue shape returned by the Jira REST API.
 * Only the fields we extract are typed; everything else is discarded.
 */
interface JiraIssueRaw {
  key: string;
  id: string;
  self: string;
  fields: {
    summary: string;
    description: string | null;
    status: { name: string };
    priority: { name: string };
    assignee: { displayName: string; emailAddress: string } | null;
    reporter: { displayName: string; emailAddress: string } | null;
    issuetype: { name: string };
    project: { key: string; name: string };
    labels: string[];
    updated: string;
    created: string;
    duedate: string | null;
    [key: string]: unknown;
  };
}

interface JiraSearchResponse {
  issues: JiraIssueRaw[];
  total: number;
  maxResults: number;
  startAt: number;
}

/**
 * Jira connector — read-only tools for fetching issues.
 * Extends ConnectorBase to get policy evaluation, audit logging,
 * classification propagation, and OAuth revocation detection.
 */
export class JiraReadTools extends ConnectorBase {
  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    private readonly baseUrl: string,
    private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
    private readonly authHeaders: Record<string, string> = {},
  ) {
    super('jira', gateway, tenantId, userId);
  }

  /**
   * jira_read — Fetch issues assigned to the current user.
   */
  async jiraRead(params: {
    maxResults?: number;
    statusFilter?: string;
  }): Promise<ConnectorReadResult> {
    const maxResults = params.maxResults ?? 50;
    const statusFilter = params.statusFilter
      ? ` AND status = "${params.statusFilter}"`
      : '';
    const jql = `assignee = currentUser()${statusFilter} ORDER BY updated DESC`;

    return this.executeRead(
      'jira_read',
      { jql, maxResults },
      () => this.fetchJql(jql, maxResults),
      (raw) => this.extractIssues(raw),
    );
  }

  /**
   * jira_search — Execute a JQL search query.
   */
  async jiraSearch(params: {
    jql: string;
    maxResults?: number;
  }): Promise<ConnectorReadResult> {
    const maxResults = params.maxResults ?? 50;

    return this.executeRead(
      'jira_search',
      { jql: params.jql, maxResults },
      () => this.fetchJql(params.jql, maxResults),
      (raw) => this.extractIssues(raw),
    );
  }

  /**
   * Fetch issues from Jira REST API v3 using JQL.
   */
  private async fetchJql(jql: string, maxResults: number): Promise<JiraSearchResponse> {
    const url = new URL(`${this.baseUrl}/rest/api/3/search`);
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set(
      'fields',
      'summary,description,status,priority,assignee,reporter,issuetype,project,labels,updated,created,duedate',
    );

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...this.authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as JiraSearchResponse;
  }

  /**
   * Extract structured ConnectorReadResult items from raw Jira API response.
   * Raw data is discarded after extraction per ephemeral data policy.
   */
  private extractIssues(raw: JiraSearchResponse): ConnectorReadResult {
    const items = raw.issues.map((issue) => ({
      id: issue.key,
      source: 'jira',
      sourceId: issue.key,
      title: issue.fields.summary,
      summary: this.buildIssueSummary(issue),
      classification: 'internal' as const,
      url: `${this.baseUrl}/browse/${issue.key}`,
      metadata: {
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        priority: issue.fields.priority.name,
        project: issue.fields.project.key,
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        labels: issue.fields.labels,
        dueDate: issue.fields.duedate,
      },
      timestamp: issue.fields.updated,
    }));

    return {
      items,
      connectorStatus: 'ok',
    };
  }

  private buildIssueSummary(issue: JiraIssueRaw): string {
    const parts = [
      `[${issue.key}] ${issue.fields.summary}`,
      `Type: ${issue.fields.issuetype.name}`,
      `Status: ${issue.fields.status.name}`,
      `Priority: ${issue.fields.priority.name}`,
      `Project: ${issue.fields.project.name}`,
    ];

    if (issue.fields.assignee) {
      parts.push(`Assignee: ${issue.fields.assignee.displayName}`);
    }
    if (issue.fields.duedate) {
      parts.push(`Due: ${issue.fields.duedate}`);
    }

    return parts.join(' | ');
  }
}
