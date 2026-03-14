# Skill: Task Intelligence

## When to Use

Use the task intelligence tools when the user:
- Asks about their tasks, priorities, or what to work on
- Requests a daily briefing or summary
- Wants to see their schedule with time blocks
- Asks about task status across systems

## Tools

### generate_briefing
Generates a prioritized daily briefing by scanning all connected systems (Gmail, GCal, Jira, GitHub, GDrive, Slack). Tasks are deduplicated across systems, scored by priority, and presented with time-block suggestions.

## How It Works

1. **Discovery**: Scans all active connectors for task-like items
2. **Correlation**: Deduplicates tasks across systems (e.g., a Slack message and Jira ticket about the same work appear as one task)
3. **Scoring**: Ranks by urgency signals — deadlines, sender seniority, follow-ups, SLA timers, blocking relationships
4. **Time-blocking**: Identifies free calendar blocks and suggests which tasks to work on
5. **Delivery**: Formats and delivers via the user's preferred channel

## Important Notes

- If a connector is unavailable, the briefing will still generate with a notice about missing data sources
- Tasks with ambiguous correlation (0.5-0.8 confidence) are shown as "possibly related" rather than silently merged
- Task data follows the retention lifecycle: 90-day active, 30-day archive, 90-day purge
