# Skill: Jira Connector

## When to Use

Use the Jira connector tools when you need to look up issues, check assignment status, or search for work items in Jira. This connector is read-only in the current phase.

## Available Tools

### jira_read
Fetches issues assigned to the current user from Jira.

**Parameters:**
- `maxResults` (optional): Maximum number of issues to return (default: 50)
- `statusFilter` (optional): Filter by issue status (e.g., "In Progress", "To Do")

**Returns:** Structured issue data including key, summary, status, priority, assignee, project, labels, and due date.

### jira_search
Searches Jira issues using JQL (Jira Query Language).

**Parameters:**
- `jql` (required): JQL query string (e.g., `project = PROJ AND status = "In Progress"`)
- `maxResults` (optional): Maximum number of issues to return (default: 50)

**Returns:** Same structured issue data as jira_read.

## How It Works

- Every read operation is evaluated against the enterprise policy engine before execution
- All data access is audit-logged with classification metadata
- Data classification propagates automatically (Jira data defaults to "internal")
- Raw API responses are discarded after structured extraction (ephemeral data handling)
- OAuth revocation is detected and the connector gracefully disables itself

## Webhook Events

The connector also receives Jira webhooks and emits structured events:
- `issue_created`, `issue_updated`, `issue_deleted`
- `comment_added`, `comment_updated`
- `issue_assigned`, `status_changed`

These events are consumed by the work-tracking plugin to keep task state synchronized.

## Limitations

- Read-only in current phase (no issue creation, transitions, or comments)
- Requires valid OAuth credentials configured for the tenant
- Subject to enterprise policy restrictions on data classification
