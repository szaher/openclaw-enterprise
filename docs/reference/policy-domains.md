# OpenClaw Enterprise -- Policy Domains Reference

This document provides a detailed reference for each of the 7 policy domains in OpenClaw Enterprise. Policies are evaluated by OPA (Open Policy Agent) using Rego rules. Each domain has its own Rego package under `plugins/policy-engine/rego/`.

---

## Table of Contents

- [Policy Scope Hierarchy](#policy-scope-hierarchy)
- [Domain: models](#domain-models)
- [Domain: actions](#domain-actions)
- [Domain: integrations](#domain-integrations)
- [Domain: agent-to-agent](#domain-agent-to-agent)
- [Domain: features](#domain-features)
- [Domain: data](#domain-data)
- [Domain: audit](#domain-audit)
- [Policy Evaluation Flow](#policy-evaluation-flow)

---

## Policy Scope Hierarchy

Policies are organized in a strict hierarchy. Lower scopes can restrict but never expand what higher scopes allow.

```
enterprise  (highest authority)
    |
   org
    |
  team
    |
  user      (lowest authority)
```

| Scope | Description | Who Can Manage |
|-------|-------------|----------------|
| `enterprise` | Global defaults for the entire deployment | `enterprise_admin` |
| `org` | Organizational unit overrides | `enterprise_admin`, `org_admin` |
| `team` | Team-level overrides within an org | `enterprise_admin`, `org_admin`, `team_lead` |
| `user` | Individual user overrides | `enterprise_admin`, `org_admin`, `team_lead` |

**Hierarchy Validation Rule:** A lower scope policy cannot set a more permissive value than its parent. For example, if the enterprise policy sets `max_classification: confidential`, an org policy cannot set `max_classification: restricted`. Violations are rejected at write time with a `POLICY_HIERARCHY_VIOLATION` error.

---

## Domain: models

**Rego Package:** `openclaw.enterprise.models`

**Purpose:** Controls which AI models can be used and what data classification levels they can process.

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `allowed_classifications` | string[] | Classification levels permitted for model calls |
| `max_classification` | string | Maximum classification level any model can process |
| `allowed_providers` | string[] | List of approved model providers |
| `sensitive_data_model` | string | Model to use for sensitive data (must be self-hosted) |

### Model Routing by Classification

| Data Classification | Routing Rule |
|---------------------|-------------|
| `public` | Any approved provider |
| `internal` | Any approved provider |
| `confidential` | Self-hosted models only |
| `restricted` | Self-hosted models only, requires approval |

### Rego Evaluation Logic

- Default: deny all model calls.
- Allow if data classification is in `allowed_classifications`.
- Block external model providers for `confidential` or `restricted` data.
- If no policy is loaded, defaults to allowing `public` and `internal` only.

### Example YAML

```yaml
# Enterprise-level model policy
allowed_classifications:
  - public
  - internal
  - confidential
max_classification: confidential
allowed_providers:
  - openai
  - anthropic
  - self-hosted
sensitive_data_model: llama-3-70b-local
```

```yaml
# Org-level restriction (engineering -- restricts to internal only)
allowed_classifications:
  - public
  - internal
max_classification: internal
```

---

## Domain: actions

**Rego Package:** `openclaw.enterprise.actions`

**Purpose:** Controls the autonomy level of agent actions. Each action can be set to run autonomously, with notification, with approval, or blocked entirely.

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `default_autonomy` | string | Default autonomy level for unlisted actions |
| `actions` | map | Per-action autonomy overrides |
| `blocked` | string[] | List of explicitly blocked actions |

### Autonomy Levels

| Level | Description | Behavior |
|-------|-------------|----------|
| `autonomous` | Agent executes without human involvement | Action proceeds immediately |
| `notify` | Agent executes and notifies the user | Action proceeds, user receives notification |
| `approve` | Agent requests human approval before executing | Action queued for approval |
| `block` | Action is forbidden | Action is denied |

### Rego Evaluation Logic

- Look up the specific action in `data.policy.actions`. If found, use that autonomy level.
- If not found, fall back to `data.policy.default_autonomy`.
- If no default is set, default to `approve` (fail closed).
- If the action appears in `data.policy.blocked`, deny unconditionally.
- `notify` level sets `disclosure_required: true` in constraints.

### Example YAML

```yaml
# Enterprise default action policy
default_autonomy: notify
actions:
  email_send: approve
  email_read: autonomous
  calendar_create: approve
  jira_comment: notify
  github_pr_review: autonomous
blocked:
  - email_delete
  - jira_delete_issue
  - github_force_push
```

```yaml
# Team override -- more restrictive for security team
default_autonomy: approve
actions:
  email_read: notify
blocked:
  - email_send
  - email_delete
  - jira_delete_issue
  - github_force_push
  - gdrive_share_external
```

---

## Domain: integrations

**Rego Package:** `openclaw.enterprise.integrations`

**Purpose:** Controls which connectors are enabled and their permission levels (read/write/admin).

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `connectors` | map | Per-connector configuration |
| `connectors.<type>.enabled` | boolean | Whether the connector is enabled |
| `connectors.<type>.permissions` | string | Permission level: `read`, `write`, `admin` (default: `read`) |
| `connectors.<type>.max_classification` | string | Maximum classification for data from this connector |

### Permission Levels

| Permission | Read Actions | Write Actions |
|------------|-------------|---------------|
| `read` | Allowed | Requires approval |
| `write` | Allowed | Allowed |
| `admin` | Allowed | Allowed (plus admin operations) |

### Connector Type Mapping

Actions are mapped to connector types by prefix:

| Action Prefix | Connector Type |
|---------------|---------------|
| `email_` | `gmail` |
| `calendar_` | `gcal` |
| `jira_` | `jira` |
| `github_` | `github` |
| `gdrive_` | `gdrive` |

### Rego Evaluation Logic

- Extract connector type from the action name prefix.
- Check if the connector is enabled in the policy.
- For read actions (`_read`, `_search` suffix): allow if connector is enabled.
- For write actions: allow only if permissions are `write` or `admin`.
- For write actions on read-only connectors: require approval.

### Example YAML

```yaml
# Enterprise integrations policy
connectors:
  gmail:
    enabled: true
    permissions: write
    max_classification: confidential
  gcal:
    enabled: true
    permissions: write
    max_classification: internal
  jira:
    enabled: true
    permissions: write
    max_classification: internal
  github:
    enabled: true
    permissions: read
    max_classification: public
  gdrive:
    enabled: true
    permissions: read
    max_classification: confidential
```

```yaml
# Org override -- disable GitHub for legal team
connectors:
  github:
    enabled: false
  gdrive:
    enabled: true
    permissions: read
    max_classification: restricted
```

---

## Domain: agent-to-agent

**Rego Package:** `openclaw.enterprise.agent_exchange`

**Purpose:** Governs OCIP agent-to-agent exchanges, including allowed exchange types, classification limits, round limits, and cross-org/cross-enterprise rules.

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether agent exchanges are enabled |
| `allowed_exchange_types` | string[] | Permitted exchange types |
| `max_classification_shared` | string | Maximum classification level shareable in exchanges |
| `max_rounds` | integer | Maximum conversation rounds before escalation |
| `cross_org` | boolean | Whether cross-org exchanges within the same tenant are allowed |

### Exchange Types

| Type | Description | Reply Policy | Requires Commitment |
|------|-------------|-------------|---------------------|
| `information_query` | Request for information | `agent-ok` | No |
| `commitment_request` | Request that involves a commitment | `agent-ok` | Yes (human must approve) |
| `meeting_scheduling` | Schedule a meeting | `human-only` | Yes (both humans must approve) |

### Cross-Organization Rules

| Scenario | Policy |
|----------|--------|
| Same tenant, same org unit | Always allowed |
| Same tenant, different org unit | Allowed if `cross_org: true` in policy |
| Different tenants | **Blocked unconditionally** |

### Rego Evaluation Logic

- Check if exchanges are enabled.
- Validate the exchange type is in the allowed list.
- Check classification level against `max_classification_shared`.
- Block cross-enterprise exchanges unconditionally.
- For cross-org exchanges, check if `cross_org` is `true`.
- `commitment_request` always requires human approval regardless of other settings.

### Example YAML

```yaml
# Enterprise agent-to-agent policy
enabled: true
allowed_exchange_types:
  - information_query
  - commitment_request
  - meeting_scheduling
max_classification_shared: internal
max_rounds: 3
cross_org: true
```

```yaml
# Org restriction -- legal team: no cross-org, information only
enabled: true
allowed_exchange_types:
  - information_query
max_classification_shared: public
max_rounds: 2
cross_org: false
```

---

## Domain: features

**Rego Package:** `openclaw.enterprise.features`

**Purpose:** Enable or disable specific product features per scope. Provides a feature-flag mechanism governed by policy rather than configuration files.

### Policy Fields

The policy object is a flat map of feature names to booleans:

| Field | Type | Description |
|-------|------|-------------|
| `<feature_name>` | boolean | Whether the named feature is enabled |

### Common Feature Flags

| Feature | Description |
|---------|-------------|
| `auto_response` | Enable automatic email/message responses |
| `task_intelligence` | Enable task discovery and correlation |
| `briefing_generation` | Enable daily briefing generation |
| `org_intelligence` | Enable organization news and document monitoring |
| `visualization` | Enable D3.js visualization capabilities |
| `ocip_exchange` | Enable OCIP agent-to-agent protocol |
| `work_tracking` | Enable PR-Jira correlation and standup generation |

### Rego Evaluation Logic

- Check if the requested feature name exists in the policy and is set to `true`.
- If the feature is missing or set to `false`, deny.

### Example YAML

```yaml
# Enterprise feature flags
auto_response: true
task_intelligence: true
briefing_generation: true
org_intelligence: true
visualization: true
ocip_exchange: true
work_tracking: true
```

```yaml
# Org override -- disable auto-response for compliance team
auto_response: false
ocip_exchange: false
```

---

## Domain: data

**Rego Package:** `openclaw.enterprise.data`

**Purpose:** Governs data classification overrides, external sharing limits, and retention policies.

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `external_sharing_max` | string | Maximum classification level that can be shared externally |
| `classification_overrides` | map | Per-connector or per-source classification overrides |
| `retention` | object | Retention configuration |

### Rego Evaluation Logic

- Compare the data classification of the request against `external_sharing_max`.
- If the classification exceeds the allowed sharing level, deny.
- Classification order: `public` (0) < `internal` (1) < `confidential` (2) < `restricted` (3).

### Example YAML

```yaml
# Enterprise data policy
external_sharing_max: internal
classification_overrides:
  gmail:
    default: internal
  gdrive:
    default: confidential
retention:
  active_days: 90
  archive_after_days: 30
  purge_after_archive_days: 90
```

```yaml
# Org override -- HR can handle confidential externally
external_sharing_max: confidential
```

---

## Domain: audit

**Rego Package:** `openclaw.enterprise.audit`

**Purpose:** Controls audit logging behavior, retention period, and export permissions.

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `log_all_actions` | boolean | Whether to log all actions (true) or only policy-evaluated ones |
| `retention_years` | integer | Number of years to retain audit records (minimum: 1) |
| `export_roles` | string[] | Roles permitted to export audit data |

### Rego Evaluation Logic

- Audit logging is always allowed and never blocked. The audit policy governs what is logged and who can query, not whether logging occurs.
- Constraints return `log_all_actions` and `retention_years` for the audit writer to use.

### Example YAML

```yaml
# Enterprise audit policy
log_all_actions: true
retention_years: 3
export_roles:
  - enterprise_admin
```

```yaml
# Org override -- longer retention for regulated industry
retention_years: 7
```

---

## Policy Evaluation Flow

When an action is evaluated, the following steps occur:

1. **Resolve scope hierarchy**: The policy engine resolves policies from enterprise down to the user's specific scope, merging them with lower scopes being more restrictive.

2. **Load policy data into OPA**: The merged policy content (YAML parsed to JSON) is loaded into the OPA sidecar as `data.policy`.

3. **Evaluate Rego rules**: The OPA sidecar evaluates the appropriate Rego package for the policy domain.

4. **Return decision**: The evaluation returns:
   - `allow` (boolean): whether the action is permitted
   - `require_approval` (boolean): whether human approval is needed
   - `reason` (string): human-readable explanation
   - `constraints` (object): domain-specific constraints to apply

5. **Audit log**: Every evaluation is recorded as an audit entry with the policy applied, the result, and the reason.

### OPA Sidecar Configuration

| Property | Value |
|----------|-------|
| URL | `http://localhost:8181` |
| Evaluate timeout | 5,000 ms |
| Hot-reload interval | 10,000 ms |
| Maximum hot-reload delay | 60,000 ms |

**Source:** `plugins/policy-engine/rego/`, `plugins/shared/src/constants.ts`
