---
title: Quickstart Guide
description: Deploy OpenClaw Enterprise on Kubernetes in six steps
---

# Quickstart Guide

This guide walks you through deploying OpenClaw Enterprise on Kubernetes. By the end, you will have a working instance with SSO authentication, database storage, at least one connector, and a basic enterprise policy.

## Prerequisites

Before you begin, ensure you have the following:

| Requirement | Minimum Version | Notes |
|---|---|---|
| Kubernetes cluster | 1.28+ | Any conformant distribution (EKS, GKE, AKS, k3s, etc.) |
| kubectl | Matching K8s version | Configured to access your cluster |
| OpenClaw | Latest stable | Installed and accessible in the cluster |
| PostgreSQL | 16+ | Two databases: one for operational state, one for audit logs |
| Redis | 7+ | For caching (sessions, policies, connector tokens) |
| SSO/OIDC provider | Any | Okta, Azure AD, Keycloak, Auth0, or any OIDC-compliant provider |
| OAuth credentials | -- | For each connector you plan to enable (Gmail, GCal, Jira, GitHub, GDrive) |
| Helm | 3.12+ | Optional, for Helm-based installation |

!!! tip "Development and testing"
    For local development and testing, you can use [k3s](https://k3s.io/) or [kind](https://kind.sigs.k8s.io/) with a local PostgreSQL and Redis instance. The operator works the same way regardless of cluster distribution.

---

## Step 1: Install the Kubernetes Operator

The OpenClaw Enterprise operator manages the lifecycle of gateway instances and policy bundles. Install the CRDs and operator:

```bash
# Apply Custom Resource Definitions
kubectl apply -f https://raw.githubusercontent.com/openclaw/enterprise-operator/main/config/crd/bases/openclaw.enterprise.io_openclawinstances.yaml
kubectl apply -f https://raw.githubusercontent.com/openclaw/enterprise-operator/main/config/crd/bases/openclaw.enterprise.io_policybundles.yaml

# Create the operator namespace
kubectl create namespace openclaw-system

# Deploy the operator
kubectl apply -f https://raw.githubusercontent.com/openclaw/enterprise-operator/main/config/manager/manager.yaml
```

Verify the operator is running:

```bash
kubectl get pods -n openclaw-system
```

Expected output:

```
NAME                                        READY   STATUS    RESTARTS   AGE
openclaw-operator-manager-xxxxxxxxx-xxxxx   1/1     Running   0          30s
```

!!! note "RBAC"
    The operator deployment includes RBAC resources (ServiceAccount, ClusterRole, ClusterRoleBinding) that grant it permission to manage OpenClawInstance and PolicyBundle resources, create deployments, services, and config maps, and inject OPA sidecars.

---

## Step 2: Create Database Secrets

OpenClaw Enterprise requires two PostgreSQL databases (operational and audit) and a Redis instance. Create Kubernetes secrets with the connection strings:

```bash
# Create the namespace for your instance
kubectl create namespace openclaw-enterprise

# PostgreSQL connection string (operational database)
kubectl create secret generic openclaw-postgres \
  --namespace openclaw-enterprise \
  --from-literal=connection-string="postgresql://openclaw:YOUR_PASSWORD@postgres-host:5432/openclaw_enterprise?sslmode=require"

# PostgreSQL connection string (audit database)
kubectl create secret generic openclaw-audit-db \
  --namespace openclaw-enterprise \
  --from-literal=connection-string="postgresql://openclaw:YOUR_PASSWORD@postgres-host:5432/openclaw_audit?sslmode=require"

# Redis connection string
kubectl create secret generic openclaw-redis \
  --namespace openclaw-enterprise \
  --from-literal=connection-string="rediss://openclaw:YOUR_PASSWORD@redis-host:6379/0"
```

!!! warning "Separate audit database"
    The audit database should be a separate PostgreSQL database (or at minimum a separate schema) from the operational database. Audit logs are append-only and have different retention requirements. Keeping them separate simplifies backup, retention, and compliance.

---

## Step 3: Create Connector Credentials

Create secrets for each connector you plan to enable. Each connector requires OAuth credentials from the corresponding platform:

=== "Gmail and GCal (Google Workspace)"

    ```bash
    kubectl create secret generic openclaw-google-oauth \
      --namespace openclaw-enterprise \
      --from-literal=client-id="YOUR_GOOGLE_CLIENT_ID" \
      --from-literal=client-secret="YOUR_GOOGLE_CLIENT_SECRET"
    ```

    Required OAuth scopes:

    - Gmail: `https://www.googleapis.com/auth/gmail.readonly` (add `.modify` for write access)
    - GCal: `https://www.googleapis.com/auth/calendar.readonly` (add `.events` for write access)
    - GDrive: `https://www.googleapis.com/auth/drive.readonly` (add `.file` for write access)

=== "Jira"

    ```bash
    kubectl create secret generic openclaw-jira-oauth \
      --namespace openclaw-enterprise \
      --from-literal=client-id="YOUR_JIRA_CLIENT_ID" \
      --from-literal=client-secret="YOUR_JIRA_CLIENT_SECRET" \
      --from-literal=base-url="https://your-org.atlassian.net"
    ```

=== "GitHub"

    ```bash
    kubectl create secret generic openclaw-github-oauth \
      --namespace openclaw-enterprise \
      --from-literal=client-id="YOUR_GITHUB_APP_ID" \
      --from-literal=private-key="$(cat github-app-private-key.pem)" \
      --from-literal=webhook-secret="YOUR_WEBHOOK_SECRET"
    ```

!!! tip "Start with read-only"
    Connectors default to read-only access. You can configure write access later through the policy engine. Start with read-only to validate the setup before enabling write operations.

---

## Step 4: Deploy an OpenClawInstance

Create an `OpenClawInstance` custom resource that defines your deployment. Save the following as `openclaw-instance.yaml`:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: OpenClawInstance
metadata:
  name: my-enterprise
  namespace: openclaw-enterprise
spec:
  deploymentMode: single    # Use "ha" for high-availability with multiple replicas
  replicas: 1

  auth:
    provider: okta           # Options: okta, azure-ad, keycloak, or any OIDC provider
    clientId: "YOUR_OIDC_CLIENT_ID"
    clientSecretRef:
      name: openclaw-oidc-secret
      key: client-secret

  storage:
    postgresSecretRef:
      name: openclaw-postgres
      key: connection-string
    redisSecretRef:
      name: openclaw-redis
      key: connection-string

  integrations:
    - type: gmail
      enabled: true
      config:
        credentialSecret: openclaw-google-oauth
    - type: gcal
      enabled: true
      config:
        credentialSecret: openclaw-google-oauth
    - type: gdrive
      enabled: true
      config:
        credentialSecret: openclaw-google-oauth
    - type: jira
      enabled: true
      config:
        credentialSecret: openclaw-jira-oauth
    - type: github
      enabled: true
      config:
        credentialSecret: openclaw-github-oauth
```

Before applying, create the OIDC client secret:

```bash
kubectl create secret generic openclaw-oidc-secret \
  --namespace openclaw-enterprise \
  --from-literal=client-secret="YOUR_OIDC_CLIENT_SECRET"
```

Apply the instance:

```bash
kubectl apply -f openclaw-instance.yaml
```

Monitor the deployment:

```bash
# Watch the instance status
kubectl get openclawinstances -n openclaw-enterprise -w

# Check pod status
kubectl get pods -n openclaw-enterprise

# View operator logs if something is wrong
kubectl logs -n openclaw-system deployment/openclaw-operator-manager -f
```

Expected output when ready:

```
NAME            MODE     REPLICAS   READY   PHASE     AGE
my-enterprise   single   1          1       Running   2m
```

---

## Step 5: Create a Basic Enterprise Policy

Deploy a `PolicyBundle` that defines baseline enterprise policies. Save the following as `baseline-policy.yaml`:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: baseline-enterprise
  namespace: openclaw-enterprise
spec:
  policies:
    # Restrict confidential data to internal models only
    - scope: enterprise
      domain: models
      name: model-routing-by-classification
      content: |
        package enterprise.models

        default allow_external_model = false

        allow_external_model {
          input.data_classification == "public"
        }

        allow_external_model {
          input.data_classification == "internal"
        }

    # Default all connectors to read-only
    - scope: enterprise
      domain: integrations
      name: connector-default-readonly
      content: |
        package enterprise.integrations

        default allow_write = false

        allow_write {
          input.connector == "jira"
          input.action == "add_comment"
          input.policy_scope.team_allows_jira_write == true
        }

        allow_write {
          input.connector == "jira"
          input.action == "transition_issue"
          input.policy_scope.team_allows_jira_write == true
          input.target_status != "Done"
        }

    # Set default autonomy levels
    - scope: enterprise
      domain: actions
      name: default-autonomy-levels
      content: |
        package enterprise.actions

        default autonomy_level = "block"

        # Allow reading from any enabled connector
        autonomy_level = "autonomous" {
          input.action_type == "read"
          input.connector_enabled == true
        }

        # Notify for auto-responses to internal messages
        autonomy_level = "notify" {
          input.action_type == "auto_response"
          input.message_classification == "internal"
          input.channel_type == "internal"
        }

        # Require approval for external communications
        autonomy_level = "approve" {
          input.action_type == "send_message"
          input.channel_type == "external"
        }

        # Require approval for all write actions
        autonomy_level = "approve" {
          input.action_type == "write"
        }

    # Configure agent-to-agent exchange limits
    - scope: enterprise
      domain: agent-to-agent
      name: ocip-baseline
      content: |
        package enterprise.ocip

        default allow_exchange = true
        default max_rounds = 3
        default max_classification = "internal"

        allow_exchange = false {
          input.target_enterprise != input.source_enterprise
        }
```

Apply the policy bundle:

```bash
kubectl apply -f baseline-policy.yaml
```

Verify the policies are loaded:

```bash
kubectl get policybundles -n openclaw-enterprise
```

Expected output:

```
NAME                   APPLIED   TOTAL   AGE
baseline-enterprise    4         4       15s
```

!!! info "Policy hot-reload"
    Policies take effect within 60 seconds of being applied. You do not need to restart the gateway. The operator detects the PolicyBundle change and pushes the updated policies to the OPA sidecar.

---

## Step 6: Verify the Deployment

Run through these verification checks to confirm everything is working:

### Check instance health

```bash
# Gateway pod should be Running and Ready
kubectl get pods -n openclaw-enterprise

# Check the instance status conditions
kubectl describe openclawinstance my-enterprise -n openclaw-enterprise
```

Look for these conditions in the status:

- `Ready: True` -- the gateway is running and healthy
- `PolicyReady: True` -- the OPA sidecar is loaded with policies
- `PolicySynced: True` -- all policy bundles are synchronized

### Test the API

```bash
# Port-forward to the gateway
kubectl port-forward -n openclaw-enterprise svc/my-enterprise-gateway 8080:8080

# Check the health endpoint
curl http://localhost:8080/api/v1/health

# Check policy engine status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/v1/admin/policy/status

# Check connector status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/v1/admin/integrations/status
```

### Verify audit logging

```bash
# Query recent audit entries (requires admin token)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:8080/api/v1/admin/audit?limit=10"
```

You should see audit entries for the startup sequence, policy loading, and any API calls you have made.

---

## Validation Checklist

Use this checklist to confirm your deployment is complete:

- [ ] Operator pod is running in `openclaw-system` namespace
- [ ] OpenClawInstance status shows `Phase: Running`
- [ ] Gateway pod is `Ready` with OPA sidecar container
- [ ] All `Ready`, `PolicyReady`, and `PolicySynced` conditions are `True`
- [ ] Health endpoint returns 200
- [ ] SSO/OIDC login flow works (redirect to identity provider and back)
- [ ] At least one connector shows `connected` status
- [ ] Policy engine status shows all policies loaded
- [ ] Audit log contains entries for startup and API calls
- [ ] Port-forward or ingress provides access to the gateway

---

## What's Next

Now that you have a running OpenClaw Enterprise instance, here are the recommended next steps:

- **Configure your team**: Set up organization and team policies that refine the enterprise baseline
- **Enable connectors**: Have users authenticate with their individual OAuth credentials for each connector
- **Set up daily briefings**: Configure the task intelligence plugin to generate morning briefings
- **Review the Admin Guide**: Learn how to manage policies, review audit logs, and monitor the system
- **Explore the User Guide**: Understand how to use task intelligence, auto-response, work tracking, and other features

For production deployments, also review:

- **HA mode**: Switch to `deploymentMode: ha` with multiple replicas for high availability
- **Ingress configuration**: Set up ingress with TLS termination for external access
- **Backup strategy**: Configure PostgreSQL backups for both operational and audit databases
- **Monitoring**: Integrate with your existing monitoring stack (Prometheus, Grafana, etc.)
- **Network policies**: Restrict pod-to-pod communication to only required paths
