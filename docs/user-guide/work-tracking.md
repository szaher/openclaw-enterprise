# Work Tracking

OpenClaw Enterprise automatically correlates GitHub pull request activity with Jira tickets and keeps both systems in sync. It detects PR events via webhooks, extracts ticket references, posts summary comments, transitions ticket statuses, and generates end-of-day standup reports from actual activity.

---

## How It Works

```
GitHub PR Event (webhook)
        |
        v
  Extract Jira ticket keys
  (branch name + PR description)
        |
        v
  Match to Jira tickets
        |
        v
  Policy check: write authorized?
        |
   +----+----+
   |         |
  Yes        No
   |         |
   v         v
 Update    Show notification
 Jira      (read-only mode)
```

All write operations to Jira require explicit policy authorization. If your organization's policy is read-only, the system still correlates PRs to tickets and shows you the relationship, but does not modify Jira.

---

## PR-to-Jira Correlation

The system extracts Jira ticket keys from two sources:

### 1. Branch Names

Branch names following common conventions are parsed automatically:

| Branch Name Pattern | Extracted Key |
|---|---|
| `feature/PROJ-789-rate-limiting` | `PROJ-789` |
| `bugfix/PROJ-123-fix-null-pointer` | `PROJ-123` |
| `PROJ-456-update-docs` | `PROJ-456` |
| `hotfix/PROJ-001` | `PROJ-001` |

The pattern matches any string matching `[A-Z]+-[0-9]+` in the branch name.

### 2. PR Descriptions and Titles

Ticket keys mentioned in the PR title or description body are also extracted:

```markdown
## Summary
Implements rate limiting for the API gateway.

Fixes PROJ-789
Also related to PROJ-790 and INFRA-102
```

In this example, three ticket keys are extracted: `PROJ-789`, `PROJ-790`, and `INFRA-102`.

### Multi-Ticket Support

A single PR can reference multiple Jira tickets. Each ticket is updated independently with information specific to that PR. For example, if a PR references both `PROJ-789` and `INFRA-102`, both tickets receive their own summary comment and status transition.

---

## Automatic Updates

When write access is authorized by policy, the system performs two types of updates:

### Summary Comments

When a PR event occurs, a summary comment is posted to the linked Jira ticket:

```
[OpenClaw] PR #412 activity update
===================================
Repository: org/api-gateway
PR: #412 - Implement rate limiting
Author: jdoe
Event: 3 commits pushed

Commits:
  - a1b2c3d: Add rate limiter middleware
  - e4f5g6h: Add configuration for rate limits
  - i7j8k9l: Add unit tests for rate limiter

Status: In Review
```

### Status Transitions

PR events trigger corresponding Jira status transitions:

| GitHub Event | Jira Transition |
|---|---|
| PR opened | "In Progress" --> "In Review" |
| Commits pushed to open PR | No transition (comment only) |
| PR approved | No transition (comment only) |
| PR merged | "In Review" --> "Done" |
| PR closed (not merged) | "In Review" --> "In Progress" |

> **Note:** Transition names depend on your Jira workflow configuration. The system maps to your actual workflow states. If a transition is not available in your workflow, the comment is posted but the transition is skipped, and a warning is logged.

---

## Policy Governance

Work tracking write operations are strictly policy-governed:

### Write-Authorized Policy

When write access is granted, the system can:

- Post comments to Jira tickets
- Transition Jira ticket statuses
- Create new Jira tickets (when explicitly requested)

### Read-Only Policy

When policy restricts to read-only:

- PR-to-Jira correlation still runs
- The system shows you which tickets are related to which PRs
- A notification is displayed instead of modifying Jira:

```
[Work Tracking] PR #412 merged (org/api-gateway)
Correlated tickets: PROJ-789, INFRA-102

Policy: read-only (writes blocked)
Suggested actions:
  - Transition PROJ-789 to "Done"
  - Transition INFRA-102 to "Done"
  - Post merge summary to both tickets

You can perform these actions manually or request write access from your administrator.
```

### Checking Your Policy

Ask your assistant: *"What are my work tracking permissions?"* to see whether write access is authorized for your account.

---

## Jira Write Tools

When write access is authorized, three Jira write tools are available:

### 1. Comment

Post a comment to a Jira ticket.

- *"Add a comment to PROJ-789: Rate limiting implementation is complete, pending final review."*
- *"Post an update to INFRA-102 about the infrastructure changes in PR #415."*

### 2. Transition

Change a ticket's status.

- *"Transition PROJ-789 to Done."*
- *"Move INFRA-102 to In Review."*

### 3. Create

Create a new Jira ticket.

- *"Create a Jira ticket in PROJ: title 'Add rate limit configuration docs', type Task, priority Medium."*
- *"Create a bug ticket in PROJ for the null pointer exception in the auth module."*

All three tools are subject to policy authorization. If your policy does not allow a specific operation, the tool will refuse and explain why.

---

## End-of-Day Standup Generation

At the end of each workday (or on demand), the assistant generates a standup summary from your actual activity across all connected systems.

### What Is Included

The standup aggregates activity from:

| Source | Activity Tracked |
|---|---|
| GitHub | PRs opened, reviewed, merged; commits pushed; issues closed |
| Jira | Tickets transitioned, commented on, created |
| Gmail | Threads responded to (count only, not content) |
| Google Calendar | Meetings attended |
| Slack | Threads participated in (count only, not content) |
| Google Drive | Documents edited or reviewed |

### Standup Format

```
End-of-Day Standup -- Wednesday, March 13, 2026
=================================================

Completed:
  - Merged PR #412: Implement rate limiting (PROJ-789)
  - Closed INFRA-102: Rate limiter infrastructure
  - Reviewed PR #418: Update auth flow (SECR-201)
  - Responded to 6 email threads

In Progress:
  - PR #420: Add rate limit configuration (PROJ-791) -- 2 commits pushed
  - DOCS-88: API migration runbook -- document edited in Google Drive

Blocked:
  - PROJ-795: Waiting on API team review (no activity in 3 days)

Meetings: 3 (1:1 with manager, sprint planning, security review)

Tomorrow:
  - PROJ-791 PR review expected
  - DOCS-88 deadline Friday
```

### Requesting a Standup

- *"Generate my standup"*
- *"What did I accomplish today?"*
- *"Give me a standup for Monday through Wednesday"* (multi-day range)

The standup can be copied to Slack, email, or any other destination. It reports facts only -- it does not fabricate activity.

---

## Webhook Events

The work tracking system processes the following GitHub webhook events:

| Event | Payload Used |
|---|---|
| `pull_request.opened` | PR title, description, branch name, author |
| `pull_request.closed` (merged) | Merge commit, final status |
| `pull_request.closed` (not merged) | Close reason |
| `push` (to open PR branch) | Commit messages, file changes |
| `pull_request_review.submitted` | Review verdict (approved, changes requested, comment) |

Webhook configuration is handled by your administrator during deployment. As a user, you do not need to configure webhooks.

---

## Best Practices

1. **Use ticket keys in branch names.** The pattern `feature/PROJ-789-description` is the most reliable way to ensure correlation.
2. **Reference tickets in PR descriptions.** Mention all relevant ticket keys, especially if the branch name only contains one.
3. **Review standup reports before sharing.** The assistant reports facts, but you may want to add context or remove items.
4. **Check transition mappings.** If your Jira workflow uses non-standard status names, ask your administrator to verify the transition mappings are correct.
