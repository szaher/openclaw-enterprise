# @openclaw-enterprise/connector-gcal

Google Calendar connector plugin for OpenClaw Enterprise. Provides read-only access to Google Calendar via the Calendar API with policy enforcement, data classification, and audit logging.

## Prerequisites

- Google Cloud project with Google Calendar API enabled
- OAuth 2.0 credentials (Web application type)
- Node.js >= 22

## OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (type: Web application)
3. Add authorized redirect URI: `https://<your-openclaw-host>/api/v1/connectors/gcal/oauth/callback`
4. Note the Client ID and Client Secret

## Required Scopes

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/calendar.readonly` | Read calendar events |
| `https://www.googleapis.com/auth/calendar.events.readonly` | Read event details |

## Configuration

Set the following in your OpenClaw Enterprise connector configuration:

```json
{
  "type": "gcal",
  "config": {
    "clientId": "<GOOGLE_CLIENT_ID>",
    "clientSecret": "<GOOGLE_CLIENT_SECRET>",
    "redirectUri": "https://<host>/api/v1/connectors/gcal/oauth/callback",
    "calendarId": "primary",
    "syncIntervalMs": 60000,
    "syncWindowDays": 7,
    "syncMaxResults": 50
  }
}
```

Credentials should be stored in the enterprise secret store (referenced via `credentialsRef` in the connector record). Never store OAuth tokens in plain text configuration.

## Registered Tools

| Tool | Description |
|------|-------------|
| `calendar_read` | Fetch events within a time range |
| `calendar_search` | Search events by keyword, includes free/busy blocks |

## Registered Services

| Service | Description |
|---------|-------------|
| `gcal-sync` | Periodically syncs calendar events within a configurable window |

## Policy Integration

All tool invocations are policy-checked via the `policy.evaluate` gateway method before execution. The default data classification for Google Calendar data is `internal`. Individual events may be reclassified by the policy engine based on content analysis.

## Data Handling

Raw event descriptions are never persisted or returned. The connector extracts structured data (title, start/end, attendees, location, organizer, status) and discards raw content. This minimizes data exposure and aligns with the least-privilege principle.

## Error Handling

- **OAuth revocation**: If the user revokes access or the refresh token expires, the connector disables itself and reports `disabled` status.
- **API unavailability**: Temporary Calendar API errors (503, timeout) result in graceful degradation — the connector reports `degraded` status and retries on the next sync cycle.
- **Policy denial**: If the policy engine denies a read, the tool returns an error result with the denial reason. No data is fetched.
