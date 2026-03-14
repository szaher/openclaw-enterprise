# Connector Configurations

OpenClawInstance examples showing different connector combinations based on team needs. Each file is a complete, self-contained instance configuration.

**Use this when:** You want to deploy OpenClaw Enterprise with a specific set of connectors tailored to your team's workflow.

## Available connectors

| Connector | Type | What it provides |
|-----------|------|-----------------|
| Gmail | `gmail` | Email reading, drafting, sending, search, label management |
| Google Calendar | `gcal` | Calendar event reading, creation, availability checking |
| Jira | `jira` | Issue reading, creation, updating, sprint tracking, JQL queries |
| GitHub | `github` | Repository browsing, PR management, issue tracking, code search |
| Google Drive | `gdrive` | Document reading, search, file metadata, shared drive access |

## Files

| File | Connectors | Best for |
|------|------------|----------|
| `gmail-only.yaml` | Gmail | Email triage teams, support, management |
| `jira-github.yaml` | Jira + GitHub | Development teams (work tracking + code) |
| `full-suite.yaml` | All 5 connectors | Full organization deployment |

## Usage

Pick the connector profile that matches your team and apply:

```bash
# For a development team
kubectl apply -f jira-github.yaml

# For a full deployment
kubectl apply -f full-suite.yaml
```

Each file includes placeholder secrets that must be edited before applying. Look for `CHANGE_ME` values.

## Connector configuration reference

### Gmail / Google Calendar / Google Drive

These connectors use Google Workspace service accounts:

```yaml
config:
  serviceAccountEmail: "openclaw@your-company.iam.gserviceaccount.com"
  delegatedUser: "admin@your-company.com"
  scopes: "https://www.googleapis.com/auth/gmail.readonly"
```

### Jira

```yaml
config:
  baseUrl: "https://your-company.atlassian.net"
  apiTokenSecretRef: "openclaw-jira-token"
  defaultProject: "ENG"
```

### GitHub

Uses a GitHub App for authentication:

```yaml
config:
  appId: "12345"
  installationId: "67890"
  privateKeySecretRef: "openclaw-github-app-key"
  organization: "your-company"
```

## Adding connectors to an existing instance

You can update an existing OpenClawInstance to add or remove connectors by editing the `spec.integrations` list and re-applying:

```bash
kubectl apply -f your-updated-instance.yaml
```

The operator will reconcile the changes and restart gateway pods with the new connector configuration.
