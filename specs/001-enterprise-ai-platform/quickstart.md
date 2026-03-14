# Quickstart: OpenClaw Enterprise

## Prerequisites

- Kubernetes cluster (v1.28+) with kubectl configured
- OpenClaw installed and running (v X.Y.Z+)
- SSO/OIDC provider configured (Keycloak, Okta, Azure AD, etc.)
- PostgreSQL 16+ instance accessible from the cluster
- Redis 7+ instance accessible from the cluster
- OAuth credentials for at least one connector (Gmail, GCal, Jira, GitHub, or GDrive)

## Step 1: Install the K8s Operator

Apply the operator CRDs and deploy the operator controller:

```bash
kubectl apply -f https://github.com/szaher/openclaw-enterprise/releases/latest/download/crds.yaml
kubectl apply -f https://github.com/szaher/openclaw-enterprise/releases/latest/download/operator.yaml
```

Verify the operator is running:

```bash
kubectl get pods -n openclaw-system -l app=openclaw-operator
```

## Step 2: Create Database Secrets

Store PostgreSQL and Redis connection strings as K8s Secrets:

```bash
kubectl create secret generic openclaw-db \
  --from-literal=connection-string="postgresql://user:pass@host:5432/openclaw" \
  -n openclaw-system

kubectl create secret generic openclaw-audit-db \
  --from-literal=connection-string="postgresql://user:pass@host:5432/openclaw_audit" \
  -n openclaw-system

kubectl create secret generic openclaw-redis \
  --from-literal=connection-string="redis://host:6379" \
  -n openclaw-system
```

## Step 3: Create Connector Credentials

Store OAuth tokens for your connectors:

```bash
kubectl create secret generic openclaw-gmail-oauth \
  --from-literal=client-id="..." \
  --from-literal=client-secret="..." \
  -n openclaw-system

# Repeat for each connector
```

## Step 4: Deploy an OpenClaw Enterprise Instance

Create an `OpenClawInstance` custom resource:

```yaml
apiVersion: openclaw.io/v1
kind: OpenClawInstance
metadata:
  name: my-enterprise
  namespace: openclaw-system
spec:
  deployment:
    mode: shared
    replicas: 2
  auth:
    provider: oidc
    issuer: "https://sso.company.com"
    clientId: "openclaw"
  storage:
    taskStore:
      type: postgresql
      connectionSecret: openclaw-db
    auditLog:
      type: postgresql
      connectionSecret: openclaw-audit-db
    cache:
      type: redis
      connectionSecret: openclaw-redis
  integrations:
    - name: gmail
      credentialSecret: openclaw-gmail-oauth
    - name: jira
      credentialSecret: openclaw-jira-token
    - name: github
      credentialSecret: openclaw-github-token
```

Apply it:

```bash
kubectl apply -f openclaw-instance.yaml
```

## Step 5: Create a Basic Enterprise Policy

```yaml
apiVersion: openclaw.io/v1
kind: PolicyBundle
metadata:
  name: enterprise-defaults
spec:
  policies:
    - domain: actions
      scope: enterprise
      content: |
        default_autonomy: notify
        blocked:
          - deleteEmail
          - closeGitHubPR
    - domain: models
      scope: enterprise
      content: |
        allowed_providers:
          - self-hosted
          - anthropic
        sensitive_data_model: self-hosted
    - domain: integrations
      scope: enterprise
      content: |
        default_permissions: read
```

Apply it:

```bash
kubectl apply -f enterprise-policy.yaml
```

## Step 6: Verify

Check the instance status:

```bash
kubectl get openclawinstance my-enterprise -o jsonpath='{.status}'
```

Access the admin API:

```bash
curl -H "Authorization: Bearer $TOKEN" https://openclaw.internal/api/v1/status
```

## What's Next

- Configure team-level and user-level policies via the admin API
- Enable auto-response for specific Slack channels
- Set up GitHub/Jira webhooks for work tracking auto-updates
- Review the audit log to verify all actions are being captured

## Validation Checklist

- [ ] Operator pod is running in openclaw-system namespace
- [ ] OpenClaw gateway pods are running (check replicas)
- [ ] OPA sidecar is running alongside each gateway pod
- [ ] SSO login flow works (obtain a token and call /api/v1/auth/userinfo)
- [ ] At least one connector is active (check /api/v1/connectors)
- [ ] Enterprise policy is applied (check /api/v1/policies)
- [ ] Audit log is capturing events (check /api/v1/audit)
- [ ] Daily briefing generates on schedule (check cron job)
