# @openclaw-enterprise/connector-jira

Jira connector plugin for OpenClaw Enterprise. Provides read-only access to Jira issues and JQL search, plus webhook ingestion for real-time event processing.

## Overview

This plugin extends OpenClaw with Jira integration capabilities:

- **jira_read** tool: Fetch issues assigned to the current user
- **jira_search** tool: Execute JQL queries to search issues
- **Webhook receiver**: Ingest Jira webhooks for real-time issue tracking

All operations go through the enterprise policy engine and produce audit log entries. Data classification is applied automatically to all extracted content.

## Architecture

```
Jira REST API <-- JiraReadTools (extends ConnectorBase)
                    |
                    +-- policy.evaluate (gateway method)
                    +-- policy.classify (gateway method)
                    +-- audit.log (gateway method)

Jira Webhooks --> POST /api/v1/webhooks/jira
                    |
                    +-- JiraWebhookHandler.parseEvent()
                    +-- emits connector.jira.event
```

## Plugin Dependencies

- `policy-engine`: Policy evaluation before every data access
- `audit-enterprise`: Audit logging for all operations

## Configuration

The connector requires:
- Jira instance base URL
- OAuth credentials (managed by auth-enterprise plugin)

## Development

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm typecheck    # Type-check without emitting
```

## File Structure

```
src/
  plugin.ts              # Entry point, registers tools and webhook route
  openclaw-types.ts      # OpenClaw plugin API type definitions
  tools/
    read.ts              # jira_read and jira_search tool implementations
  services/
    webhook.ts           # Jira webhook handler
tests/
  jira.test.ts           # Unit tests
SKILL.md                 # Agent skill description
```
