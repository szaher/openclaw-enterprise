import { ConnectorBase } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

/**
 * Raw GitHub PR shape returned by the GitHub REST API.
 */
interface GitHubPullRequestRaw {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  labels: Array<{ name: string }>;
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  requested_reviewers: Array<{ login: string }>;
  repository_url: string;
}

/**
 * Raw GitHub issue shape returned by the GitHub REST API.
 */
interface GitHubIssueRaw {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string; due_on: string | null } | null;
  created_at: string;
  updated_at: string;
  repository_url: string;
}

/**
 * GitHub connector — read-only tools for fetching PRs and issues.
 * Extends ConnectorBase to get policy evaluation, audit logging,
 * classification propagation, and OAuth revocation detection.
 */
export class GitHubReadTools extends ConnectorBase {
  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    private readonly owner: string,
    private readonly repo: string,
    private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
    private readonly authHeaders: Record<string, string> = {},
  ) {
    super('github', gateway, tenantId, userId);
  }

  /**
   * github_pr_read — Fetch pull requests (open, or review-requested).
   */
  async githubPrRead(params: {
    state?: 'open' | 'closed' | 'all';
    reviewRequested?: string;
    maxResults?: number;
  }): Promise<ConnectorReadResult> {
    const state = params.state ?? 'open';
    const perPage = params.maxResults ?? 50;

    return this.executeRead(
      'github_pr_read',
      { owner: this.owner, repo: this.repo, state, perPage, reviewRequested: params.reviewRequested },
      () => this.fetchPullRequests(state, perPage),
      (raw) => this.extractPullRequests(raw),
    );
  }

  /**
   * github_issue_read — Fetch issues assigned to the current user or all issues.
   */
  async githubIssueRead(params: {
    state?: 'open' | 'closed' | 'all';
    assignee?: string;
    labels?: string;
    maxResults?: number;
  }): Promise<ConnectorReadResult> {
    const state = params.state ?? 'open';
    const perPage = params.maxResults ?? 50;

    return this.executeRead(
      'github_issue_read',
      { owner: this.owner, repo: this.repo, state, perPage, assignee: params.assignee, labels: params.labels },
      () => this.fetchIssues(state, perPage, params.assignee, params.labels),
      (raw) => this.extractIssues(raw),
    );
  }

  /**
   * Fetch pull requests from GitHub REST API.
   */
  private async fetchPullRequests(
    state: string,
    perPage: number,
  ): Promise<GitHubPullRequestRaw[]> {
    const url = new URL(`https://api.github.com/repos/${this.owner}/${this.repo}/pulls`);
    url.searchParams.set('state', state);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...this.authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as GitHubPullRequestRaw[];
  }

  /**
   * Fetch issues from GitHub REST API.
   */
  private async fetchIssues(
    state: string,
    perPage: number,
    assignee?: string,
    labels?: string,
  ): Promise<GitHubIssueRaw[]> {
    const url = new URL(`https://api.github.com/repos/${this.owner}/${this.repo}/issues`);
    url.searchParams.set('state', state);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    if (assignee) url.searchParams.set('assignee', assignee);
    if (labels) url.searchParams.set('labels', labels);

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...this.authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as GitHubIssueRaw[];
  }

  /**
   * Extract structured ConnectorReadResult items from raw GitHub PR response.
   * Raw data is discarded after extraction per ephemeral data policy.
   */
  private extractPullRequests(raw: GitHubPullRequestRaw[]): ConnectorReadResult {
    const items = raw.map((pr) => ({
      id: `${this.owner}/${this.repo}#${pr.number}`,
      source: 'github',
      sourceId: `${this.owner}/${this.repo}/pull/${pr.number}`,
      title: pr.title,
      summary: this.buildPrSummary(pr),
      classification: 'public' as const,
      url: pr.html_url,
      metadata: {
        number: pr.number,
        state: pr.state,
        draft: pr.draft,
        merged: pr.merged,
        author: pr.user.login,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        labels: pr.labels.map((l) => l.name),
        requestedReviewers: pr.requested_reviewers.map((r) => r.login),
      },
      timestamp: pr.updated_at,
    }));

    return {
      items,
      connectorStatus: 'ok',
    };
  }

  /**
   * Extract structured ConnectorReadResult items from raw GitHub issue response.
   * Raw data is discarded after extraction per ephemeral data policy.
   */
  private extractIssues(raw: GitHubIssueRaw[]): ConnectorReadResult {
    // GitHub API returns PRs mixed with issues; filter out PRs (they have pull_request key)
    const issuesOnly = raw.filter(
      (item) => !(item as unknown as Record<string, unknown>)['pull_request'],
    );

    const items = issuesOnly.map((issue) => ({
      id: `${this.owner}/${this.repo}#${issue.number}`,
      source: 'github',
      sourceId: `${this.owner}/${this.repo}/issues/${issue.number}`,
      title: issue.title,
      summary: this.buildIssueSummary(issue),
      classification: 'public' as const,
      url: issue.html_url,
      metadata: {
        number: issue.number,
        state: issue.state,
        author: issue.user.login,
        assignees: issue.assignees.map((a) => a.login),
        labels: issue.labels.map((l) => l.name),
        milestone: issue.milestone?.title ?? null,
        milestoneDueOn: issue.milestone?.due_on ?? null,
      },
      timestamp: issue.updated_at,
    }));

    return {
      items,
      connectorStatus: 'ok',
    };
  }

  private buildPrSummary(pr: GitHubPullRequestRaw): string {
    const parts = [
      `#${pr.number} ${pr.title}`,
      `State: ${pr.draft ? 'draft' : pr.state}`,
      `${pr.head.ref} -> ${pr.base.ref}`,
      `Author: ${pr.user.login}`,
    ];

    if (pr.merged) {
      parts.push('MERGED');
    }
    if (pr.requested_reviewers.length > 0) {
      parts.push(`Reviewers: ${pr.requested_reviewers.map((r) => r.login).join(', ')}`);
    }

    return parts.join(' | ');
  }

  private buildIssueSummary(issue: GitHubIssueRaw): string {
    const parts = [
      `#${issue.number} ${issue.title}`,
      `State: ${issue.state}`,
      `Author: ${issue.user.login}`,
    ];

    if (issue.assignees.length > 0) {
      parts.push(`Assignees: ${issue.assignees.map((a) => a.login).join(', ')}`);
    }
    if (issue.milestone) {
      parts.push(`Milestone: ${issue.milestone.title}`);
    }

    return parts.join(' | ');
  }
}
