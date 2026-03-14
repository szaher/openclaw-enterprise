# How To: Set Up GitHub/Jira Webhooks for Work Tracking

This guide walks through configuring webhooks from GitHub and Jira to enable the work-tracking plugin's PR-to-Jira correlation, automatic ticket updates, and standup generation.

## Overview

The work-tracking plugin listens for webhook events from GitHub and Jira to:

- Correlate pull requests with Jira tickets (via branch names, PR descriptions, and commit messages)
- Automatically update Jira ticket status when PRs are merged
- Track code activity for end-of-day standup summaries

## Prerequisites

- OpenClaw Enterprise running with the work-tracking plugin enabled
- Admin access to the GitHub repository or organization
- Admin access to the Jira project
- A policy allowing write access to the Jira connector (for auto-updates)

## Step 1: Configure GitHub Webhook

### Find Your Webhook Endpoint

The work-tracking plugin exposes a webhook endpoint at:

```
https://<your-openclaw-domain>/api/v1/webhooks/github
```

### Create the Webhook in GitHub

1. Navigate to your GitHub repository (or organization for org-wide webhooks).
2. Go to **Settings > Webhooks > Add webhook**.
3. Configure the webhook:

| Setting | Value |
|---|---|
| Payload URL | `https://<your-openclaw-domain>/api/v1/webhooks/github` |
| Content type | `application/json` |
| Secret | A shared secret (see below) |
| SSL verification | Enable |

4. Select individual events:
   - **Pull requests** -- Triggers on PR open, close, merge, review
   - **Pushes** -- Triggers on code pushes (for commit tracking)

5. Click **Add webhook**.

### Store the Webhook Secret

Create a Kubernetes Secret for the webhook verification:

```bash
kubectl create secret generic github-webhook-secret \
  --namespace openclaw \
  --from-literal=secret='YOUR_WEBHOOK_SECRET'
```

Reference it in your OpenClawInstance integration config:

```yaml
integrations:
  - type: github
    enabled: true
    config:
      webhookSecretRef: github-webhook-secret
```

## Step 2: Configure Jira Webhook

### Find Your Webhook Endpoint

The work-tracking plugin exposes a Jira webhook endpoint at:

```
https://<your-openclaw-domain>/api/v1/webhooks/jira
```

### Create the Webhook in Jira

1. Navigate to **Jira Administration > System > WebHooks**.
2. Click **Create a WebHook**.
3. Configure the webhook:

| Setting | Value |
|---|---|
| Name | OpenClaw Enterprise Work Tracking |
| URL | `https://<your-openclaw-domain>/api/v1/webhooks/jira` |
| Secret | A shared secret |

4. Select events:
   - **Issue > updated** -- Triggers when issue fields change (status, assignee, priority)

5. Optionally filter by project to reduce noise:
   - JQL filter: `project = ENG` (replace with your project key)

6. Click **Create**.

### Store the Jira Webhook Secret

```bash
kubectl create secret generic jira-webhook-secret \
  --namespace openclaw \
  --from-literal=secret='YOUR_JIRA_WEBHOOK_SECRET'
```

Reference it in your OpenClawInstance:

```yaml
integrations:
  - type: jira
    enabled: true
    config:
      baseUrl: "https://your-org.atlassian.net"
      webhookSecretRef: jira-webhook-secret
```

## Step 3: Verify Webhook Delivery

### GitHub

1. Go to your repository's **Settings > Webhooks**.
2. Click on the webhook you created.
3. Scroll to **Recent Deliveries**.
4. The initial ping should show a green checkmark with a `200` response.

If delivery failed, check:
- The payload URL is correct and reachable from GitHub
- SSL certificate is valid
- The webhook secret matches

### Jira

1. Go to **Jira Administration > System > WebHooks**.
2. Click on the webhook.
3. Check **Last triggered** to see if events are being sent.

Test by updating an issue in Jira and checking the audit log:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=tool_invocation" \
  | jq '.entries[] | select(.actionDetail.tool == "jira_update")'
```

## Step 4: Configure Write Policy for Jira

The work-tracking plugin needs write access to Jira to auto-update ticket status. Create a policy that allows this:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: work-tracking-policy
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: integrations
      name: work-tracking-jira-write
      content: |
        package openclaw.enterprise.integrations

        import rego.v1

        default allow := false

        # Allow the work-tracking plugin to update Jira tickets
        allow if {
          input.action == "jira_update"
          input.context.targetSystem == "jira"
          input.context.additional.source == "work-tracking"
        }

        # Allow transition on PR merge
        allow if {
          input.action == "jira_transition"
          input.context.targetSystem == "jira"
          input.context.additional.trigger == "pr_merged"
        }

        reason := "Work tracking Jira write allowed" if { allow }
        reason := "Jira write not authorized for this action" if { not allow }
```

Apply the policy:

```bash
kubectl apply -f work-tracking-policy.yaml
```

## Step 5: Configure PR-to-Jira Correlation

The work-tracking plugin correlates PRs with Jira tickets using these patterns:

| Source | Pattern | Example |
|---|---|---|
| Branch name | `{PROJECT}-{NUMBER}` | `feature/ENG-1234-add-auth` |
| PR title | `{PROJECT}-{NUMBER}` | `[ENG-1234] Add authentication` |
| Commit message | `{PROJECT}-{NUMBER}` | `fix(auth): resolve login bug ENG-1234` |
| PR description | `Jira: {URL}` | `Jira: https://org.atlassian.net/browse/ENG-1234` |

The plugin extracts ticket references automatically. No additional configuration is needed for basic correlation.

### Configure Default Merge Transition

When a PR is merged, the plugin can automatically transition the linked Jira ticket. Configure the default transition name:

```yaml
integrations:
  - type: jira
    enabled: true
    config:
      baseUrl: "https://your-org.atlassian.net"
      webhookSecretRef: jira-webhook-secret
      defaultMergeTransition: "Done"  # Jira transition name on PR merge
```

## Step 6: Test the Integration

### Test GitHub Webhook

1. Create a branch named `feature/ENG-100-test-webhook`.
2. Open a PR with the title `[ENG-100] Test webhook integration`.
3. Check the audit log for the correlation event:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=tool_invocation" \
  | jq '.entries[] | select(.actionDetail.tool == "jira_update" and .actionDetail.ticketId == "ENG-100")'
```

### Test Standup Generation

After some activity, generate a standup summary:

```bash
# Ask the agent
"Generate my standup summary for today"
```

Or call the tool directly:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://<your-openclaw-domain>/api/v1/tools/standup_summary" \
  -d '{
    "userId": "user-123",
    "date": "2026-03-13"
  }'
```

## Troubleshooting

| Symptom | Possible Cause | Resolution |
|---|---|---|
| Webhook returns 401 | Invalid webhook secret | Verify the secret in K8s Secret matches the webhook configuration |
| Webhook returns 403 | Policy denies the action | Check that an integration policy allows the webhook source |
| No Jira update on PR merge | Missing write policy | Apply a policy allowing `jira_update` and `jira_transition` for work-tracking |
| Wrong Jira ticket correlated | Ambiguous ticket reference | Use explicit `{PROJECT}-{NUMBER}` format in branch names |
| Standup summary empty | No activity records | Verify webhooks are delivering events; check audit log for incoming events |
| `POLICY_ENGINE_UNREACHABLE` | OPA sidecar down | Check OPA sidecar pod status |
