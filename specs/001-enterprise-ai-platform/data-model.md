# Data Model: OpenClaw Enterprise Platform

**Date**: 2026-03-13
**Feature**: 001-enterprise-ai-platform

## Entities

### Policy

Governs all assistant behavior. Declarative YAML documents evaluated by OPA.

| Field | Description |
|---|---|
| id | Unique identifier |
| scope | enterprise / org / team / user |
| scope_id | ID of the scoped entity (enterprise ID, org ID, team ID, user ID) |
| domain | models / actions / integrations / agent-to-agent / features / data / audit |
| name | Human-readable policy name |
| version | Semantic version of this policy document |
| content | YAML policy document (stored as text, validated on write) |
| status | active / draft / deprecated |
| created_by | User ID of creator |
| created_at | Timestamp |
| updated_at | Timestamp |
| change_reason | Required commit message for every change |

**Validation rules**:
- A policy at scope X MUST NOT expand permissions beyond the parent scope's policy in the same domain
- Content MUST be valid YAML conforming to the schema for its domain
- version MUST follow semver; MUST increment on every change

**State transitions**: draft → active → deprecated

### Task

A unit of work discovered from connected systems.

| Field | Description |
|---|---|
| id | Unique identifier |
| user_id | Owner (the user whose briefing this appears in) |
| title | Short task description |
| description | Extended description (structured extraction, not raw content) |
| priority_score | Numeric score (0-100) computed from urgency signals |
| status | discovered / active / completed / archived / purged |
| sources | Array of source references (system, ID, URL) |
| correlation_id | Links deduplicated tasks across systems |
| correlation_confidence | Score (0-1) for deduplication confidence |
| deadline | Extracted deadline (nullable) |
| urgency_signals | Structured data: sender_seniority, follow_up_count, sla_timer, blocking_relationships |
| classification | public / internal / confidential / restricted |
| discovered_at | When the task was first discovered |
| completed_at | When marked completed (nullable) |
| archived_at | When archived (nullable; 30 days after completed_at) |
| purge_at | Scheduled purge date (90 days after discovered_at or archived_at) |

**Validation rules**:
- priority_score computed from urgency_signals, not manually set
- correlation_confidence >= 0.8 auto-merges; 0.5-0.8 shows "possibly related"; <0.5 separate tasks
- classification inherited from source data classification (highest of all sources)

**State transitions**: discovered → active → completed → archived → purged

**Retention**: Active tasks retained 90 days. Completed tasks archived after 30 days. Archived tasks purged after 90 days.

### Connector

A connection to an external system with scoped permissions.

| Field | Description |
|---|---|
| id | Unique identifier |
| type | gmail / gcal / jira / github / gdrive (MVP); outlook / linear / notion / confluence / gitlab (post-MVP) |
| tenant_id | Tenant this connector belongs to |
| user_id | User who authorized the connector (nullable for shared connectors) |
| permissions | read / write / admin (read-only by default) |
| default_classification | Default data classification for this connector type |
| status | active / disabled / error |
| credentials_ref | Reference to K8s Secret containing OAuth tokens |
| last_sync_at | Last successful data sync timestamp |
| error_details | Last error message if status is error |
| config | Connector-specific configuration (polling interval, filters, etc.) |

**Validation rules**:
- permissions default to "read"; "write" or "admin" require explicit policy authorization
- credentials_ref MUST point to a K8s Secret, never inline credentials
- default_classification set per connector type (Gmail→internal, public GitHub→public, etc.)

**State transitions**: active ↔ disabled ↔ error

### AgentIdentity

Machine-readable identity card for an OpenClaw Enterprise assistant instance.

| Field | Description |
|---|---|
| instance_id | Unique agent instance identifier |
| user_id | User this agent serves |
| tenant_id | Tenant this agent belongs to |
| org_unit | Organizational unit path (e.g., "engineering/platform") |
| can_receive_queries | Whether this agent accepts incoming OCIP queries |
| can_auto_respond | Whether this agent can respond without human approval |
| can_make_commitments | Always false unless human approves per-exchange |
| max_classification_shared | Maximum classification level this agent can share |
| supported_exchange_types | Array of OCIP exchange types accepted |
| max_rounds_accepted | Maximum exchange rounds this agent will participate in |
| human_availability | Current user status and next-available time |

**Validation rules**:
- can_make_commitments MUST default to false (structural, per constitution)
- max_classification_shared governed by org-level policy
- Derived from user's policies at runtime, not stored statically

### Exchange

An agent-to-agent conversation with OCIP metadata.

| Field | Description |
|---|---|
| exchange_id | Unique exchange identifier |
| conversation_id | Groups all rounds of a multi-round exchange |
| initiator_agent_id | AgentIdentity.instance_id of initiator |
| initiator_user_id | User ID of initiator |
| responder_agent_id | AgentIdentity.instance_id of responder |
| responder_user_id | User ID of responder |
| exchange_type | information_query / commitment_request / meeting_scheduling |
| current_round | Current round number |
| max_rounds | Policy-defined maximum rounds |
| classification_level | Maximum classification level for this exchange |
| outcome | in_progress / resolved / escalated / denied / expired |
| escalation_reason | Reason for escalation (nullable) |
| data_shared | Array of {source, fields} shared during exchange |
| data_withheld | Array of {reason, description} withheld during exchange |
| policy_applied | Policy ID that governed this exchange |
| transcript | Full message transcript (both sides) |
| channel | Which messaging channel carried the exchange |
| started_at | Timestamp |
| ended_at | Timestamp (nullable) |

**Validation rules**:
- current_round MUST NOT exceed max_rounds; if reached, outcome = "escalated"
- Cross-enterprise exchanges (different tenant_id) MUST be denied
- Cross-org exchanges within same enterprise governed by org-level policies

**State transitions**: in_progress → resolved | escalated | denied | expired

### AuditEntry

Immutable record of an assistant action. Append-only.

| Field | Description |
|---|---|
| id | Unique identifier (auto-increment or ULID) |
| tenant_id | Tenant |
| user_id | User whose assistant took the action |
| timestamp | When the action occurred |
| action_type | tool_invocation / data_access / model_call / policy_decision / agent_exchange / policy_change |
| action_detail | Structured detail of the action |
| data_accessed | Array of {source, classification, purpose} |
| model_used | Model identifier (nullable) |
| model_tokens | Input/output token count (nullable) |
| data_classification | Classification level of the data involved |
| policy_applied | Policy ID that governed the decision |
| policy_result | allow / deny / require_approval |
| policy_reason | Human-readable explanation of the decision |
| outcome | success / denied / error / pending_approval |
| request_id | Traceability ID linking related audit entries |

**Validation rules**:
- No UPDATE or DELETE operations allowed (append-only)
- Minimum 1-year retention (constitution mandate)
- Partitioned by month for query performance and retention management

### Briefing

Generated daily summary for a user.

| Field | Description |
|---|---|
| id | Unique identifier |
| user_id | Target user |
| tenant_id | Tenant |
| generated_at | When the briefing was generated |
| tasks | Array of Task references with priority ranking |
| time_blocks | Suggested time block allocations |
| auto_response_summary | Summary of auto-responses since last briefing |
| org_news_items | Personalized org news items with relevance scores |
| doc_change_alerts | Document change summaries with impact assessment |
| alerts | Urgent items requiring immediate attention |
| connector_status | Status of each connector (available / unreachable) |
| delivery_channel | slack / email / web_ui |
| delivered_at | When the briefing was delivered (nullable) |

### DataClassification

Classification label metadata attached to data objects.

| Field | Description |
|---|---|
| data_ref | Reference to the data object (source system + ID) |
| level | public / internal / confidential / restricted |
| assigned_by | connector_default / ai_reclassification / admin_override |
| original_level | Level before reclassification (nullable) |
| override_by | Admin user ID if admin_override (nullable) |
| override_reason | Reason for override (nullable) |
| assessed_at | When classification was last assessed |

**Validation rules**:
- level defaults to connector's default_classification
- AI reclassification can only upgrade (increase) classification level, never downgrade
- Admin override can set any level but MUST be logged with reason

## Relationships

```text
Tenant 1──* User
Tenant 1──* Connector
Tenant 1──* Policy
User    1──* Task
User    1──* Briefing
User    1──1 AgentIdentity (runtime, derived from policies)
User    1──* AuditEntry
Task    *──* Source (via sources array)
Task    *──* Task (via correlation_id, self-referencing for deduplication)
Exchange 1──2 AgentIdentity (initiator + responder)
Exchange 1──* AuditEntry (via request_id)
Policy  1──* AuditEntry (via policy_applied)
DataClassification 1──1 data_ref (any data object)
```

## Indexes (Query Performance)

| Table | Index | Purpose |
|---|---|---|
| audit_entries | (tenant_id, user_id, timestamp DESC) | Admin queries: "all actions by user X in past 24h" (<10s) |
| audit_entries | (tenant_id, action_type, timestamp DESC) | Type-specific queries |
| audit_entries | (request_id) | Trace related entries |
| tasks | (user_id, status, priority_score DESC) | Briefing generation: top tasks for user |
| tasks | (purge_at) | Retention: batch purge expired tasks |
| policies | (scope, scope_id, domain, status) | Policy resolution: find active policy for scope+domain |
| exchanges | (initiator_user_id, started_at DESC) | User exchange history |
| exchanges | (responder_user_id, started_at DESC) | User exchange history |
