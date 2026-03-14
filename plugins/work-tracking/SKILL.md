# Skill: Work Tracking Auto-Updates

## When to Use

Use the work-tracking plugin when you need to automatically update Jira tickets from GitHub PR events, correlate PRs with tickets, or generate end-of-day standup summaries from development activity.

## Available Tools

### standup_summary
Generates an end-of-day standup summary aggregating code activity, PR events, and Jira ticket updates.

**Parameters:**
- `userId` (required): User identifier
- `date` (optional): ISO date string (e.g., "2026-03-13"). Defaults to today.

**Returns:** Structured standup summary with merged PRs, opened PRs, closed PRs, updated tickets, and human-readable summary text.

## How It Works

### PR-to-Jira Correlation
- Extracts Jira ticket keys (e.g., PROJ-123) from PR branch names, titles, and descriptions
- Supports multiple ticket references in a single PR
- Common branch patterns: `feature/PROJ-123-fix-bug`, `bugfix/PROJ-456`, `PROJ-789-some-fix`

### Auto-Updates on PR Merge
When a PR is merged on GitHub:
1. The work-tracking plugin receives the webhook event via connector-github
2. It correlates the PR with Jira tickets using branch name, title, and description
3. It adds a summary comment to each linked Jira ticket with PR details and link
4. It optionally transitions the ticket status (e.g., to "Done") if allowed by policy

### Policy Governance
- Every Jira write (comment, transition) is evaluated against the policy engine before execution
- Transitions are constrained by policy `allowedTransitions` list
- All operations are audit-logged with full traceability

### Standup Summaries
- Aggregates all PR and ticket activity for a given day
- Groups by: merged, opened, closed PRs, and updated tickets
- Produces a human-readable summary suitable for team standup reports

## Webhook Events Consumed

- `connector.github.event` with `eventType`: `pr_merged`, `pr_opened`, `pr_closed`

## Limitations

- Requires connector-github and connector-jira plugins to be active
- Ticket key extraction depends on consistent use of Jira key format (PROJECT-123) in branch names or PR descriptions
- Transition mapping must be configured per project (transition IDs vary by Jira workflow)
