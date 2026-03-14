# Kubernetes Operator Guide

The OpenClaw Enterprise operator is a Go-based Kubernetes controller that manages the lifecycle of OpenClaw Enterprise instances and their policy bundles. It follows the operator pattern using `controller-runtime` and implements two custom resource types.

## What the Operator Does

The operator watches for two Custom Resource types and reconciles the cluster state to match the declared specifications:

1. **OpenClawInstance** -- Provisions and manages OpenClaw gateway deployments with OPA sidecars, services, and configuration. One gateway deployment is created per tenant (per CR instance).
2. **PolicyBundle** -- Loads Rego policies into OPA sidecars via ConfigMaps, validates policy hierarchy constraints through an admission webhook, and tracks sync status.

```mermaid
sequenceDiagram
    participant User as Cluster Admin
    participant API as K8s API Server
    participant WH as Admission Webhook
    participant OP as Operator
    participant K8s as K8s Resources

    User->>API: kubectl apply -f openclaw-instance.yaml
    API->>OP: Watch event (OpenClawInstance created)
    OP->>K8s: Create/Update Deployment (gateway + OPA sidecar)
    OP->>K8s: Create/Update Service
    OP->>API: Update OpenClawInstance status

    User->>API: kubectl apply -f policy-bundle.yaml
    API->>WH: Validate PolicyBundle (admission)
    WH-->>API: Admitted (or denied with reason)
    API->>OP: Watch event (PolicyBundle created)
    OP->>K8s: Create/Update ConfigMap with Rego policies
    OP->>API: Update PolicyBundle status
```

## Installation

### Step 1: Apply Custom Resource Definitions

```bash
kubectl apply -f operator/config/crd/openclaw.enterprise.io_openclawinstances.yaml
kubectl apply -f operator/config/crd/openclaw.enterprise.io_policybundles.yaml
```

Verify the CRDs are registered:

```bash
kubectl get crds | grep openclaw.enterprise.io
```

Expected output:

```
openclawinstances.openclaw.enterprise.io   2026-03-13T00:00:00Z
policybundles.openclaw.enterprise.io       2026-03-13T00:00:00Z
```

### Step 2: Apply RBAC

```bash
kubectl apply -f operator/config/rbac/service-account.yaml
kubectl apply -f operator/config/rbac/cluster-role.yaml
kubectl apply -f operator/config/rbac/role-binding.yaml
```

### Step 3: Deploy the Operator

```bash
kubectl apply -f operator/config/manager/manager.yaml
```

Verify the operator is running:

```bash
kubectl get pods -n openclaw-system -l app.kubernetes.io/name=openclaw-operator
```

Expected output:

```
NAME                                        READY   STATUS    RESTARTS   AGE
openclaw-operator-manager-6d4f5b7c8-x9k2m   1/1     Running   0          30s
```

## Custom Resource: OpenClawInstance

The `OpenClawInstance` CRD (short name: `oci`) declares a deployed OpenClaw Enterprise instance. Each CR results in a gateway Deployment with an OPA sidecar and an associated Service.

### Spec Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `deploymentMode` | `string` | Yes | `single` | Deployment mode: `single` or `ha` |
| `replicas` | `int32` | Yes | `1` | Number of gateway pod replicas. Ignored when `deploymentMode` is `single` |
| `auth` | `object` | Yes | -- | SSO/OIDC authentication configuration |
| `auth.provider` | `string` | Yes | -- | SSO provider name (`okta`, `azure-ad`, `keycloak`) |
| `auth.clientId` | `string` | Yes | -- | OIDC client identifier |
| `auth.clientSecretRef` | `object` | Yes | -- | Reference to a K8s Secret containing the OIDC client secret |
| `auth.clientSecretRef.name` | `string` | Yes | -- | Name of the Kubernetes Secret |
| `auth.clientSecretRef.key` | `string` | No | `client-secret` | Key within the Secret data |
| `storage` | `object` | Yes | -- | Database and cache connection references |
| `storage.postgresSecretRef` | `object` | Yes | -- | Reference to a Secret with the PostgreSQL connection string |
| `storage.postgresSecretRef.name` | `string` | Yes | -- | Secret name |
| `storage.postgresSecretRef.key` | `string` | No | `connection-string` | Key within the Secret |
| `storage.redisSecretRef` | `object` | Yes | -- | Reference to a Secret with the Redis connection string |
| `storage.redisSecretRef.name` | `string` | Yes | -- | Secret name |
| `storage.redisSecretRef.key` | `string` | No | `connection-string` | Key within the Secret |
| `integrations` | `array` | No | `[]` | List of enabled connectors |
| `integrations[].type` | `string` | Yes | -- | Connector type: `gmail`, `gcal`, `jira`, `github`, `gdrive` |
| `integrations[].enabled` | `bool` | No | `true` | Whether the connector is active |
| `integrations[].config` | `map[string]string` | No | `{}` | Connector-specific key-value configuration |

### Status Fields

| Field | Type | Description |
|-------|------|-------------|
| `readyReplicas` | `int32` | Number of gateway pods in Ready state |
| `phase` | `string` | Lifecycle phase: `Pending`, `Progressing`, `Running` |
| `observedGeneration` | `int64` | Most recent generation observed by the controller |
| `conditions` | `[]Condition` | Standard Kubernetes conditions (`Ready`, `Progressing`, `Degraded`) |

### Full Example

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: OpenClawInstance
metadata:
  name: production
  namespace: openclaw-enterprise
spec:
  deploymentMode: ha
  replicas: 3
  auth:
    provider: okta
    clientId: 0oa1b2c3d4e5f6g7h8i9
    clientSecretRef:
      name: openclaw-sso-secret
      key: client-secret
  storage:
    postgresSecretRef:
      name: openclaw-postgres-secret
      key: connection-string
    redisSecretRef:
      name: openclaw-redis-secret
      key: connection-string
  integrations:
    - type: gmail
      enabled: true
      config:
        pollInterval: "60s"
    - type: gcal
      enabled: true
      config:
        syncInterval: "300s"
    - type: jira
      enabled: true
      config:
        baseUrl: "https://company.atlassian.net"
    - type: github
      enabled: true
      config:
        org: "my-org"
    - type: gdrive
      enabled: true
      config:
        pollInterval: "120s"
```

### Prerequisite Secrets

Before applying the OpenClawInstance, create the referenced Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-sso-secret
  namespace: openclaw-enterprise
type: Opaque
stringData:
  client-secret: "<your-oidc-client-secret>"
---
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-postgres-secret
  namespace: openclaw-enterprise
type: Opaque
stringData:
  connection-string: "postgresql://user:password@postgres-host:5432/openclaw?sslmode=verify-full"
---
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-redis-secret
  namespace: openclaw-enterprise
type: Opaque
stringData:
  connection-string: "rediss://user:password@redis-host:6379"
```

> **Warning:** Never commit Secrets to version control. Use sealed-secrets, external-secrets-operator, or a vault integration in production.

## Custom Resource: PolicyBundle

The `PolicyBundle` CRD (short name: `pb`) declares a set of Rego policies to be loaded into the OPA sidecar. Policies are organized by scope (hierarchical level) and domain (functional area).

### Spec Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `policies` | `array` | Yes | List of policy definitions (minimum 1) |
| `policies[].scope` | `string` | Yes | Hierarchical scope: `enterprise`, `org`, `team`, `user` |
| `policies[].domain` | `string` | Yes | Policy domain: `models`, `actions`, `integrations`, `agent-to-agent`, `features`, `data`, `audit` |
| `policies[].name` | `string` | Yes | Human-readable policy identifier |
| `policies[].content` | `string` | Yes | Rego policy source code |

### Status Fields

| Field | Type | Description |
|-------|------|-------------|
| `applied` | `int` | Number of policies successfully loaded into OPA |
| `total` | `int` | Total number of policies in this bundle |
| `lastReloadTime` | `datetime` | Timestamp of last successful reload into OPA |
| `observedGeneration` | `int64` | Most recent generation observed by the controller |
| `conditions` | `[]Condition` | Standard conditions (`PolicyReady`, `PolicySynced`) |

### Scope Hierarchy

Policies follow a strict hierarchical model. Lower scopes can only **restrict** -- never expand -- what parent scopes allow:

```
enterprise  (broadest -- sets organization-wide defaults)
  |
  +-- org   (can restrict enterprise policies for a specific org unit)
       |
       +-- team  (can restrict org policies for a specific team)
            |
            +-- user  (can restrict team policies for a specific user)
```

### Full Example

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: enterprise-defaults
  namespace: openclaw-enterprise
spec:
  policies:
    - scope: enterprise
      domain: models
      name: model-routing-default
      content: |
        package openclaw.enterprise.models

        default allow = false

        # Allow internal models for all data classifications
        allow {
            input.model.provider == "internal"
        }

        # Allow external models only for public data
        allow {
            input.model.provider == "external"
            input.data.classification == "public"
        }

        # Block external models for confidential and above
        deny {
            input.model.provider == "external"
            input.data.classification == "confidential"
        }

        deny {
            input.model.provider == "external"
            input.data.classification == "restricted"
        }

    - scope: enterprise
      domain: actions
      name: action-autonomy-default
      content: |
        package openclaw.enterprise.actions

        default autonomy_level = "blocked"

        # Read actions are always autonomous
        autonomy_level = "autonomous" {
            input.action.type == "read"
        }

        # Internal write actions require approval
        autonomy_level = "approve" {
            input.action.type == "write"
            input.action.target_system != "external"
        }

        # External write actions are blocked by default
        autonomy_level = "blocked" {
            input.action.type == "write"
            input.action.target_system == "external"
        }

    - scope: enterprise
      domain: integrations
      name: integration-permissions-default
      content: |
        package openclaw.enterprise.integrations

        default allow = false

        allow {
            input.connector.enabled == true
            input.operation == "read"
        }

        allow {
            input.connector.enabled == true
            input.operation == "write"
            input.connector.write_enabled == true
        }

    - scope: enterprise
      domain: data
      name: data-classification-default
      content: |
        package openclaw.enterprise.data

        default classification = "confidential"

        classification = "restricted" {
            input.data.source == "unknown"
        }

        classification = input.data.source_classification {
            input.data.derived == true
        }

    - scope: enterprise
      domain: audit
      name: audit-retention-default
      content: |
        package openclaw.enterprise.audit

        default retention_days = 365

        retention_days = 365 {
            true
        }

        allow_delete = false
        allow_update = false
```

## Reconciliation Loop

The operator runs two independent reconciliation loops, one for each CRD.

### OpenClawInstance Reconciliation

```mermaid
flowchart TD
    A[Watch Event: OpenClawInstance] --> B{Resource exists?}
    B -->|No| C[Log and ignore - deleted externally]
    B -->|Yes| D{Has finalizer?}
    D -->|No| E[Add finalizer]
    E --> F{Marked for deletion?}
    D -->|Yes| F
    F -->|Yes| G[Remove finalizer, let GC clean owned resources]
    F -->|No| H[Reconcile Deployment]
    H --> I[Reconcile Service]
    I --> J[Update status: readyReplicas, phase, conditions]
    J --> K[Done]
    H -->|Error| L[Set Degraded condition]
    I -->|Error| L
```

For each OpenClawInstance CR, the operator:

1. Creates or updates a **Deployment** named `{instance-name}-gateway` containing:
   - A `gateway` container running the OpenClaw Enterprise gateway image
   - An `opa-sidecar` container running OPA, serving policies from a ConfigMap volume
2. Creates or updates a **Service** named `{instance-name}-gateway` (ClusterIP, port 80 -> 8080)
3. Sets **OwnerReferences** on all created resources so they are garbage-collected when the CR is deleted
4. Updates the CR **status** with ready replica count, phase, and conditions

### PolicyBundle Reconciliation

For each PolicyBundle CR, the operator:

1. Creates or updates a **ConfigMap** containing the Rego policy files
2. Triggers a rolling restart of affected gateway pods (to reload OPA policies from the updated ConfigMap)
3. Updates the CR **status** with applied/total counts and last reload timestamp

## Admission Webhook

The operator includes a **validating admission webhook** for PolicyBundle resources. The webhook is invoked by the Kubernetes API server before a PolicyBundle CR is persisted.

### What It Validates

1. **Structural validation** -- Ensures all required fields are present and correctly typed.
2. **Hierarchy constraint enforcement** -- Verifies that policies at lower scopes (org, team, user) do not expand beyond what parent scopes allow. A child scope policy must only restrict, never broaden, the permissions granted by its parent.

### Scope Ordering

The webhook enforces the following scope ordering (0 = broadest):

| Scope | Order |
|-------|-------|
| `enterprise` | 0 |
| `org` | 1 |
| `team` | 2 |
| `user` | 3 |

If a bundle contains policies at both `enterprise` and `team` scope for the same domain, the webhook validates that the team-level policy does not grant permissions not present in the enterprise-level policy.

### Example: Rejected PolicyBundle

```bash
$ kubectl apply -f bad-policy.yaml
Error from server: admission webhook "policybundle.openclaw.enterprise.io" denied the request:
  domain "models": team scope cannot expand beyond enterprise scope
```

## Multi-Tenant Model

The operator supports multi-tenancy by creating a **separate gateway deployment per OpenClawInstance CR**. Each tenant (team, department, or organization) gets its own:

- Gateway Deployment with dedicated pods
- OPA sidecar with tenant-specific policies
- Service endpoint
- Isolated Secret references for credentials

```mermaid
graph TB
    subgraph "Namespace: openclaw-enterprise"
        subgraph "Tenant A"
            GW_A[Gateway Deployment: tenant-a-gateway]
            SVC_A[Service: tenant-a-gateway]
            OPA_A[OPA Sidecar]
        end
        subgraph "Tenant B"
            GW_B[Gateway Deployment: tenant-b-gateway]
            SVC_B[Service: tenant-b-gateway]
            OPA_B[OPA Sidecar]
        end
    end
    PG_A[(PostgreSQL - Tenant A DB)]
    PG_B[(PostgreSQL - Tenant B DB)]
    GW_A --> PG_A
    GW_B --> PG_B
```

Tenants share the same operator and namespace but are isolated at the data and policy level through separate Secret references and PolicyBundle CRs.

## Operator RBAC

The operator runs under a dedicated ServiceAccount with a ClusterRole. The following permissions are granted:

| API Group | Resource | Verbs | Purpose |
|-----------|----------|-------|---------|
| `openclaw.enterprise.io` | `openclawinstances`, `openclawinstances/status`, `openclawinstances/finalizers` | get, list, watch, create, update, patch, delete | CR lifecycle management |
| `openclaw.enterprise.io` | `policybundles`, `policybundles/status`, `policybundles/finalizers` | get, list, watch, create, update, patch, delete | Policy lifecycle management |
| `apps` | `deployments` | get, list, watch, create, update, patch, delete | Gateway deployment management |
| `""` (core) | `services` | get, list, watch, create, update, patch, delete | Gateway service management |
| `""` (core) | `secrets` | get, list, watch | Read credentials (never create/modify) |
| `""` (core) | `configmaps` | get, list, watch, create, update, patch, delete | OPA policy bundle storage |
| `""` (core) | `pods` | get, list, watch | Status monitoring |
| `""` (core) | `events` | create, patch | Reconciliation event recording |
| `coordination.k8s.io` | `leases` | get, list, watch, create, update, patch, delete | Leader election |

> **Note:** The operator has **read-only** access to Secrets. It never creates, modifies, or deletes Secrets.

## Operator Health and Monitoring

### Health Endpoints

The operator exposes two health probe endpoints:

| Endpoint | Port | Purpose |
|----------|------|---------|
| `/healthz` | 8081 | Liveness probe -- restart if unhealthy |
| `/readyz` | 8081 | Readiness probe -- remove from Service if not ready |

### Metrics

The operator exposes Prometheus metrics on port **8080**:

| Metric | Description |
|--------|-------------|
| `controller_runtime_reconcile_total` | Total reconciliation attempts by controller and result |
| `controller_runtime_reconcile_errors_total` | Total reconciliation errors |
| `controller_runtime_reconcile_time_seconds` | Time taken per reconciliation |
| `workqueue_depth` | Current depth of the work queue |
| `workqueue_adds_total` | Total items added to the work queue |

Scrape configuration for Prometheus:

```yaml
- job_name: openclaw-operator
  kubernetes_sd_configs:
    - role: pod
      namespaces:
        names:
          - openclaw-system
  relabel_configs:
    - source_labels: [__meta_kubernetes_pod_label_app_kubernetes_io_name]
      regex: openclaw-operator
      action: keep
    - source_labels: [__meta_kubernetes_pod_container_port_name]
      regex: metrics
      action: keep
```

## Operator Environment Variables and Configuration

The operator is configured via command-line arguments and environment variables.

### Command-Line Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--leader-elect` | `false` | Enable leader election for HA operator deployments |
| `--metrics-bind-address` | `:8080` | Address to bind the metrics endpoint |
| `--health-probe-bind-address` | `:8081` | Address to bind the health probe endpoint |

### Operator Deployment Resources

The operator itself is lightweight:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

### Security Context

The operator runs with a hardened security context:

- `runAsNonRoot: true`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- All capabilities dropped
- `seccompProfile: RuntimeDefault`

### Gateway Pod Resources (managed by operator)

Each gateway pod created by the operator has the following default resource allocation:

| Container | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-----------|-----------|---------------|-------------|
| `gateway` | 250m | 1 | 256Mi | 512Mi |
| `opa-sidecar` | 100m | 500m | 128Mi | 256Mi |

### Gateway Pod Environment Variables (injected by operator)

The operator injects the following environment variables into gateway containers:

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Secret (`postgresSecretRef`) | PostgreSQL connection string |
| `REDIS_URL` | Secret (`redisSecretRef`) | Redis connection string |
| `SSO_PROVIDER` | CR spec (`auth.provider`) | SSO provider name |
| `SSO_CLIENT_ID` | CR spec (`auth.clientId`) | OIDC client identifier |
| `SSO_CLIENT_SECRET` | Secret (`auth.clientSecretRef`) | OIDC client secret |
| `OPA_URL` | Hardcoded | `http://localhost:8181` (sidecar) |
