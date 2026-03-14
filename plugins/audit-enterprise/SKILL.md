# Skill: audit-enterprise

## What This Plugin Does

The audit-enterprise plugin provides an append-only audit log for all state-changing operations in OpenClaw Enterprise. Every tool invocation, data access, model call, policy decision, agent exchange, and policy change is recorded with full context: who did it, what data was touched, which policy governed the decision, and what the outcome was.

## When the Agent Uses Audit Tools

### Logging (audit.log)

The agent calls `audit.log` automatically whenever:

- A tool is invoked (action_type: `tool_invocation`)
- External data is read or written (action_type: `data_access`)
- An LLM model is called (action_type: `model_call`)
- A policy evaluation occurs (action_type: `policy_decision`)
- An agent-to-agent exchange happens (action_type: `agent_exchange`)
- A policy is created, updated, or deprecated (action_type: `policy_change`)

The agent does not need to decide whether to log; all plugins emit audit entries for their state-changing operations.

### Querying (audit.query)

The agent queries the audit log when:

- A user asks "What did my agent do yesterday?" or similar questions
- Generating a daily briefing that includes an activity summary
- An admin requests a compliance report
- Investigating why an action was denied (search by request_id or policy_result=deny)
- Correlating events across systems (search by request_id)

### Query Parameters

- `tenant_id` (required): scoped to the user's tenant
- `user_id`: filter to a specific user's actions
- `action_type`: filter by category (e.g., `data_access`)
- `from` / `to`: ISO 8601 date range
- `page` / `page_size`: pagination (default 100, max 1000)

## When Audit Data Appears in Briefings

The daily briefing plugin pulls audit data to populate:

- **Auto-response summary**: what the agent did on the user's behalf overnight
- **Alerts**: any denied actions or policy violations
- **Connector status**: derived from recent audit entries for each connector

The briefing queries the last 24 hours of audit entries for the user, groups by action_type, and highlights anything with outcome=denied or outcome=error.

## REST Endpoints

For admin dashboards and compliance tooling:

- `GET /api/v1/audit` — paginated list with filters
- `GET /api/v1/audit/:id` — single entry lookup
- `GET /api/v1/audit/export?format=csv|json` — bulk export for compliance

## Append-Only Guarantee

Audit entries cannot be modified or deleted through any API. The database enforces this with triggers that reject UPDATE and DELETE operations. The AuditWriter class intentionally has no update or delete methods.
