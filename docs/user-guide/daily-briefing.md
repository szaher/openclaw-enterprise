# Daily Briefing

The daily briefing is OpenClaw Enterprise's flagship productivity feature. It scans every connected system, discovers tasks and obligations, deduplicates them across systems, scores each by priority, and delivers a single ranked list with time-block suggestions for your day.

---

## What You Get

When you request a briefing (or receive one on schedule), it includes:

1. **Prioritized task list** -- every discovered task ranked by a 0-100 priority score.
2. **Time-block suggestions** -- proposed calendar slots for tackling each task, based on your free time.
3. **Auto-response summary** -- what the assistant handled on your behalf since the last briefing.
4. **Connector status** -- which data sources were reachable and which had errors.

### Example Briefing Output

```
Daily Briefing -- Wednesday, March 13, 2026
============================================

Connector Status:
  Gmail ............. OK (last sync: 08:01)
  Google Calendar ... OK (last sync: 08:01)
  Jira .............. OK (last sync: 08:02)
  GitHub ............ OK (last sync: 08:01)
  Google Drive ...... OK (last sync: 08:02)
  Slack ............. OK (via OpenClaw built-in)

--------------------------------------------------
#1  [Score: 94]  Security review for auth-service PR #412
    Sources: GitHub (PR review request), Jira (SECR-201), Slack (#security)
    Deadline: today 17:00
    Suggested block: 09:00 - 10:30
    Note: Blocks deployment of auth-service v2.4

#2  [Score: 81]  Respond to VP Eng question about Q2 roadmap
    Sources: Gmail (thread from J. Martinez, 2 follow-ups)
    Deadline: none (sender seniority: director+)
    Suggested block: 10:30 - 11:00

#3  [Score: 73]  Update API migration runbook
    Sources: Google Drive (doc modified by 3 others), Jira (DOCS-88)
    Deadline: Friday
    Suggested block: 13:00 - 14:00

... (12 more tasks)

--------------------------------------------------
Auto-Response Summary (since last briefing):
  - 4 informational messages acknowledged
  - 1 meeting scheduling response sent (notify mode)
  - 2 messages queued for your approval

--------------------------------------------------
```

---

## Task Discovery

The briefing scans the following sources for tasks, obligations, and action items:

| Source | What Is Scanned |
|---|---|
| Gmail | Unread messages, threads with follow-ups, messages flagged as requiring action |
| Google Calendar | Upcoming meetings requiring preparation, overdue action items from past meetings |
| Jira | Tickets assigned to you, tickets you are watching, tickets where you are mentioned |
| GitHub | PR review requests, issues assigned to you, PR comments requesting changes |
| Google Drive | Documents where you have pending comments, shared documents requiring review |
| Slack | Messages mentioning you, threads you are in, channel messages matching your projects (via OpenClaw built-in) |

> **Note:** The assistant only accesses systems that your administrator has connected and that your personal authentication tokens authorize. If a connector is not configured, those tasks simply will not appear.

---

## Task Correlation and Deduplication

A single real-world task often appears in multiple systems. For example, a Jira ticket, a GitHub PR, and a Slack thread may all refer to the same piece of work. The briefing uses multi-signal correlation to detect these duplicates and merge them into a single entry.

### Correlation Signals

The correlation engine computes a confidence score from four signals:

| Signal | Weight | Description |
|---|---|---|
| Cross-system IDs | 0.2 | Explicit references like `PROJ-789` found in PR descriptions, email subjects, or Slack messages |
| Entity references | 0.4 | Shared names, URLs, file paths, or identifiers across items |
| Jaccard similarity | 0.3 | Text similarity between task titles and descriptions |
| Temporal proximity | 0.1 | Items created or updated within a narrow time window around the same event |

### Merge Behavior

| Confidence Score | Action |
|---|---|
| >= 0.8 | **Auto-merge.** Items are combined into a single task entry. All source systems are listed. |
| 0.5 -- 0.8 | **Possibly related.** Items appear as a single entry with a "possibly related" label. You can confirm or split them. |
| < 0.5 | **Separate items.** No correlation is shown. |

### Example

Suppose you have:
- A Jira ticket `PROJ-789` titled "Implement rate limiting for API gateway"
- A GitHub PR on branch `feature/PROJ-789-rate-limiting`
- A Slack message: "Hey, can you update us on the rate limiting work?"

The correlation engine detects `PROJ-789` as a cross-system ID (0.2), finds shared entities like "rate limiting" and "API gateway" (0.4), measures high Jaccard similarity between the texts (0.3), and notes all three appeared within 48 hours (0.1). The combined confidence exceeds 0.8, so they auto-merge into one briefing entry listing all three sources.

---

## Priority Scoring

Each task receives a priority score from 0 to 100, computed from five factors:

| Factor | Points | How It Works |
|---|---|---|
| Deadline proximity | 0 -- 30 | Tasks due today score 30. Tasks due this week score proportionally less. No deadline scores 0. |
| Sender seniority | 0 -- 15 | Requests from senior leadership score higher. Peer requests score lower. Based on org hierarchy data. |
| Follow-up count | 0 -- 20 | Each unanswered follow-up increases urgency. Three or more follow-ups approaches maximum. |
| SLA timers | 0 -- 20 | Tasks with SLA commitments (e.g., support tickets, security reviews) score based on remaining SLA time. |
| Blocking relationships | 0 -- 15 | Tasks that block other people's work score higher. The more downstream tasks blocked, the higher the score. |

### Scoring Example

| Task | Deadline | Seniority | Follow-ups | SLA | Blocking | Total |
|---|---|---|---|---|---|---|
| Security review PR #412 | Today (30) | Manager (8) | 2 follow-ups (14) | 4h SLA remaining (17) | Blocks 3 PRs (15) | **94** |
| VP Eng roadmap question | None (0) | VP (15) | 2 follow-ups (14) | None (0) | None (0) | **81** * |
| Update API runbook | Friday (12) | Peer (3) | 0 (0) | None (0) | None (0) | **73** * |

(*) Additional heuristic adjustments may apply based on historical patterns.

---

## Time-Block Suggestions

After scoring and ranking tasks, the briefing analyzes your Google Calendar for free slots and proposes time blocks:

- **Duration estimation** is based on task type (code review: ~90 min, email response: ~15 min, document update: ~60 min).
- **Slot selection** avoids fragmenting your calendar. It prefers contiguous free blocks.
- **Priority ordering** means higher-scored tasks get earlier and better time slots.
- **Buffer time** between meetings is preserved (configurable by policy, default: 15 minutes).

> **Note:** Time-block suggestions are recommendations only. They do not create calendar events unless you explicitly confirm.

---

## Connector Status Reporting

Each briefing begins with a connector status section. This tells you:

- Which connectors were reachable during the scan.
- The timestamp of the last successful sync for each.
- Any errors encountered (e.g., expired OAuth token, API rate limit hit).

If a connector is unreachable, the briefing proceeds with data from the remaining sources and clearly notes which source was missing.

---

## Task Lifecycle

Every discovered task follows a defined lifecycle:

```
discovered --> active --> completed --> archived --> purged
```

| State | Description |
|---|---|
| **Discovered** | Task first detected by the scanner. Appears in the next briefing. |
| **Active** | Task acknowledged by the user or carried forward across briefings. |
| **Completed** | Task marked done (explicitly or detected via system signals like PR merge or Jira transition). |
| **Archived** | Completed tasks move to archive after the next briefing cycle. |
| **Purged** | Archived tasks are permanently deleted after 90 days (retention period set by policy). |

### Completion Detection

The system detects task completion through signals such as:

- Jira ticket transitioned to "Done" or "Closed"
- GitHub PR merged or closed
- Gmail thread archived or replied to
- Google Calendar event that has passed
- Explicit user confirmation ("Mark task #3 as done")

---

## Requesting a Briefing

You can receive briefings in two ways:

1. **On demand.** Ask your assistant: *"Give me my daily briefing"* or *"What should I work on today?"*
2. **Scheduled.** Your administrator can configure automatic briefing delivery at a set time (e.g., every weekday at 08:00).

You can also request partial briefings:

- *"Show me only critical tasks"* -- filters to score >= 80
- *"What's blocking other people?"* -- filters to tasks with blocking relationships
- *"Briefing for Jira and GitHub only"* -- limits to specific sources
