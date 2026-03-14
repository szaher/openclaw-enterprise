# Contract: Connector Plugin Interface

**Type**: OpenClaw Plugin Interface
**Applies to**: All connector plugins (gmail, gcal, jira, github, gdrive)

## Required Plugin Registrations

Every connector plugin MUST register:

1. **Tools** (via `api.registerTool()`): At least one read tool. Write tools optional and governed by policy.
2. **Service** (via `api.registerService()`): Background service for polling/webhook listening.
3. **Health check**: Via gateway status system.

## Standard Tool Pattern

Every connector tool MUST:

1. Call `policy.evaluate()` before executing any action
2. Attach data classification to all returned data
3. Emit an audit event for every invocation

### Read Tool Contract

```typescript
// Every connector exposes at least one read tool
interface ConnectorReadResult {
  items: Array<{
    id: string;
    source: string;          // connector type
    source_id: string;       // ID in the source system
    title: string;
    summary: string;         // Structured extraction (not raw content)
    classification: DataClassification;
    url: string;             // Link back to source system
    metadata: Record<string, unknown>;  // Source-specific metadata
    timestamp: string;       // ISO 8601
  }>;
  connector_status: "ok" | "partial" | "error";
  error_detail?: string;
}
```

### Write Tool Contract

```typescript
// Write tools require policy authorization
interface ConnectorWriteResult {
  success: boolean;
  source_id: string;         // ID of the created/modified item
  action: string;            // What was done (comment, transition, send, etc.)
  policy_applied: string;    // Policy that authorized this action
  audit_entry_id: string;    // Reference to the audit log entry
}
```

## Connector Service Contract

Background services MUST:

1. Poll or listen for changes at configurable intervals
2. Emit events via the Gateway event system (not direct function calls)
3. Handle OAuth token refresh
4. Report health status
5. Gracefully degrade when the external API is unavailable

## MVP Connector Tools

| Connector | Read Tools | Write Tools (policy-gated) |
|---|---|---|
| Gmail | email_read, email_search | email_draft, email_send |
| GCal | calendar_read, calendar_search | calendar_create, calendar_modify |
| Jira | jira_read, jira_search | jira_comment, jira_transition, jira_create |
| GitHub | github_pr_read, github_issue_read | (read-only MVP) |
| GDrive | gdrive_read, gdrive_search | (read-only MVP) |
