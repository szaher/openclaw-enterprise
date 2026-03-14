# Policy Engine Administration

The OpenClaw Enterprise policy engine is the central mechanism for controlling what the AI assistant can and cannot do. It is built on the Open Policy Agent (OPA) with Rego policies and enforces a strict hierarchy: **enterprise > org > team > user**. Lower levels in the hierarchy can only restrict permissions, never expand them.

> **Principle: Policy Over Code.** Behavior is defined by the policy engine, not hardcoded in application logic. If you need to change what the system does, change a policy -- not the source code.

> **Principle: Fail Closed.** If the OPA sidecar is unreachable, all actions are denied. There is no fallback to permissive mode.

---

## Policy Hierarchy

Policies are evaluated in a strict four-level hierarchy:

```
Enterprise (top-level, most restrictive authority)
  └── Organization
        └── Team
              └── User (most specific, least authority)
```

**Lower levels can only restrict, never expand.** A team policy cannot grant access that the organization policy denies. A user policy cannot grant access that the team policy denies.

### Hierarchy Merge Rules

When policies at different levels are merged, the following rules apply:

| Value Type | Merge Strategy | Example |
|---|---|---|
| Arrays | Intersection | Enterprise allows `[gpt-4, claude-3, llama-3]`, org allows `[gpt-4, claude-3]` -- result is `[gpt-4, claude-3]` |
| Booleans | AND | Enterprise `allow_external_models: true`, org `allow_external_models: false` -- result is `false` |
| Numbers | Minimum | Enterprise `max_tokens: 100000`, team `max_tokens: 50000` -- result is `50000` |

This ensures that the effective policy for any user is always the most restrictive combination across all hierarchy levels.

---

## Policy Domains

The policy engine covers 7 distinct domains:

### 1. Models (`models`)

Controls which AI models are available and under what conditions.

```json
{
  "domain": "models",
  "rules": {
    "allowed_models": ["gpt-4", "claude-3-opus", "llama-3-70b"],
    "allow_external_models": true,
    "max_tokens_per_request": 100000,
    "max_tokens_per_day": 1000000,
    "confidential_data_models": ["llama-3-70b"],
    "restricted_data_models": ["llama-3-70b"]
  }
}
```

> **Note:** The `confidential_data_models` and `restricted_data_models` fields control model routing for classified data. By default, confidential and restricted data is only sent to self-hosted models. See [Data Classification](data-classification.md) for details.

### 2. Actions (`actions`)

Defines the graduated autonomy model for each action type.

```json
{
  "domain": "actions",
  "rules": {
    "default_autonomy": "notify",
    "action_overrides": {
      "send_email": "approve",
      "read_email": "autonomous",
      "create_jira_ticket": "notify",
      "delete_repository": "block",
      "merge_pull_request": "approve"
    }
  }
}
```

The four autonomy levels are:

| Level | Behavior |
|---|---|
| `autonomous` | Action executes immediately with no user interaction |
| `notify` | Action executes immediately; user is notified afterward |
| `approve` | Action is queued; user must approve before execution |
| `block` | Action is denied; cannot be executed regardless of approval |

### 3. Integrations (`integrations`)

Controls connector access and permissions.

```json
{
  "domain": "integrations",
  "rules": {
    "allowed_connectors": ["gmail", "gcal", "jira", "github", "gdrive"],
    "default_permission": "read",
    "connector_overrides": {
      "github": {
        "permission": "read_write",
        "allowed_operations": ["read_issues", "read_prs", "comment_issue", "comment_pr"]
      },
      "gmail": {
        "permission": "read",
        "allowed_operations": ["read_email", "list_emails"]
      }
    }
  }
}
```

### 4. Agent-to-Agent (`agent_to_agent`)

Governs communication between OpenClaw instances via the OCIP protocol.

```json
{
  "domain": "agent_to_agent",
  "rules": {
    "allow_inbound": true,
    "allow_outbound": true,
    "max_classification_outbound": "internal",
    "allowed_peers": ["*.example.com"],
    "blocked_peers": [],
    "require_encryption": true,
    "loop_prevention_max_hops": 5
  }
}
```

### 5. Features (`features`)

Enables or disables enterprise feature modules.

```json
{
  "domain": "features",
  "rules": {
    "task_intelligence": true,
    "auto_response": true,
    "work_tracking": true,
    "org_intelligence": true,
    "visualization": true,
    "auto_response_autonomy": "notify"
  }
}
```

### 6. Data (`data`)

Controls data handling, retention, and classification behavior.

```json
{
  "domain": "data",
  "rules": {
    "default_classification": "internal",
    "allow_ai_reclassification": true,
    "ai_reclassification_direction": "upgrade_only",
    "retention_days": 365,
    "ephemeral_data_ttl_hours": 24,
    "allow_data_export": true,
    "export_max_classification": "internal"
  }
}
```

### 7. Audit (`audit`)

Controls audit log behavior and access.

```json
{
  "domain": "audit",
  "rules": {
    "log_all_actions": true,
    "log_policy_decisions": true,
    "log_data_access": true,
    "log_model_calls": true,
    "log_token_counts": true,
    "minimum_retention_days": 365,
    "allow_export": true,
    "export_roles": ["enterprise_admin"]
  }
}
```

---

## Policy Lifecycle

Every policy follows a three-state lifecycle:

```
draft  ──>  active  ──>  deprecated
```

| State | Behavior |
|---|---|
| `draft` | Policy is saved but not enforced. Visible only to admins. Use this to prepare and review policies before activation. |
| `active` | Policy is enforced by the OPA engine. Only one active policy per domain per hierarchy level. |
| `deprecated` | Policy is no longer enforced but is retained for audit history. Cannot be re-activated; create a new policy instead. |

---

## Policy CRUD API

All policy operations require at least `org_admin` role. Every mutation (POST, PUT, DELETE) requires a `change_reason` field and is logged to the immutable audit log with who, what, when, and why.

### Create a Policy

```bash
curl -X POST https://openclaw.example.com/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering Models Policy",
    "domain": "models",
    "scope": {
      "level": "org",
      "org_unit": "engineering"
    },
    "status": "draft",
    "rules": {
      "allowed_models": ["gpt-4", "claude-3-opus", "llama-3-70b"],
      "allow_external_models": true,
      "max_tokens_per_request": 50000,
      "confidential_data_models": ["llama-3-70b"]
    },
    "change_reason": "Initial models policy for engineering org"
  }'
```

**Response:**

```json
{
  "id": "pol_a1b2c3d4",
  "name": "Engineering Models Policy",
  "domain": "models",
  "scope": {
    "level": "org",
    "org_unit": "engineering"
  },
  "status": "draft",
  "rules": { "..." },
  "created_by": "admin@example.com",
  "created_at": "2026-03-13T10:00:00Z",
  "updated_at": "2026-03-13T10:00:00Z",
  "version": 1
}
```

### List Policies

```bash
# List all policies
curl -X GET https://openclaw.example.com/api/v1/policies \
  -H "Authorization: Bearer $TOKEN"

# Filter by domain and status
curl -X GET "https://openclaw.example.com/api/v1/policies?domain=models&status=active" \
  -H "Authorization: Bearer $TOKEN"

# Filter by scope
curl -X GET "https://openclaw.example.com/api/v1/policies?scope_level=org&org_unit=engineering" \
  -H "Authorization: Bearer $TOKEN"
```

### Get a Single Policy

```bash
curl -X GET https://openclaw.example.com/api/v1/policies/pol_a1b2c3d4 \
  -H "Authorization: Bearer $TOKEN"
```

### Update a Policy

```bash
curl -X PUT https://openclaw.example.com/api/v1/policies/pol_a1b2c3d4 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active",
    "rules": {
      "allowed_models": ["gpt-4", "claude-3-opus", "llama-3-70b"],
      "allow_external_models": false,
      "max_tokens_per_request": 50000,
      "confidential_data_models": ["llama-3-70b"]
    },
    "change_reason": "Activating policy and disabling external model access per security review"
  }'
```

### Deprecate a Policy

```bash
curl -X DELETE https://openclaw.example.com/api/v1/policies/pol_a1b2c3d4 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "change_reason": "Replaced by pol_e5f6g7h8 with updated model list"
  }'
```

> **Note:** DELETE does not permanently remove the policy. It transitions the policy to `deprecated` status. Policy records are never deleted from the database for audit trail purposes.

---

## OPA Sidecar Architecture

The policy engine runs OPA as a sidecar container accessible at `localhost:8181`. Rego policies are loaded from the `plugins/policy-engine/policies/` directory.

```
┌──────────────────────────────────────────────┐
│  Pod                                         │
│                                              │
│  ┌─────────────────┐   ┌─────────────────┐  │
│  │  OpenClaw        │   │  OPA Sidecar    │  │
│  │  Enterprise      │──>│  localhost:8181  │  │
│  │  (plugins)       │<──│  (Rego policies)│  │
│  └─────────────────┘   └─────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

### Policy Evaluation Flow

1. A plugin action triggers a policy check.
2. The policy engine plugin constructs a query with full context (user, org, team, action, data classification).
3. The query is sent to OPA at `localhost:8181/v1/data/openclaw/<domain>`.
4. OPA evaluates the Rego policy against the hierarchical policy data.
5. OPA returns an allow/deny decision with the matching policy ID and reason.
6. The decision is logged to the audit trail.
7. The action proceeds or is blocked based on the decision.

### Fail-Closed Behavior

If the OPA sidecar is unreachable (network error, crash, timeout):

- **All actions are denied.** There is no fallback to a permissive mode.
- An alert is raised via the operator health checks.
- The denial is logged with reason `opa_unreachable`.

This is a constitutional requirement and cannot be overridden by policy.

---

## Hot-Reload

Policy changes take effect within **60 seconds** of being saved. The reload process:

1. Admin creates or updates a policy via the API.
2. The policy is persisted to PostgreSQL.
3. The policy engine plugin detects the change on its next sync cycle (runs every 60 seconds).
4. Updated policy data is pushed to the OPA sidecar via the OPA Data API.
5. Subsequent policy evaluations use the new policy data.

No restart of any service is required.

---

## Graduated Autonomy Model

The graduated autonomy model allows administrators to control how much freedom the AI assistant has for each type of action. This is configured through the `actions` policy domain.

| Level | User Experience | Use Case |
|---|---|---|
| `autonomous` | Action happens silently. User sees result in activity feed. | Low-risk reads: listing emails, viewing calendar |
| `notify` | Action happens immediately. User receives a notification. | Medium-risk actions: creating draft emails, reading documents |
| `approve` | Action is queued. User must click "Approve" before execution. | High-risk actions: sending emails, creating tickets, posting comments |
| `block` | Action is denied. User is told the action is not permitted. | Prohibited actions: deleting repositories, bulk data export |

### Setting Default Autonomy

The `default_autonomy` field in the `actions` domain sets the baseline for all actions not explicitly overridden:

```json
{
  "domain": "actions",
  "rules": {
    "default_autonomy": "notify"
  }
}
```

> **Recommendation:** Start with `approve` as the default autonomy level for new deployments. As users and administrators gain confidence in the system, selectively move specific actions to `notify` or `autonomous`.

---

## Example Policies

### Block External Models for Confidential Data

This enterprise-level policy ensures that confidential and restricted data is never sent to external (cloud-hosted) model providers.

```json
{
  "name": "Enterprise Data Model Routing",
  "domain": "models",
  "scope": { "level": "enterprise" },
  "status": "active",
  "rules": {
    "allowed_models": ["gpt-4", "claude-3-opus", "llama-3-70b"],
    "allow_external_models": true,
    "confidential_data_models": ["llama-3-70b"],
    "restricted_data_models": ["llama-3-70b"]
  },
  "change_reason": "Route confidential/restricted data to self-hosted Llama only"
}
```

With this policy, public and internal data can use any allowed model, but confidential and restricted data is routed exclusively to the self-hosted `llama-3-70b` instance.

### Set Default Autonomy with Overrides

```json
{
  "name": "Engineering Actions Policy",
  "domain": "actions",
  "scope": {
    "level": "org",
    "org_unit": "engineering"
  },
  "status": "active",
  "rules": {
    "default_autonomy": "notify",
    "action_overrides": {
      "read_email": "autonomous",
      "read_calendar": "autonomous",
      "send_email": "approve",
      "create_jira_ticket": "approve",
      "comment_pull_request": "notify",
      "delete_branch": "block"
    }
  },
  "change_reason": "Baseline autonomy for engineering: reads autonomous, writes need approval"
}
```

### Read-Only Connector Defaults

```json
{
  "name": "Enterprise Integration Defaults",
  "domain": "integrations",
  "scope": { "level": "enterprise" },
  "status": "active",
  "rules": {
    "allowed_connectors": ["gmail", "gcal", "jira", "github", "gdrive"],
    "default_permission": "read",
    "connector_overrides": {}
  },
  "change_reason": "All connectors read-only by default per least privilege principle"
}
```

An org-level policy can then selectively enable write access for specific connectors:

```json
{
  "name": "Engineering GitHub Write Access",
  "domain": "integrations",
  "scope": {
    "level": "org",
    "org_unit": "engineering"
  },
  "status": "active",
  "rules": {
    "allowed_connectors": ["gmail", "gcal", "jira", "github", "gdrive"],
    "default_permission": "read",
    "connector_overrides": {
      "github": {
        "permission": "read_write",
        "allowed_operations": ["read_issues", "read_prs", "comment_issue", "comment_pr"]
      }
    }
  },
  "change_reason": "Enable GitHub commenting for engineering org"
}
```

---

## Troubleshooting

### Policy Not Taking Effect

1. Check that the policy status is `active` (not `draft` or `deprecated`).
2. Wait up to 60 seconds for hot-reload to propagate the change.
3. Verify the policy scope matches the target user's org unit path.
4. Check for a higher-level policy that may be restricting the permission (hierarchy merge rules apply).
5. Query the audit log for the specific action to see which policy was applied and the evaluation result.

### OPA Unreachable Errors

1. Check that the OPA sidecar container is running: `kubectl get pods -l app=openclaw`.
2. Verify OPA health: `curl http://localhost:8181/health`.
3. Check OPA logs for Rego compilation errors: `kubectl logs <pod> -c opa`.
4. Verify that Rego policy files are correctly mounted.

### Unexpected Denials

Query the audit log for the denied action:

```bash
curl -X GET "https://openclaw.example.com/api/v1/audit?action_type=policy_decision&outcome=denied&userId=user@example.com" \
  -H "Authorization: Bearer $TOKEN"
```

The audit entry will include the `policy_applied` and `policy_result` fields showing exactly which policy caused the denial and why.
