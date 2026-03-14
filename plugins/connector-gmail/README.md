# @openclaw-enterprise/connector-gmail

Gmail connector plugin for OpenClaw Enterprise. Provides read-only access to Gmail via the Gmail API with policy enforcement, data classification, and audit logging.

## Prerequisites

- Google Cloud project with Gmail API enabled
- OAuth 2.0 credentials (Web application type)
- Node.js >= 22

## OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (type: Web application)
3. Add authorized redirect URI: `https://<your-openclaw-host>/api/v1/connectors/gmail/oauth/callback`
4. Note the Client ID and Client Secret

## Required Scopes

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.readonly` | Read email messages and metadata |
| `https://www.googleapis.com/auth/gmail.labels` | Read label information |

## Configuration

Set the following in your OpenClaw Enterprise connector configuration:

```json
{
  "type": "gmail",
  "config": {
    "clientId": "<GOOGLE_CLIENT_ID>",
    "clientSecret": "<GOOGLE_CLIENT_SECRET>",
    "redirectUri": "https://<host>/api/v1/connectors/gmail/oauth/callback",
    "pollerIntervalMs": 60000,
    "pollerQuery": "is:unread",
    "pollerMaxResults": 20
  }
}
```

Credentials should be stored in the enterprise secret store (referenced via `credentialsRef` in the connector record). Never store OAuth tokens in plain text configuration.

## Registered Tools

| Tool | Description |
|------|-------------|
| `email_read` | Fetch a specific email by Gmail message ID |
| `email_search` | Search emails using Gmail query syntax |

## Registered Services

| Service | Description |
|---------|-------------|
| `gmail-inbox-poller` | Polls for new messages at a configurable interval |

## Policy Integration

All tool invocations are policy-checked via the `policy.evaluate` gateway method before execution. The default data classification for Gmail data is `internal`. Individual items may be reclassified by the policy engine based on content analysis.

## Data Handling

Raw email bodies are never persisted or returned. The connector extracts structured data (subject, snippet/summary, sender, date, labels) and discards the raw payload. This minimizes data exposure and aligns with the least-privilege principle.

## Error Handling

- **OAuth revocation**: If the user revokes access or the refresh token expires, the connector disables itself and reports `disabled` status.
- **API unavailability**: Temporary Gmail API errors (503, timeout) result in graceful degradation — the connector reports `degraded` status and retries on the next poll cycle.
- **Policy denial**: If the policy engine denies a read, the tool returns an error result with the denial reason. No data is fetched.
