# @openclaw-enterprise/connector-gdrive

Google Drive connector plugin for OpenClaw Enterprise. Provides read-only access to Google Drive documents with full policy evaluation, data classification, and audit logging.

## Features

- **gdrive_read**: Fetch a document by file ID, returning structured data (title, summary, classification)
- **gdrive_search**: Search documents by query, returning structured results
- **Document change poller**: Detects document modifications via Google Drive Changes API and emits events for the org-intelligence plugin

All operations enforce policy-before-access, classify returned data, and produce audit log entries. Raw document content is discarded after structured extraction.

## Prerequisites

- Node.js >= 22
- Google Cloud project with Drive API enabled
- OAuth 2.0 credentials configured

## Google Cloud Setup

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth 2.0 Client ID**
5. Choose **Web application** as the application type
6. Add your redirect URI (e.g., `https://your-domain.com/auth/google/callback`)
7. Save the **Client ID** and **Client Secret**

### 2. Enable the Google Drive API

1. Navigate to **APIs & Services > Library**
2. Search for "Google Drive API"
3. Click **Enable**

### 3. Required OAuth Scopes

The connector requires the following scopes:

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/drive.readonly` | Read file metadata and content |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | Read file metadata for search |

For the change poller, the following additional scope is needed:

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/drive.readonly` | Access Changes API and revision history |

**Note**: The connector only requests read-only scopes. It never modifies documents.

## Configuration

The plugin is configured at activation time via the `GDrivePluginConfig` interface:

```typescript
interface GDrivePluginConfig {
  tenantId: string;          // Enterprise tenant ID
  userId: string;            // User who authorized the connection
  apiClient: GDriveApiClient;         // Implementation of the Drive API client
  changesApiClient: GDriveChangesApiClient; // Implementation of the Changes API client
  pollIntervalMs?: number;   // Change poll interval (default: 60000ms)
}
```

### Environment Variables

The API client implementations should be configured with:

| Variable | Description |
|----------|-------------|
| `GDRIVE_CLIENT_ID` | OAuth 2.0 Client ID |
| `GDRIVE_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `GDRIVE_REDIRECT_URI` | OAuth redirect URI |
| `GDRIVE_POLL_INTERVAL_MS` | Poll interval in milliseconds (default: 60000) |

### Credential Storage

OAuth tokens must be stored in the enterprise credential store (referenced by `credentialsRef` on the Connector record). Tokens are never logged or included in audit entries.

## Architecture

```
plugin.ts (entry point)
  |-- registers gdrive_read tool
  |-- registers gdrive_search tool
  |-- registers gdrive-document-poller service
  |
  +-- tools/read.ts
  |     GDriveReadConnector extends ConnectorBase
  |     - executeRead() handles policy + audit + classification
  |     - Raw content discarded after extraction
  |
  +-- services/poller.ts
        GDriveDocumentPoller
        - Polls Changes API on configurable interval
        - Compares revisions to classify changes
        - Emits events for org-intelligence
        - Handles OAuth revocation gracefully
```

## Policy Integration

All operations go through `ConnectorBase.executeRead()` which:

1. Evaluates policy via `policy.evaluate` gateway method before any API call
2. Classifies returned data via `policy.classify` gateway method
3. Logs access via `audit.log` gateway method
4. Enforces classification propagation (highest classification in batch applies)

Default classification for GDrive documents is `internal`.

## Testing

```bash
pnpm test
```

## Development

```bash
pnpm build       # Compile TypeScript
pnpm typecheck   # Type-check without emitting
```
