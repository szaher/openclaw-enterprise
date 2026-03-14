# How To: Enable Auto-Response

This guide walks through enabling and configuring the auto-response feature, which uses policy-governed autonomy levels to automatically respond to messages on behalf of users.

## Overview

The auto-response plugin classifies incoming messages into four categories:

| Classification | Description | Default Behavior |
|---|---|---|
| `critical` | Urgent messages requiring immediate attention | Block (always escalate to human) |
| `needs-response` | Messages that need a reply | Require approval |
| `informational` | FYI messages, status updates | Notify (respond and notify user) |
| `noise` | Automated notifications, newsletters | Autonomous (respond silently) |

The autonomy level for each classification is controlled by policy. The available levels are:

- **autonomous** -- Respond automatically without user involvement
- **notify** -- Respond automatically and notify the user what was sent
- **approve** -- Draft a response and queue it for user approval
- **block** -- Do not respond; escalate to the user

## Step 1: Create an Action Policy Allowing Auto-Response

Auto-response is disabled by default. You must create a policy that explicitly allows it.

### Basic Auto-Response Policy

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: auto-response-policy
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: actions
      name: enable-auto-response
      content: |
        package openclaw.enterprise.actions

        import rego.v1

        default allow := false
        default require_approval := false

        # Auto-response autonomy levels by message classification
        autonomy_level := "block" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "critical"
        }

        autonomy_level := "approve" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "needs-response"
        }

        autonomy_level := "notify" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "informational"
        }

        autonomy_level := "autonomous" if {
          input.action == "auto_respond"
          input.context.additional.message_classification == "noise"
        }

        allow if { autonomy_level in ["autonomous", "notify"] }
        require_approval if { autonomy_level == "approve" }

        reason := "Auto-response blocked for critical messages" if {
          autonomy_level == "block"
        }
        reason := "Auto-response requires approval" if {
          autonomy_level == "approve"
        }
        reason := "Auto-response allowed with notification" if {
          autonomy_level == "notify"
        }
        reason := "Auto-response allowed autonomously" if {
          autonomy_level == "autonomous"
        }

        constraints := {
          "disclosure_required": true,
        }
```

Apply the policy:

```bash
kubectl apply -f auto-response-policy.yaml
```

> **Important:** The `constraints.disclosure_required` field ensures that all auto-responses include the AI disclosure label ("Sent by user's OpenClaw assistant"). This is a transparency requirement from the constitution and should always be `true` for auto-responses.

## Step 2: Configure Per-Channel Scope

You can restrict auto-response to specific channels (Slack channels, email labels) by adding channel conditions to your policy:

```yaml
- scope: team
  domain: actions
  name: engineering-auto-response-channels
  content: |
    package openclaw.enterprise.actions

    import rego.v1

    default allow := false

    # Only enable auto-response for specific channels
    allow if {
      input.action == "auto_respond"
      input.context.channel in [
        "slack:#engineering-general",
        "slack:#engineering-alerts",
        "email:notifications@company.com"
      ]
      input.context.additional.message_classification in ["informational", "noise"]
    }

    # Block auto-response on all other channels
    deny if {
      input.action == "auto_respond"
      not input.context.channel in [
        "slack:#engineering-general",
        "slack:#engineering-alerts",
        "email:notifications@company.com"
      ]
    }

    reason := "Auto-response not enabled for this channel" if { deny }
    reason := "Auto-response allowed for engineering channels" if { allow }
```

## Step 3: Set Autonomy Levels for Different Classifications

For a more granular setup, you can set different autonomy levels per data classification level. For example, never auto-respond when the message contains confidential data:

```yaml
- scope: enterprise
  domain: actions
  name: auto-response-data-classification
  content: |
    package openclaw.enterprise.actions

    import rego.v1

    default allow := false

    # Block auto-response for confidential/restricted data
    deny if {
      input.action == "auto_respond"
      input.context.dataClassification in ["confidential", "restricted"]
    }

    # Allow auto-response only for public/internal data
    allow if {
      input.action == "auto_respond"
      input.context.dataClassification in ["public", "internal"]
      input.context.additional.message_classification in ["informational", "noise"]
    }

    require_approval if {
      input.action == "auto_respond"
      input.context.dataClassification in ["public", "internal"]
      input.context.additional.message_classification in ["needs-response"]
    }

    reason := "Auto-response blocked for classified data" if { deny }
    reason := "Auto-response allowed for low-sensitivity messages" if { allow }
    reason := "Auto-response requires approval" if { require_approval }
```

## Step 4: Test with Sample Messages

After applying your policy, test auto-response behavior through the agent:

```bash
# Send a test message to verify classification
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/auto-response/test-classify" \
  -d '{
    "channel": "slack:#engineering-general",
    "message": "Build pipeline succeeded for PR #42",
    "sender": "ci-bot@company.com"
  }'
```

Expected response:

```json
{
  "classification": "noise",
  "autonomyLevel": "autonomous",
  "policyApplied": "enable-auto-response",
  "wouldRespond": true,
  "wouldNotify": false
}
```

## Step 5: Review the Approval Queue

When auto-response is set to `approve`, draft responses are queued for user review.

### List Pending Approvals

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/auto-response/pending?userId=user-123" \
  | jq '.'
```

Example response:

```json
{
  "items": [
    {
      "id": "ar-001",
      "channel": "slack:#engineering-general",
      "originalMessage": "Can you review PR #87 by end of day?",
      "classification": "needs-response",
      "draftResponse": "I will review PR #87 today. Thanks for the heads up.",
      "createdAt": "2026-03-13T14:30:00.000Z"
    }
  ]
}
```

### Approve a Pending Response

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/auto-response/approve" \
  -d '{
    "id": "ar-001",
    "tenantId": "acme-corp",
    "userId": "user-123"
  }'
```

### Reject a Pending Response

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/auto-response/reject" \
  -d '{
    "id": "ar-001",
    "tenantId": "acme-corp",
    "userId": "user-123"
  }'
```

## Step 6: Monitor via Audit Log

All auto-response actions are logged in the audit trail. Query auto-response activity:

```bash
# All auto-response actions for a user
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=tool_invocation&userId=user-123" \
  | jq '.entries[] | select(.actionDetail.tool == "auto_respond")'
```

```bash
# Denied auto-responses (blocked by policy)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=tool_invocation&policyResult=deny&userId=user-123" \
  | jq '.entries[] | select(.actionDetail.tool == "auto_respond")'
```

The audit entry includes:

| Field | Description |
|---|---|
| `actionType` | `tool_invocation` |
| `actionDetail.tool` | `auto_respond` |
| `actionDetail.channel` | The channel the response was sent to |
| `actionDetail.classification` | Message classification |
| `policyApplied` | Which policy was evaluated |
| `policyResult` | `allow`, `deny`, or `require_approval` |
| `outcome` | `success`, `denied`, or `pending_approval` |

## Troubleshooting

| Symptom | Possible Cause | Resolution |
|---|---|---|
| Auto-response never fires | No action policy allows `auto_respond` | Create and apply an action policy with `allow` rules |
| All messages queued for approval | Default autonomy is `approve` | Adjust policy to set `autonomous` or `notify` for specific classifications |
| Responses missing AI disclosure | `disclosure_required` not set in constraints | Add `constraints.disclosure_required: true` to the policy |
| Auto-response on confidential data | Missing data classification guard | Add a `deny` rule for `dataClassification in ["confidential", "restricted"]` |
