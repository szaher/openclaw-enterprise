# @openclaw-enterprise/connector-github

GitHub connector plugin for OpenClaw Enterprise. Provides read-only access to GitHub pull requests and issues, plus webhook ingestion for real-time event processing.

## Overview

This plugin extends OpenClaw with GitHub integration capabilities:

- **github_pr_read** tool: Fetch pull requests (open, closed, review-requested)
- **github_issue_read** tool: Fetch issues (open, closed, by assignee/labels)
- **Webhook receiver**: Ingest GitHub webhooks for real-time tracking

All operations go through the enterprise policy engine and produce audit log entries. Data classification is applied automatically to all extracted content.

## Architecture

```
GitHub REST API <-- GitHubReadTools (extends ConnectorBase)
                      |
                      +-- policy.evaluate (gateway method)
                      +-- policy.classify (gateway method)
                      +-- audit.log (gateway method)

GitHub Webhooks --> POST /api/v1/webhooks/github
                      |
                      +-- GitHubWebhookHandler.parseEvent()
                      +-- emits connector.github.event
```

## Plugin Dependencies

- `policy-engine`: Policy evaluation before every data access
- `audit-enterprise`: Audit logging for all operations

## Configuration

The connector requires:
- Repository owner and name
- OAuth token or Personal Access Token (managed by auth-enterprise plugin)

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
    read.ts              # github_pr_read and github_issue_read implementations
  services/
    webhook.ts           # GitHub webhook handler
tests/
  github.test.ts         # Unit tests
SKILL.md                 # Agent skill description
```
