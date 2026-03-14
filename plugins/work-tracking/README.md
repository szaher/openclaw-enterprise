# @openclaw-enterprise/work-tracking

Work tracking auto-update plugin for OpenClaw Enterprise. Automatically updates Jira tickets when GitHub PRs are merged, correlates PRs to tickets, and generates end-of-day standup summaries.

## Overview

This plugin extends OpenClaw with work tracking automation:

- **PR-to-Jira correlation**: Extract ticket keys from branch names, PR titles, and descriptions
- **Auto-update on merge**: Add summary comments and transition Jira tickets when PRs are merged
- **Standup summaries**: Aggregate daily development activity into structured standup reports
- **Webhook-driven**: Reacts to GitHub webhook events in real-time

All write operations go through the enterprise policy engine and produce audit log entries.

## Architecture

```
GitHub Webhooks --> connector-github
                      |
                      +-- emits connector.github.event
                                  |
                      work-tracking hooks
                          |
                          +-- correlatePrToJira()
                          |       |
                          |       +-- extractTicketKeysFromBranch()
                          |       +-- extractTicketKeysFromTitle()
                          |       +-- extractTicketKeysFromDescription()
                          |
                          +-- TicketUpdater.updateTicketForMerge()
                          |       |
                          |       +-- jira_comment (via connector-jira write tools)
                          |       +-- jira_transition (via connector-jira write tools)
                          |       +-- policy.evaluate (gateway method)
                          |
                          +-- activityLog -> generateStandupSummary()
```

## Plugin Dependencies

- `policy-engine`: Policy evaluation before every Jira write
- `audit-enterprise`: Audit logging for all operations
- `connector-jira`: Jira read/write tools
- `connector-github`: GitHub webhook event source

## Configuration

The plugin requires:
- Active connector-github plugin with webhook endpoint configured
- Active connector-jira plugin with write permissions
- Optional: default merge transition (e.g., transition ID for "Done" status)

## Development

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm typecheck    # Type-check without emitting
```

## File Structure

```
src/
  plugin.ts                    # Entry point, registers hooks and tools
  openclaw-types.ts            # OpenClaw plugin API type definitions
  correlation/
    pr-jira.ts                 # PR-to-Jira ticket key extraction
  updater/
    updater.ts                 # Ticket updater (comment + transition)
  standup/
    generator.ts               # End-of-day standup summary generator
  hooks.ts                     # GitHub webhook event handler
tests/
  work-tracking.test.ts        # Unit tests
SKILL.md                       # Agent skill description
```
