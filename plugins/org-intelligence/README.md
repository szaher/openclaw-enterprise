# @openclaw-enterprise/org-intelligence

Org News Intelligence and Document Change Monitoring plugin for OpenClaw Enterprise.

## Overview

This plugin provides organizational intelligence capabilities:

- **News Aggregation**: Scans monitored channels and email lists for organizational news
- **Relevance Scoring**: Scores news items against user profiles (role, team, projects)
- **Personalized Digests**: Generates daily/weekly digests with classification-aware filtering
- **Document Change Detection**: Monitors documents for changes via GDrive connector, classifying as cosmetic/minor/substantive/critical
- **Change Summarization**: Summarizes what changed (added/modified/removed) and assesses per-user impact
- **Consistency Checking**: Detects contradictions between related documents when one changes
- **Notification Service**: Delivers change notifications based on urgency, suppresses cosmetic changes per policy

## Architecture

```
src/
  plugin.ts                    # Plugin entry point (registerTool/registerService)
  news/
    aggregator.ts              # Scans monitored sources for news items
    scorer.ts                  # Relevance scoring engine
  digest/
    generator.ts               # Personalized digest composition
  doc-monitor/
    detector.ts                # Document change detection and classification
    summarizer.ts              # Change summarization and impact assessment
  consistency/
    checker.ts                 # Cross-document contradiction detection
  services/
    notifier.ts                # Notification delivery service
```

## Dependencies

- `policy-engine` — policy evaluation for notification suppression
- `audit-enterprise` — audit logging for all intelligence operations
- `@openclaw-enterprise/shared` — shared types, constants, and errors

## Development

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests
pnpm typecheck    # Type-check without emitting
```

## Configuration

The plugin registers the following with OpenClaw:

- **Service**: `org-intelligence-notifier` — notification delivery service
- **Tools**: `aggregate_org_news`, `score_news_relevance`, `generate_org_digest`, `detect_document_changes`, `check_document_consistency`
