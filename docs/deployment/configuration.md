# Configuration Reference

This page is the definitive reference for all configuration options across OpenClaw Enterprise components: environment variables, CR spec fields, connector settings, secret management, and TLS.

## Environment Variables

### OPA (Policy Engine)

These variables configure the gateway's communication with the OPA sidecar.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPA_SIDECAR_URL` | No | `http://localhost:8181` | URL of the OPA sidecar REST API |
| `OPA_EVALUATE_TIMEOUT_MS` | No | `5000` | Timeout in milliseconds for policy evaluation calls |
| `POLICY_HOT_RELOAD_INTERVAL_MS` | No | `60000` | Interval in milliseconds for checking policy updates (hot reload) |

> **Note:** The OPA sidecar runs in the same pod as the gateway. The default `localhost:8181` address should not be changed unless running a non-standard OPA deployment.

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_CONNECTION_STRING` | Yes | -- | PostgreSQL connection string for the primary database. Format: `postgresql://user:pass@host:5432/dbname?sslmode=verify-full` |
| `AUDIT_DB_CONNECTION_STRING` | No | Value of `DB_CONNECTION_STRING` | Separate PostgreSQL connection string for the audit database. Use this when audit data is stored in a separate database or schema for compliance isolation |

> **Note:** When deployed via the operator, `DB_CONNECTION_STRING` is injected as `DATABASE_URL` from the Secret referenced by `storage.postgresSecretRef`.

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_CONNECTION_STRING` | Yes | -- | Redis connection string. Format: `redis://user:pass@host:6379` or `rediss://...` for TLS |

> **Note:** When deployed via the operator, this is injected as `REDIS_URL` from the Secret referenced by `storage.redisSecretRef`.

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OIDC_ISSUER` | Yes | -- | OIDC issuer URL (must support `/.well-known/openid-configuration` discovery). Example: `https://login.example.com/realms/enterprise` |
| `OIDC_CLIENT_ID` | Yes | -- | OIDC client identifier for this application |

> **Note:** The OIDC client secret is provided via a Kubernetes Secret reference, not an environment variable. When deployed via the operator, `SSO_PROVIDER`, `SSO_CLIENT_ID`, and `SSO_CLIENT_SECRET` are injected from the CR spec and Secrets.

### General

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `API_BASE_PATH` | No | `/api/v1` | Base path prefix for all HTTP API routes |
| `NODE_ENV` | No | `production` | Node.js environment (`production`, `development`) |
| `PORT` | No | `8080` | Port the gateway listens on |

### Complete Environment Variable Summary

```yaml
# Example: all environment variables for a gateway container
env:
  # Database
  - name: DB_CONNECTION_STRING
    valueFrom:
      secretKeyRef:
        name: openclaw-postgres-secret
        key: connection-string
  - name: AUDIT_DB_CONNECTION_STRING
    valueFrom:
      secretKeyRef:
        name: openclaw-audit-db-secret
        key: connection-string

  # Redis
  - name: REDIS_CONNECTION_STRING
    valueFrom:
      secretKeyRef:
        name: openclaw-redis-secret
        key: connection-string

  # OPA
  - name: OPA_SIDECAR_URL
    value: "http://localhost:8181"
  - name: OPA_EVALUATE_TIMEOUT_MS
    value: "5000"
  - name: POLICY_HOT_RELOAD_INTERVAL_MS
    value: "60000"

  # Auth
  - name: OIDC_ISSUER
    value: "https://login.example.com/realms/enterprise"
  - name: OIDC_CLIENT_ID
    value: "openclaw-enterprise"

  # General
  - name: LOG_LEVEL
    value: "info"
  - name: API_BASE_PATH
    value: "/api/v1"
```

## OpenClawInstance CR Spec Reference

Full reference for the `OpenClawInstance` custom resource spec. See the [Operator Guide](./operator.md) for usage examples.

### `spec`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `deploymentMode` | `enum` | Yes | `single` | `single` -- one replica, no HA. `ha` -- multiple replicas with leader election |
| `replicas` | `int32` | Yes | `1` | Number of gateway pod replicas. Only honored when `deploymentMode` is `ha`; forced to `1` in `single` mode |

### `spec.auth`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | `string` | Yes | -- | SSO provider identifier. Common values: `okta`, `azure-ad`, `keycloak` |
| `clientId` | `string` | Yes | -- | OIDC client identifier from your identity provider |
| `clientSecretRef.name` | `string` | Yes | -- | Name of the Kubernetes Secret containing the OIDC client secret |
| `clientSecretRef.key` | `string` | No | `client-secret` | Key within the Secret's `data` map |

### `spec.storage`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `postgresSecretRef.name` | `string` | Yes | -- | Name of the Secret containing the PostgreSQL connection string |
| `postgresSecretRef.key` | `string` | No | `connection-string` | Key within the Secret |
| `redisSecretRef.name` | `string` | Yes | -- | Name of the Secret containing the Redis connection string |
| `redisSecretRef.key` | `string` | No | `connection-string` | Key within the Secret |

### `spec.integrations[]`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `string` | Yes | -- | Connector type (see Connector Configuration below) |
| `enabled` | `bool` | No | `true` | Whether this connector is active |
| `config` | `map[string]string` | No | `{}` | Connector-specific key-value settings |

## PolicyBundle CR Spec Reference

Full reference for the `PolicyBundle` custom resource spec.

### `spec.policies[]`

| Field | Type | Required | Allowed Values | Description |
|-------|------|----------|---------------|-------------|
| `scope` | `enum` | Yes | `enterprise`, `org`, `team`, `user` | Hierarchical scope level |
| `domain` | `enum` | Yes | `models`, `actions`, `integrations`, `agent-to-agent`, `features`, `data`, `audit` | Functional policy domain |
| `name` | `string` | Yes | Any non-empty string | Human-readable policy identifier |
| `content` | `string` | Yes | Valid Rego source | Rego policy source code |

### Policy Domains

| Domain | Description | Example Use |
|--------|-------------|-------------|
| `models` | Controls which AI models can be used and for what data classifications | Block external models for confidential data |
| `actions` | Controls action autonomy levels (autonomous, approve, blocked) | Require approval for write actions |
| `integrations` | Controls connector permissions (read, write, enabled) | Allow read-only access to Gmail |
| `agent-to-agent` | Controls inter-agent communication via OCIP | Restrict which agents can communicate |
| `features` | Controls feature availability per scope | Disable auto-response for a team |
| `data` | Controls data classification and handling | Set default classification to confidential |
| `audit` | Controls audit retention and immutability | Enforce 365-day retention |

## Connector-Specific Configuration

Each connector accepts configuration via the `integrations[].config` map in the OpenClawInstance CR.

### Gmail Connector

| Key | Default | Description |
|-----|---------|-------------|
| `pollInterval` | `60s` | How often to poll for new messages |
| `maxResults` | `100` | Maximum messages per poll |
| `labelFilter` | `INBOX` | Gmail label to filter |

### Google Calendar Connector

| Key | Default | Description |
|-----|---------|-------------|
| `syncInterval` | `300s` | How often to sync calendar events |
| `lookAheadDays` | `7` | Number of days ahead to sync |

### Google Drive Connector

| Key | Default | Description |
|-----|---------|-------------|
| `pollInterval` | `120s` | How often to poll for file changes |
| `watchFolders` | (all) | Comma-separated folder IDs to watch |

### Jira Connector

| Key | Default | Description |
|-----|---------|-------------|
| `baseUrl` | -- | Jira instance URL (e.g., `https://company.atlassian.net`) |
| `projectKeys` | (all) | Comma-separated project keys to sync |
| `syncInterval` | `300s` | How often to sync issues |

### GitHub Connector

| Key | Default | Description |
|-----|---------|-------------|
| `org` | -- | GitHub organization name |
| `repos` | (all) | Comma-separated repository names to monitor |
| `syncInterval` | `300s` | How often to sync PR and issue data |

### Connector Credential Secrets

Each connector requires its own OAuth credentials stored as Kubernetes Secrets. The gateway expects these Secrets to exist in the same namespace as the OpenClawInstance:

```yaml
# Google connectors (Gmail, Calendar, Drive share credentials)
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-google-credentials
  namespace: openclaw-enterprise
type: Opaque
stringData:
  client-id: "<google-oauth-client-id>"
  client-secret: "<google-oauth-client-secret>"
  service-account-key: "<base64-encoded-service-account-json>"
---
# Jira connector
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-jira-credentials
  namespace: openclaw-enterprise
type: Opaque
stringData:
  api-token: "<atlassian-api-token>"
  user-email: "bot@company.com"
---
# GitHub connector
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-github-credentials
  namespace: openclaw-enterprise
type: Opaque
stringData:
  app-id: "<github-app-id>"
  installation-id: "<github-installation-id>"
  private-key: "<github-app-private-key-pem>"
```

## Secret Management

All credentials must be stored as Kubernetes Secrets. The following rules apply:

1. **Never inline credentials** in CR specs, ConfigMaps, or environment variable values.
2. **Use `secretKeyRef`** in environment variable definitions to pull values from Secrets at pod startup.
3. **Rotate secrets** by updating the Secret and performing a rolling restart of gateway pods.
4. **Limit RBAC** -- the operator has read-only access to Secrets; it never creates or modifies them.

### Recommended Secret Management Tools

| Tool | Description |
|------|-------------|
| [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) | Encrypt Secrets for safe storage in Git |
| [External Secrets Operator](https://external-secrets.io/) | Sync Secrets from AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, HashiCorp Vault |
| [HashiCorp Vault](https://www.vaultproject.io/) | Centralized secrets management with dynamic credentials |

### Secret Rotation

To rotate a credential:

```bash
# 1. Update the Secret
kubectl create secret generic openclaw-postgres-secret \
  --from-literal=connection-string="postgresql://user:NEW_PASSWORD@host:5432/db?sslmode=verify-full" \
  --namespace=openclaw-enterprise \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Rolling restart the gateway pods to pick up the new Secret value
kubectl rollout restart deployment/production-gateway -n openclaw-enterprise

# 3. Verify
kubectl rollout status deployment/production-gateway -n openclaw-enterprise
```

## TLS Configuration

### PostgreSQL TLS

Use `sslmode=verify-full` in the connection string for production:

```
postgresql://user:pass@host:5432/dbname?sslmode=verify-full&sslrootcert=/etc/ssl/certs/pg-ca.crt
```

If the PostgreSQL CA certificate is not in the system trust store, mount it as a Secret volume:

```yaml
volumes:
  - name: pg-tls
    secret:
      secretName: openclaw-postgres-ca
volumeMounts:
  - name: pg-tls
    mountPath: /etc/ssl/certs/pg-ca.crt
    subPath: ca.crt
    readOnly: true
```

### Redis TLS

Use the `rediss://` scheme (note the double `s`) for TLS connections:

```
rediss://user:pass@redis-host:6379
```

### OPA Sidecar

The OPA sidecar communicates over localhost within the same pod. TLS is not required for this connection. If required by policy, OPA can be configured with TLS certificates via its command-line arguments.

### Ingress TLS

For external access, configure TLS termination at the ingress controller level:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openclaw-enterprise
  namespace: openclaw-enterprise
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - openclaw.company.com
      secretName: openclaw-tls-cert
  rules:
    - host: openclaw.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: production-gateway
                port:
                  number: 80
```
