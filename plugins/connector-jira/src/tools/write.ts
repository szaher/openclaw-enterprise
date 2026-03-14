import { ConnectorBase } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorWriteResult, DataClassificationLevel } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { AI_DISCLOSURE_LABEL } from '@openclaw-enterprise/shared/constants.js';

/**
 * Jira connector — write tools for creating issues, adding comments,
 * and transitioning issue status.
 * Extends ConnectorBase to get policy evaluation, audit logging,
 * and OAuth revocation detection on every write operation.
 */
export class JiraWriteTools extends ConnectorBase {
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
   * jira_comment — Add a comment to an existing Jira issue.
   * The AI disclosure label is appended to all comments.
   */
  async jiraComment(params: {
    issueKey: string;
    body: string;
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';
    const commentBody = `${params.body}\n\n_${AI_DISCLOSURE_LABEL}_`;

    return this.executeWrite(
      'jira_comment',
      { issueKey: params.issueKey, body: commentBody },
      async () => {
        const url = `${this.baseUrl}/rest/api/3/issue/${params.issueKey}/comment`;
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify({
            body: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: commentBody }],
                },
              ],
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
        }

        const result = (await response.json()) as { id: string };
        return { sourceId: `${params.issueKey}/comment/${result.id}` };
      },
      classification,
    );
  }

  /**
   * jira_transition — Transition a Jira issue to a new status.
   * The target status must be allowed by policy constraints (allowedTransitions).
   */
  async jiraTransition(params: {
    issueKey: string;
    transitionId: string;
    transitionName: string;
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';

    return this.executeWrite(
      'jira_transition',
      {
        issueKey: params.issueKey,
        transitionId: params.transitionId,
        transitionName: params.transitionName,
      },
      async () => {
        const url = `${this.baseUrl}/rest/api/3/issue/${params.issueKey}/transitions`;
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify({
            transition: { id: params.transitionId },
          }),
        });

        if (!response.ok) {
          throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
        }

        return { sourceId: params.issueKey };
      },
      classification,
    );
  }

  /**
   * jira_create — Create a new Jira issue.
   * Requires project key, summary, and issue type at minimum.
   */
  async jiraCreate(params: {
    projectKey: string;
    summary: string;
    issueType: string;
    description?: string;
    priority?: string;
    labels?: string[];
    assignee?: string;
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';

    return this.executeWrite(
      'jira_create',
      {
        projectKey: params.projectKey,
        summary: params.summary,
        issueType: params.issueType,
      },
      async () => {
        const url = `${this.baseUrl}/rest/api/3/issue`;

        const fields: Record<string, unknown> = {
          project: { key: params.projectKey },
          summary: params.summary,
          issuetype: { name: params.issueType },
        };

        if (params.description) {
          fields['description'] = {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: params.description }],
              },
            ],
          };
        }

        if (params.priority) {
          fields['priority'] = { name: params.priority };
        }

        if (params.labels) {
          fields['labels'] = params.labels;
        }

        if (params.assignee) {
          fields['assignee'] = { name: params.assignee };
        }

        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify({ fields }),
        });

        if (!response.ok) {
          throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
        }

        const result = (await response.json()) as { key: string };
        return { sourceId: result.key };
      },
      classification,
    );
  }
}
