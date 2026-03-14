# Skill: Org Intelligence

## When to Use

Use the org intelligence tools when the user:
- Asks about organizational news, announcements, or updates
- Wants a personalized digest of what happened across the org
- Asks about document changes or what changed in a specific document
- Needs to check if document changes created inconsistencies with related docs
- Wants to be notified about important changes

## Tools

### aggregate_org_news
Scans monitored organizational channels (Slack, email lists) via connector read tools and returns raw news items discovered from all configured sources.

### score_news_relevance
Scores each news item against the user's role, team, and active projects. Classifies items as must-read, should-read, nice-to-know, or skip.

### generate_org_digest
Generates a personalized daily or weekly digest of organizational news. Items are scored for relevance, filtered by data classification, and ranked by importance.

### detect_document_changes
Compares current document versions against cached versions via GDrive connector. Classifies changes as cosmetic, minor, substantive, or critical. Handles first-time detection when no cached version exists.

### check_document_consistency
Detects contradictions between related documents when one changes. Uses keyword overlap and pattern matching to find conflicting claims across documents.

## How It Works

1. **Aggregation**: Scans all monitored channels and email lists for news items
2. **Scoring**: Each item is scored against the user's profile (role, team, projects, interests)
3. **Classification**: Items are classified by relevance (must-read through skip)
4. **Digest Generation**: Scored items are composed into daily/weekly digests respecting data classification ceilings
5. **Document Monitoring**: Documents are compared against cached versions to detect and classify changes
6. **Change Summarization**: Changes are broken down by section (added/modified/removed) with per-user impact assessment
7. **Consistency Checking**: Related documents are checked for contradictions when one changes
8. **Notification**: Change notifications are delivered based on urgency; cosmetic changes are suppressed per policy

## Important Notes

- If a connector is unavailable, aggregation continues with available sources (graceful degradation)
- Data classification is enforced: items above the user's classification ceiling are excluded from digests
- Cosmetic document changes are suppressed by default per policy to reduce notification noise
- Documents detected for the first time are flagged as no-diff-available and cached for future comparison
- Consistency checking requires documents to have extracted claims with keywords for matching
