# Connector Administration

OpenClaw Enterprise connects to external services through a plugin-based connector architecture. Each connector extends the abstract `ConnectorBase` class, which provides policy evaluation, audit logging, data classification propagation, ephemeral data handling, and OAuth revocation detection out of the box.

> **Principle: Least Privilege By Default.** All connectors start with read-only access. Write permissions require explicit authorization via the policy engine.

---

## Available Connectors

### MVP Connectors

These connectors are included in the initial release and are fully supported:

| Connector | Plugin | Default Classification | Default Permission | Data Types |
|---|---|---|---|---|
| Gmail | `connector-gmail` | `internal` | `read` | Emails, attachments, labels |
| Google Calendar | `connector-gcal` | `internal` | `read` | Events, attendees, meeting notes |
| Jira | `connector-jira` | `internal` | `read` | Issues, comments, worklogs, sprints |
| GitHub | `connector-github` | `public` (public repos) / `internal` (private repos) | `read` | Issues, PRs, comments, reviews, commits |
| Google Drive | `connector-gdrive` | `internal` | `read` | Documents, spreadsheets, presentations, folders |

### Post-MVP Connectors (Planned)

| Connector | Status | Target Release |
|---|---|---|
| Outlook / Microsoft 365 | Planned | v1.1 |
| Linear | Planned | v1.1 |
| Notion | Planned | v1.2 |
| Confluence | Planned | v1.2 |
| GitLab | Planned | v1.2 |

---

## ConnectorBase Abstract Class

All connectors extend `ConnectorBase`, which provides the following capabilities automatically:

| Capability | Description |
|---|---|
| Policy Evaluation | Every operation is checked against the `integrations` policy domain before execution |
| Audit Logging | All connector operations (reads, writes, errors) are logged to the immutable audit trail |
| Classification Propagation | Data ingested by a connector carries the connector's default classification, subject to AI reclassification |
| Ephemeral Data Handling | Temporary/cached data is automatically expired based on `ephemeral_data_ttl_hours` policy |
| OAuth Revocation Detection | Detects when OAuth tokens are revoked by the user or provider and transitions the connector to `error` state |
| Health Reporting | Exposes health status for monitoring via the operator and admin API |

Connector developers do not need to implement these features -- they are inherited from `ConnectorBase`.

---

## Default Permissions

All connectors operate in **read-only mode** by default. Write access must be explicitly granted through the `integrations` policy domain.

### Enabling Write Access

To enable write access for a connector, update the integrations policy at the appropriate hierarchy level:

```bash
curl -X POST https://openclaw.example.com/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering GitHub Write",
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
          "allowed_operations": [
            "read_issues",
            "read_prs",
            "read_commits",
            "comment_issue",
            "comment_pr"
          ]
        }
      }
    },
    "change_reason": "Enable GitHub issue/PR commenting for engineering org"
  }'
```

> **Note:** Even with `read_write` permission, specific write operations must be listed in `allowed_operations`. Unlisted operations remain blocked.

---

## OAuth Credential Management

Connector credentials are managed as Kubernetes Secrets. The K8s operator handles secret rotation and mounting.

### Creating Connector Credentials

```bash
kubectl create secret generic openclaw-gmail-oauth \
  --namespace openclaw \
  --from-literal=client_id="YOUR_CLIENT_ID" \
  --from-literal=client_secret="YOUR_CLIENT_SECRET" \
  --from-literal=refresh_token="YOUR_REFRESH_TOKEN"
```

### Secret Naming Convention

| Connector | Secret Name |
|---|---|
| Gmail | `openclaw-gmail-oauth` |
| Google Calendar | `openclaw-gcal-oauth` |
| Jira | `openclaw-jira-oauth` |
| GitHub | `openclaw-github-oauth` |
| Google Drive | `openclaw-gdrive-oauth` |

### Secret Rotation

To rotate credentials:

1. Update the Kubernetes Secret with the new credentials.
2. The operator detects the secret change and triggers a connector reload.
3. The connector re-authenticates with the new credentials.
4. The credential rotation event is logged to the audit trail.

> **Important:** Never store OAuth credentials in policy configurations, environment variables, or application configuration files. Kubernetes Secrets are the only supported credential storage mechanism.

---

## Connector Status

Each connector reports one of three statuses:

| Status | Description | Action Required |
|---|---|---|
| `active` | Connector is authenticated and operating normally | None |
| `disabled` | Connector has been intentionally disabled by an administrator | Re-enable via policy or admin API when needed |
| `error` | Connector has encountered an error (auth failure, API error, rate limit) | Investigate and resolve the error condition |

### Common Error Conditions

| Error | Cause | Resolution |
|---|---|---|
| `oauth_token_revoked` | User or provider revoked the OAuth token | Re-authenticate and update the K8s Secret |
| `oauth_token_expired` | Refresh token has expired | Re-authenticate and update the K8s Secret |
| `api_rate_limited` | Connector exceeded the provider's API rate limit | Reduce polling interval; connector will auto-recover |
| `api_unreachable` | External service is unreachable | Check network connectivity; connector will auto-retry |
| `permission_denied` | OAuth scopes insufficient for requested operation | Update OAuth app scopes and re-authenticate |

---

## Per-Connector Configuration

### Gmail

```yaml
connector: gmail
config:
  polling_interval_seconds: 60
  max_emails_per_sync: 100
  include_labels:
    - INBOX
    - SENT
  exclude_labels:
    - SPAM
    - TRASH
  attachment_max_size_mb: 25
  sync_history_days: 30
```

### Google Calendar

```yaml
connector: gcal
config:
  polling_interval_seconds: 120
  calendars:
    - primary
    - team@example.com
  sync_window_days_past: 7
  sync_window_days_future: 30
  include_declined: false
```

### Jira

```yaml
connector: jira
config:
  polling_interval_seconds: 120
  base_url: https://company.atlassian.net
  projects:
    - ENG
    - PLATFORM
    - INFRA
  issue_types:
    - Story
    - Bug
    - Task
    - Epic
  max_issues_per_sync: 200
  include_comments: true
  include_worklogs: true
```

### GitHub

```yaml
connector: github
config:
  polling_interval_seconds: 60
  organizations:
    - example-corp
  repositories:
    - example-corp/api-server
    - example-corp/frontend
  include_issues: true
  include_pull_requests: true
  include_reviews: true
  include_commits: true
  max_items_per_sync: 200
```

### Google Drive

```yaml
connector: gdrive
config:
  polling_interval_seconds: 300
  shared_drives:
    - Engineering
    - Product
  folders:
    - root
    - "0B1234567890"
  file_types:
    - document
    - spreadsheet
    - presentation
  max_file_size_mb: 50
  max_files_per_sync: 100
```

---

## Connector Health Monitoring

The operator continuously monitors connector health. Health information is available through the admin API and Kubernetes CRD status.

### Querying Connector Status

```bash
curl -X GET https://openclaw.example.com/api/v1/connectors \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "connectors": [
    {
      "name": "gmail",
      "status": "active",
      "last_sync": "2026-03-13T14:25:00Z",
      "items_synced": 1247,
      "error": null,
      "health": {
        "latency_ms": 145,
        "success_rate_24h": 0.998,
        "last_error": null
      }
    },
    {
      "name": "github",
      "status": "active",
      "last_sync": "2026-03-13T14:24:30Z",
      "items_synced": 892,
      "error": null,
      "health": {
        "latency_ms": 210,
        "success_rate_24h": 1.0,
        "last_error": null
      }
    },
    {
      "name": "jira",
      "status": "error",
      "last_sync": "2026-03-13T13:00:00Z",
      "items_synced": 0,
      "error": {
        "code": "oauth_token_expired",
        "message": "Refresh token has expired. Re-authentication required.",
        "since": "2026-03-13T13:00:00Z"
      },
      "health": {
        "latency_ms": null,
        "success_rate_24h": 0.75,
        "last_error": "2026-03-13T13:00:00Z"
      }
    }
  ]
}
```

### Kubernetes CRD Status

```bash
kubectl get openclawconnectors -n openclaw
```

```
NAME     STATUS    LAST-SYNC              AGE
gmail    Active    2026-03-13T14:25:00Z   30d
gcal     Active    2026-03-13T14:20:00Z   30d
jira     Error     2026-03-13T13:00:00Z   30d
github   Active    2026-03-13T14:24:30Z   30d
gdrive   Active    2026-03-13T14:15:00Z   30d
```

---

## Disabling a Connector

To disable a connector, remove it from the `allowed_connectors` list in the integrations policy:

```bash
curl -X PUT https://openclaw.example.com/api/v1/policies/pol_integrations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": {
      "allowed_connectors": ["gmail", "gcal", "github", "gdrive"],
      "default_permission": "read"
    },
    "change_reason": "Disable Jira connector pending OAuth token renewal"
  }'
```

The connector will transition to `disabled` status within 60 seconds (policy hot-reload interval).

---

## Troubleshooting

### Connector Stuck in Error State

1. Check the error code in the connector status response.
2. For OAuth errors: re-authenticate and update the Kubernetes Secret.
3. For API errors: check the external service status and network connectivity.
4. After resolving the issue, the connector will automatically retry on the next polling cycle.

### Data Not Appearing After Sync

1. Verify the connector is in `active` status.
2. Check the connector configuration for filter settings (labels, projects, repositories) that may exclude the expected data.
3. Check the polling interval -- data may appear after the next sync cycle.
4. Review the audit log for any policy denials on the connector's read operations.

### High API Latency

1. Increase the polling interval to reduce API call frequency.
2. Reduce `max_items_per_sync` to decrease per-request payload size.
3. Check the external service's rate limit headers in the connector logs.
