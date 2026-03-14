# How To: Configure the Gmail Connector

This guide walks through setting up the Gmail connector for OpenClaw Enterprise, from creating Google Cloud credentials to verifying the connector status.

## Prerequisites

- A Google Cloud project with billing enabled
- Admin access to Google Workspace (for organization-wide access) or a personal Google account
- A running OpenClaw Enterprise instance on Kubernetes
- `kubectl` access to the cluster

## Step 1: Create a Google Cloud Project and Enable the Gmail API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Navigate to **APIs & Services > Library**.
4. Search for "Gmail API" and click **Enable**.

## Step 2: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Web application** as the application type.
4. Set the **Authorized redirect URI** to your OpenClaw Enterprise callback URL:

```
https://<your-openclaw-domain>/api/v1/auth/callback/gmail
```

5. Click **Create** and note the **Client ID** and **Client Secret**.

> **Important:** If you are configuring this for an entire Google Workspace organization, you may also need to configure domain-wide delegation in the Google Admin console. Consult Google's documentation for your specific setup.

## Step 3: Store Credentials as a Kubernetes Secret

Create a Kubernetes Secret containing the OAuth credentials:

```bash
kubectl create secret generic gmail-oauth-credentials \
  --namespace openclaw \
  --from-literal=client-id='YOUR_CLIENT_ID' \
  --from-literal=client-secret='YOUR_CLIENT_SECRET'
```

For refresh tokens (obtained after the initial OAuth flow), create a separate per-user secret:

```bash
kubectl create secret generic gmail-user-token-user123 \
  --namespace openclaw \
  --from-literal=refresh-token='USER_REFRESH_TOKEN'
```

## Step 4: Add Gmail to the OpenClawInstance Integration List

Edit your `OpenClawInstance` custom resource to include the Gmail connector:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: OpenClawInstance
metadata:
  name: production
  namespace: openclaw
spec:
  deploymentMode: single
  replicas: 1
  auth:
    provider: okta
    clientId: "your-oidc-client-id"
    clientSecretRef:
      name: oidc-secret
  storage:
    postgresSecretRef:
      name: postgres-credentials
    redisSecretRef:
      name: redis-credentials
  integrations:
    - type: gmail
      enabled: true
      config:
        credentialsSecretRef: gmail-oauth-credentials
        pollingIntervalMs: "60000"
        defaultClassification: "internal"
```

Apply the configuration:

```bash
kubectl apply -f openclaw-instance.yaml
```

## Step 5: Set Connector Policy

Create a policy that governs the Gmail connector. By default, connectors have **read-only** access. To enable write access (sending emails, creating drafts), you must explicitly allow it in the policy.

### Read-Only Policy (Default)

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: gmail-policy
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: integrations
      name: gmail-read-only
      content: |
        package openclaw.enterprise.integrations

        import rego.v1

        # Allow read access to Gmail
        allow if {
          input.context.targetSystem == "gmail"
          input.action in ["email_read", "email_search"]
        }

        # Deny write access by default
        deny if {
          input.context.targetSystem == "gmail"
          input.action in ["email_send", "email_draft"]
        }

        reason := "Gmail write access is not enabled" if { deny }
        reason := "Gmail read access allowed" if { allow }
```

### Read-Write Policy

If you need write access (for auto-response or manual email sending):

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: gmail-policy-rw
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: integrations
      name: gmail-read-write
      content: |
        package openclaw.enterprise.integrations

        import rego.v1

        allow if {
          input.context.targetSystem == "gmail"
          input.action in ["email_read", "email_search", "email_send", "email_draft"]
        }

        reason := "Gmail read-write access allowed" if { allow }
```

Apply the policy:

```bash
kubectl apply -f gmail-policy.yaml
```

## Step 6: Verify Connector Status

Check that the Gmail connector is running and healthy:

```bash
# Check the OpenClawInstance status
kubectl get openclawinstance production -n openclaw -o yaml

# Check the gateway health endpoint
curl -s https://<your-openclaw-domain>/api/v1/status | jq '.dependencies["connector-gmail"]'
```

Expected output:

```json
{
  "status": "healthy",
  "lastChecked": "2026-03-13T10:00:00.000Z"
}
```

If the status shows `disabled`, check:
- OAuth credentials are correct and not expired
- The refresh token is valid
- The Gmail API is enabled in Google Cloud Console

If the status shows `degraded`, check:
- Network connectivity to Gmail API
- Rate limits

## Step 7: Configure Polling Interval

The Gmail inbox poller checks for new messages at a configurable interval. The default is 60 seconds. Adjust it in the integration config:

```yaml
integrations:
  - type: gmail
    enabled: true
    config:
      pollingIntervalMs: "30000"  # 30 seconds
```

> **Warning:** Setting the polling interval too low may cause you to hit Gmail API rate limits (250 quota units per user per second). For most deployments, 60 seconds is recommended.

## Step 8: Test the Connector

Once configured, test the connector through the agent:

1. Start a conversation with your OpenClaw assistant.
2. Ask: "Show me my recent emails."
3. The agent should use the `email_search` tool and return structured results.

You can verify the tool invocation in the audit log:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=data_access&userId=user-123" \
  | jq '.entries[] | select(.actionDetail.tool == "email_search")'
```

## Troubleshooting

| Symptom | Possible Cause | Resolution |
|---|---|---|
| Connector status `disabled` | OAuth token revoked | Re-authenticate the user and update the refresh token secret |
| Connector status `degraded` | Gmail API 503 or rate limit | Wait and retry; increase polling interval if persistent |
| Policy denial on read | Missing or incorrect integration policy | Check that the PolicyBundle allows `email_read` and `email_search` |
| No emails returned | Empty query result or classification filter | Check the search query; verify classification policy allows the data level |
| `POLICY_ENGINE_UNREACHABLE` | OPA sidecar not running | Check the OPA sidecar pod and connectivity |
