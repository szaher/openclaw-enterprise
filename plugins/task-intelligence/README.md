# task-intelligence

Core task management plugin for OpenClaw Enterprise. Discovers tasks across all connected systems, deduplicates via multi-signal correlation, scores by priority, and generates daily briefings.

## What It Does

- **Task Discovery**: Scans Gmail, GCal, Jira, GitHub, GDrive, and Slack for task-like items
- **Cross-System Correlation**: Deduplicates tasks using title similarity, entity references (PROJ-123, #42), temporal proximity, and participant overlap
- **Priority Scoring**: Scores 0-100 using deadlines, sender seniority, follow-up frequency, SLA timers, and blocking relationships
- **Daily Briefing**: Generates prioritized task lists with calendar-aware time-block suggestions
- **Retention Lifecycle**: Manages discovered -> active -> completed -> archived -> purged lifecycle

## Correlation Thresholds

| Confidence | Action |
|-----------|--------|
| >= 0.8 | Auto-merge (same work item) |
| 0.5 - 0.8 | "Possibly related" indicator |
| < 0.5 | Separate tasks |

## Task Retention

- Active tasks: 90-day retention
- Completed tasks archived after 30 days
- Archived tasks purged after 90 days

## Dependencies

- policy-engine (policy evaluation for connector access)
- audit-enterprise (audit logging for all data access)
- All 5 MVP connectors (gmail, gcal, jira, github, gdrive)
