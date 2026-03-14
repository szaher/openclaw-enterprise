# How To: Write Custom Policies

This guide explains how to write, apply, and verify custom policies for OpenClaw Enterprise. Policies are written in Rego (OPA) and govern seven domains: models, actions, integrations, agent-to-agent, features, data, and audit.

## Policy Fundamentals

### Policy Structure

Every policy has three components:

| Field | Description |
|---|---|
| **scope** | Hierarchical level: `enterprise`, `org`, `team`, or `user` |
| **domain** | What the policy governs: `models`, `actions`, `integrations`, `agent-to-agent`, `features`, `data`, `audit` |
| **content** | The Rego policy source code |

### Policy Hierarchy

Policies follow a strict hierarchy where lower levels can restrict further but **cannot expand** beyond the parent level:

```
Enterprise Policy  (ceiling -- cannot be overridden)
  └── Organization Policy  (within enterprise bounds)
       └── Team Policy  (within org bounds)
            └── User Preferences  (within team bounds)
```

For example, if an enterprise policy blocks external model calls for confidential data, no org, team, or user policy can override that restriction.

### Default Behavior

The policy engine defaults to **deny** in all cases:

- If no policy matches, the action is denied.
- If the policy engine is unreachable, all actions are denied (fail-closed).
- If a data classification is unknown, it defaults to `restricted` (highest level).

## Example 1: Restrict Models for Confidential Data

This policy ensures that confidential and restricted data is only processed by self-hosted models, not external providers like OpenAI or Anthropic.

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: model-routing-policy
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: models
      name: restrict-confidential-to-self-hosted
      content: |
        package openclaw.enterprise.models

        import rego.v1

        default allow := false

        # Allow public and internal data on any model
        allow if {
          input.data_classification in ["public", "internal"]
        }

        # Allow confidential/restricted only on self-hosted models
        allow if {
          input.data_classification in ["confidential", "restricted"]
          input.additional.provider == "self-hosted"
        }

        # Deny confidential/restricted on external models
        deny_reason := "Confidential/restricted data must use self-hosted models" if {
          input.data_classification in ["confidential", "restricted"]
          not input.additional.provider == "self-hosted"
        }

        reason := deny_reason if deny_reason
        reason := "Model call allowed by policy" if not deny_reason

        constraints := {
          "max_classification": "restricted",
        }
```

## Example 2: Set Auto-Response Autonomy Levels per Team

This policy allows the engineering team to use fully autonomous auto-responses for informational messages, while requiring approval for anything classified as `needs-response` or `critical`.

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: auto-response-engineering
  namespace: openclaw
spec:
  policies:
    - scope: team
      domain: actions
      name: engineering-auto-response
      content: |
        package openclaw.enterprise.actions

        import rego.v1

        default allow := false
        default require_approval := false

        # Autonomous for informational and noise messages
        autonomy_level := "autonomous" if {
          input.action == "auto_respond"
          input.context.additional.message_classification in ["informational", "noise"]
        }

        # Notify for needs-response messages
        autonomy_level := "notify" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "needs-response"
        }

        # Require approval for critical messages
        autonomy_level := "approve" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "critical"
        }

        allow if { autonomy_level in ["autonomous", "notify"] }
        require_approval if { autonomy_level == "approve" }

        reason := "Auto-response: autonomous" if { autonomy_level == "autonomous" }
        reason := "Auto-response: notify user" if { autonomy_level == "notify" }
        reason := "Auto-response: requires approval" if { autonomy_level == "approve" }

        constraints := {
          "disclosure_required": autonomy_level == "notify",
        }
```

## Example 3: Configure Connector Permissions

This policy enables read access to all connectors but restricts write access to GitHub and Jira only:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: connector-permissions
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: integrations
      name: connector-read-write-policy
      content: |
        package openclaw.enterprise.integrations

        import rego.v1

        default allow := false

        # Allow read access to all connectors
        allow if {
          input.action in [
            "email_read", "email_search",
            "calendar_list", "calendar_search",
            "jira_read", "jira_search",
            "github_pr_list", "github_issue_search",
            "gdrive_search", "gdrive_read"
          ]
        }

        # Allow write access only to GitHub and Jira
        allow if {
          input.action in ["jira_update", "github_pr_comment"]
          input.context.targetSystem in ["jira", "github"]
        }

        # Block write access to Gmail, GCal, GDrive
        deny if {
          input.action in ["email_send", "email_draft", "calendar_create", "gdrive_write"]
        }

        reason := "Write access denied for this connector" if { deny }
        reason := "Connector access allowed" if { allow }
```

## Applying Policies

### Via PolicyBundle Custom Resource

The recommended method for production deployments. Create a YAML file and apply with kubectl:

```bash
kubectl apply -f policy-bundle.yaml
```

The K8s operator's policy controller detects the change, validates the hierarchy, and loads the policies into OPA. You can check the bundle status:

```bash
kubectl get policybundle -n openclaw

# Example output:
# NAME                        APPLIED   TOTAL   AGE
# model-routing-policy        1         1       5m
# connector-permissions       1         1       3m
```

To see details including conditions:

```bash
kubectl describe policybundle model-routing-policy -n openclaw
```

### Via Admin API

For programmatic policy management, use the admin API:

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/policies" \
  -d '{
    "scope": "enterprise",
    "domain": "models",
    "name": "restrict-confidential",
    "content": "package openclaw.enterprise.models\n\nimport rego.v1\n\ndefault allow := false\n\nallow if {\n  input.data_classification in [\"public\", \"internal\"]\n}\n",
    "changeReason": "Restrict confidential data to self-hosted models"
  }'
```

## Verifying Policies

### Test with OPA CLI

Before deploying, test your policy locally with the OPA CLI:

```bash
# Test a policy file with sample input
echo '{
  "data_classification": "confidential",
  "additional": { "provider": "openai" }
}' | opa eval \
  --data plugins/policy-engine/rego/models.rego \
  --input /dev/stdin \
  'data.openclaw.enterprise.models.allow'
```

Expected output for the example above (should be denied):

```json
{
  "result": [
    {
      "expressions": [
        {
          "value": false
        }
      ]
    }
  ]
}
```

### Test via Policy Evaluation API

After deploying, test the policy through the gateway:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/policies/evaluate" \
  -d '{
    "tenantId": "acme-corp",
    "userId": "user-123",
    "action": "email_read",
    "context": {
      "dataClassification": "internal",
      "targetSystem": "gmail"
    }
  }'
```

Expected response:

```json
{
  "decision": "allow",
  "policyApplied": "connector-read-write-policy",
  "reason": "Connector access allowed",
  "constraints": {}
}
```

### Run Rego Unit Tests

If you have written test files for your policies:

```bash
opa test plugins/policy-engine/rego/ -v
```

## Hierarchy Rules

When writing policies at lower scopes, remember:

1. **A child scope cannot allow what a parent scope denies.** If the enterprise policy blocks external models for confidential data, an org policy cannot re-enable it.

2. **A child scope can restrict further.** If the enterprise policy allows all models for internal data, a team policy can restrict that team to self-hosted models only.

3. **The policy engine resolves conflicts by choosing the most restrictive result.** If enterprise says "allow" and team says "deny", the result is "deny".

4. **Violation detection is automatic.** The policy controller's admission webhook validates hierarchy compliance when a PolicyBundle is applied. Violations are rejected with a `PolicyHierarchyViolationError`.

Example of an invalid policy (would be rejected):

```yaml
# This team policy tries to allow confidential data on external models,
# but the enterprise policy blocks it. The webhook will reject this.
- scope: team
  domain: models
  name: team-allow-confidential-external
  content: |
    package openclaw.enterprise.models
    import rego.v1
    allow if {
      input.data_classification == "confidential"
      # This attempts to expand beyond enterprise ceiling -- REJECTED
    }
```

## Hot Reload

Policy changes take effect via hot-reload. The policy-engine plugin polls for changes every 10 seconds (configurable via `POLICY_HOT_RELOAD_INTERVAL_MS`). The maximum delay before a policy change takes effect is 60 seconds (`POLICY_HOT_RELOAD_MAX_DELAY_MS`).

> **Note:** Policy changes are not retroactive. Actions taken before the policy change remain as they were. The audit log records which policy version was in effect at the time of each action.

## Policy Domains Reference

| Domain | Controls | Key Input Fields |
|---|---|---|
| `models` | Which AI models can be used, classification routing, cost limits | `data_classification`, `additional.provider` |
| `actions` | Tool autonomy levels (autonomous/notify/approve/block) | `action`, `context.additional.message_classification` |
| `integrations` | Connector permissions (read/write/admin) | `action`, `context.targetSystem` |
| `agent-to-agent` | Exchange types, round limits, classification gates | `exchange_type`, `classification_level` |
| `features` | Feature flags per scope | `feature_name`, `scope` |
| `data` | Classification levels, retention, external sharing | `data_classification`, `purpose` |
| `audit` | What is logged, retention period, query permissions | `action_type`, `scope` |
