# Multi-Tenant Deployment

Run separate OpenClawInstance deployments for different departments, each with tenant-specific policies, connectors, and ingress routing.

**Use this when:** Your organization has multiple departments (engineering, sales, etc.) that need isolated OpenClaw instances with different policies and connector access.

## Architecture

Each tenant gets:

- Its own Kubernetes namespace
- Its own OpenClawInstance (gateway pods + OPA sidecar)
- Its own PolicyBundle(s) scoped to that tenant
- Its own database and Redis (or shared with logical separation)
- Independent scaling and lifecycle

```
openclaw-engineering/
  OpenClawInstance (HA, 3 replicas)
  PolicyBundle (permissive for developers)
  Connectors: GitHub, Jira, Gmail

openclaw-sales/
  OpenClawInstance (single, 1 replica)
  PolicyBundle (restrictive for customer data)
  Connectors: Gmail, Calendar, Drive
```

## Files

| File | Description |
|------|-------------|
| `tenant-engineering.yaml` | Engineering tenant: HA mode, GitHub + Jira + Gmail connectors |
| `tenant-sales.yaml` | Sales tenant: single mode, Gmail + Calendar + Drive connectors |
| `policy-engineering.yaml` | Permissive policies for engineers (code autonomy, external models for code) |
| `policy-sales.yaml` | Restrictive policies for sales (no code access, customer data protection) |
| `ingress-multi-tenant.yaml` | Subdomain-based routing with commented path-based alternative |

## Usage

```bash
# Deploy engineering tenant
kubectl apply -f tenant-engineering.yaml
kubectl apply -f policy-engineering.yaml

# Deploy sales tenant
kubectl apply -f tenant-sales.yaml
kubectl apply -f policy-sales.yaml

# Set up routing
kubectl apply -f ingress-multi-tenant.yaml
```

## Routing strategies

The ingress example includes two routing approaches:

1. **Subdomain-based** (default): `engineering.openclaw.your-company.com`, `sales.openclaw.your-company.com`
2. **Path-based** (commented in the file): `openclaw.your-company.com/engineering/`, `openclaw.your-company.com/sales/`

## Tenant isolation

- Each tenant has its own namespace, secrets, and database credentials
- Network policies (see [`../production/networkpolicy.yaml`](../production/networkpolicy.yaml)) can restrict cross-namespace traffic
- Policies are scoped per-tenant -- engineering policies do not affect sales and vice versa
- SSO identity determines which tenant a user is routed to via OIDC group claims
