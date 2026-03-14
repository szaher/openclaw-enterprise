# Skill: GitHub Connector

## When to Use

Use the GitHub connector tools when you need to look up pull requests, check review requests, or fetch issues from a GitHub repository. This connector is read-only in the current phase.

## Available Tools

### github_pr_read
Fetches pull requests from a GitHub repository.

**Parameters:**
- `owner` (required): Repository owner (user or organization)
- `repo` (required): Repository name
- `state` (optional): Filter by PR state - "open", "closed", or "all" (default: "open")
- `reviewRequested` (optional): Filter by review-requested user login
- `maxResults` (optional): Maximum number of PRs to return (default: 50)

**Returns:** Structured PR data including number, title, state, draft status, merge status, author, branches, labels, and requested reviewers.

### github_issue_read
Fetches issues from a GitHub repository.

**Parameters:**
- `owner` (required): Repository owner (user or organization)
- `repo` (required): Repository name
- `state` (optional): Filter by issue state - "open", "closed", or "all" (default: "open")
- `assignee` (optional): Filter by assignee login
- `labels` (optional): Comma-separated list of label names
- `maxResults` (optional): Maximum number of issues to return (default: 50)

**Returns:** Structured issue data including number, title, state, author, assignees, labels, and milestone.

## How It Works

- Every read operation is evaluated against the enterprise policy engine before execution
- All data access is audit-logged with classification metadata
- Data classification propagates automatically (GitHub data defaults to "public")
- Raw API responses are discarded after structured extraction (ephemeral data handling)
- OAuth revocation is detected and the connector gracefully disables itself

## Webhook Events

The connector also receives GitHub webhooks and emits structured events:
- `pr_opened`, `pr_closed`, `pr_merged`, `pr_review_requested`
- `issue_opened`, `issue_closed`, `issue_reopened`

These events are consumed by the work-tracking plugin to keep task state synchronized.

## Limitations

- Read-only in current phase (no PR creation, issue creation, or comments)
- Requires valid OAuth or PAT credentials configured for the tenant
- Subject to enterprise policy restrictions on data classification
- GitHub API rate limits apply (5000 requests/hour for authenticated requests)
