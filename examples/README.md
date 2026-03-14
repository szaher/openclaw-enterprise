# OpenClaw Enterprise Examples

Kubernetes YAML manifests and configuration examples for deploying and configuring OpenClaw Enterprise. Each directory covers a specific deployment scenario or feature area.

## Prerequisites

- Kubernetes cluster (v1.27+)
- `kubectl` configured to access your cluster
- OpenClaw Enterprise operator installed in the `openclaw-system` namespace
- PostgreSQL 16+ and Redis 7+ accessible from the cluster

Install the operator:

```bash
kubectl apply -f https://github.com/szaher/openclaw-enterprise/releases/latest/download/operator.yaml
```

## Examples Index

### Quickstart

**Directory:** [`quickstart/`](quickstart/)

The fastest way to get OpenClaw Enterprise running. Deploys a single-replica instance with minimal configuration and no connectors.

```bash
# 1. Edit secrets.yaml with your real credentials
# 2. Apply everything at once
kubectl apply -k examples/quickstart/
```

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates `openclaw-system` and `openclaw-enterprise` namespaces |
| `secrets.yaml` | Placeholder secrets for PostgreSQL, Redis, and SSO (edit before applying) |
| `instance-minimal.yaml` | Simplest OpenClawInstance: single mode, 1 replica, no connectors |
| `kustomization.yaml` | Kustomize overlay to apply all quickstart resources |

---

### Production

**Directory:** [`production/`](production/)

Production-grade HA deployment with all connectors, enterprise policies, TLS ingress, and network policies.

```bash
# 1. Seal your secrets with kubeseal
# 2. Configure DNS for your ingress hostname
# 3. Apply everything
kubectl apply -k examples/production/
```

| File | Description |
|------|-------------|
| `namespace.yaml` | Namespaces with Pod Security Standards enforced |
| `secrets.yaml` | SealedSecret templates for GitOps-safe credential storage |
| `instance-ha.yaml` | HA mode, 3 replicas, all 5 connectors, pinned image versions |
| `policy-enterprise.yaml` | Full enterprise policy bundle covering all 7 policy domains |
| `ingress.yaml` | Nginx ingress with TLS, security headers, and cert-manager |
| `networkpolicy.yaml` | Network policies implementing default-deny with explicit allows |
| `kustomization.yaml` | Kustomize overlay for the full production stack |

---

### Policies

**Directory:** [`policies/`](policies/)

Individual policy examples for each of the 7 policy domains. Use these as starting points for building your own policy bundles.

| File | Domain | Description |
|------|--------|-------------|
| `model-routing.yaml` | models | Route sensitive data to internal models, allow external models for public data |
| `action-autonomy.yaml` | actions | Define autonomy levels: read=auto, write=approve, external=block |
| `data-classification.yaml` | data | Auto-classify data based on content patterns and source type |
| `integration-permissions.yaml` | integrations | Control connector access by role, enforce MFA for write operations |
| `audit-retention.yaml` | audit | Set retention periods by event category, control export permissions |
| `agent-to-agent.yaml` | agent-to-agent | OCIP trust lists, data classification filtering, loop prevention |
| `feature-gating.yaml` | features | Tier-based feature access: all users, power users, admins, experimental |

```bash
# Apply individual policies
kubectl apply -f examples/policies/model-routing.yaml
kubectl apply -f examples/policies/action-autonomy.yaml
```

---

### Multi-Tenant

**Directory:** [`multi-tenant/`](multi-tenant/)

Run separate OpenClawInstance deployments for different departments with tenant-specific policies and routing.

```bash
# Deploy engineering tenant
kubectl apply -f examples/multi-tenant/tenant-engineering.yaml
kubectl apply -f examples/multi-tenant/policy-engineering.yaml

# Deploy sales tenant
kubectl apply -f examples/multi-tenant/tenant-sales.yaml
kubectl apply -f examples/multi-tenant/policy-sales.yaml

# Set up routing
kubectl apply -f examples/multi-tenant/ingress-multi-tenant.yaml
```

| File | Description |
|------|-------------|
| `tenant-engineering.yaml` | Engineering instance: HA, GitHub + Jira + Gmail connectors |
| `tenant-sales.yaml` | Sales instance: single mode, Gmail + Calendar + Drive connectors |
| `policy-engineering.yaml` | Permissive policies for engineers (code autonomy, external models for code) |
| `policy-sales.yaml` | Restrictive policies for sales (no code access, customer data protection) |
| `ingress-multi-tenant.yaml` | Subdomain-based routing with commented path-based alternative |

---

### Policy Hierarchy

**Directory:** [`policy-hierarchy/`](policy-hierarchy/)

Demonstrates the four-level policy scope hierarchy: enterprise > org > team > user. Each level can narrow but never widen the permissions granted by the level above.

```bash
# Apply in order from broadest to narrowest scope
kubectl apply -f examples/policy-hierarchy/enterprise-baseline.yaml
kubectl apply -f examples/policy-hierarchy/org-engineering.yaml
kubectl apply -f examples/policy-hierarchy/team-platform.yaml
kubectl apply -f examples/policy-hierarchy/user-admin.yaml
```

| File | Scope | Description |
|------|-------|-------------|
| `enterprise-baseline.yaml` | enterprise | Organization-wide security floor (broadest) |
| `org-engineering.yaml` | org | Engineering org overrides: code model access, auto-approve code comments |
| `team-platform.yaml` | team | Platform team overrides: infra auto-approvals, production approval gates |
| `user-admin.yaml` | user | Admin user overrides: policy management, audit export (narrowest) |

---

### Air-Gapped

**Directory:** [`air-gapped/`](air-gapped/)

Deployment for environments without internet access. All images pulled from a private registry; only internal connectors enabled.

```bash
# 1. Mirror images to your private registry
# 2. Create the image pull secret
kubectl apply -f examples/air-gapped/imagepullsecret.yaml
kubectl apply -f examples/air-gapped/instance-airgapped.yaml
```

| File | Description |
|------|-------------|
| `instance-airgapped.yaml` | HA instance with private registry images, only Jira (self-hosted) enabled |
| `imagepullsecret.yaml` | Docker registry credentials for pulling from private registry |

---

### Connectors

**Directory:** [`connectors/`](connectors/)

Connector configuration profiles showing different combinations based on team needs.

| File | Connectors | Use Case |
|------|------------|----------|
| `gmail-only.yaml` | Gmail | Email triage and management teams |
| `jira-github.yaml` | Jira, GitHub | Development teams (work tracking + code) |
| `full-suite.yaml` | Gmail, Calendar, Jira, GitHub, Drive | Full organization deployment |

```bash
# Pick the connector profile that matches your team
kubectl apply -f examples/connectors/jira-github.yaml
```

---

### Local Development

**Directory:** [`local-dev/`](local-dev/)

Local development setup using Kind (Kubernetes in Docker) with permissive policies for fast iteration.

```bash
# 1. Start local PostgreSQL and Redis
docker run -d --name openclaw-postgres -p 5432:5432 \
  -e POSTGRES_DB=openclaw -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=devpassword postgres:16

docker run -d --name openclaw-redis -p 6379:6379 redis:7

# 2. Create the Kind cluster
kind create cluster --config examples/local-dev/kind-config.yaml

# 3. Deploy OpenClaw Enterprise
kubectl apply -f examples/local-dev/instance-local.yaml
kubectl apply -f examples/local-dev/policy-permissive.yaml
```

| File | Description |
|------|-------------|
| `kind-config.yaml` | Kind cluster config with local registry and port mappings |
| `instance-local.yaml` | Single-mode instance pointing to host-local PostgreSQL and Redis |
| `policy-permissive.yaml` | Wide-open policies for development (not for production) |

---

## CRD Reference

### OpenClawInstance

| Field | Type | Description |
|-------|------|-------------|
| `spec.deploymentMode` | `"single"` or `"ha"` | Deployment mode |
| `spec.replicas` | int32 | Number of replicas (minimum 1) |
| `spec.auth.provider` | string | OIDC provider URL |
| `spec.auth.clientId` | string | OIDC client ID |
| `spec.auth.clientSecretRef` | `{name, key}` | Secret reference for OIDC client secret |
| `spec.storage.postgresSecretRef` | `{name, key}` | Secret reference for PostgreSQL connection string |
| `spec.storage.redisSecretRef` | `{name, key}` | Secret reference for Redis connection string |
| `spec.images.gateway` | string | Optional gateway image override |
| `spec.images.opa` | string | Optional OPA image override |
| `spec.integrations[]` | list | Connector configurations |
| `spec.integrations[].type` | string | One of: `gmail`, `gcal`, `jira`, `github`, `gdrive` |
| `spec.integrations[].enabled` | bool | Whether the connector is active |
| `spec.integrations[].config` | map[string]string | Connector-specific configuration |

### PolicyBundle

| Field | Type | Description |
|-------|------|-------------|
| `spec.policies[]` | list | Policy definitions |
| `spec.policies[].scope` | string | One of: `enterprise`, `org`, `team`, `user` |
| `spec.policies[].domain` | string | One of: `models`, `actions`, `integrations`, `agent-to-agent`, `features`, `data`, `audit` |
| `spec.policies[].name` | string | Unique policy name within the bundle |
| `spec.policies[].content` | string | Rego policy source code |

All resources use `apiVersion: openclaw.enterprise.io/v1`.
