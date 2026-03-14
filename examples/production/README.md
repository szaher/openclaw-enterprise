# Production Deployment

Production-grade high-availability deployment with all connectors, full enterprise policies, TLS ingress, and network policies.

**Use this when:** You are deploying OpenClaw Enterprise for real users in a production environment with security, availability, and compliance requirements.

## Prerequisites

- Kubernetes cluster (v1.27+) with at least 3 nodes
- OpenClaw Enterprise operator installed
- External PostgreSQL cluster (HA) provisioned
- External Redis cluster (HA/Sentinel) provisioned
- OIDC provider configured (Okta, Keycloak, Azure AD, etc.) with redirect URIs
- Nginx Ingress Controller installed
- cert-manager installed (for TLS certificates)
- `kubeseal` CLI installed (for SealedSecrets)

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | Namespaces with Pod Security Standards (`restricted`) enforced |
| `secrets.yaml` | SealedSecret templates for GitOps-safe credential storage |
| `instance-ha.yaml` | HA mode, 3 replicas, all 5 connectors, pinned image versions |
| `policy-enterprise.yaml` | Full enterprise policy bundle covering all 7 policy domains |
| `ingress.yaml` | Nginx ingress with TLS, security headers, and cert-manager annotations |
| `networkpolicy.yaml` | Network policies implementing default-deny with explicit allow rules |
| `kustomization.yaml` | Kustomize overlay for the full production stack |

## Usage

1. Seal your secrets:

    ```bash
    # Replace placeholder values, then seal with kubeseal
    kubeseal --format yaml < secrets.yaml > sealed-secrets.yaml
    kubectl apply -f sealed-secrets.yaml
    ```

2. Configure DNS to point your ingress hostname to the cluster's ingress controller.

3. Apply the full stack:

    ```bash
    kubectl apply -k .
    ```

4. Verify the deployment:

    ```bash
    kubectl get openclawinstances -n openclaw-enterprise
    kubectl get pods -n openclaw-enterprise
    kubectl get ingress -n openclaw-enterprise
    ```

## What gets created

- Namespaces with restricted Pod Security Standards
- SealedSecrets for all credentials (safe for Git)
- HA OpenClawInstance with 3 replicas and OPA sidecar per pod
- 5 connectors: Gmail, Google Calendar, Jira, GitHub, Google Drive
- Enterprise policies across all 7 domains (models, actions, data, integrations, audit, agent-to-agent, features)
- TLS-terminated Nginx ingress with security headers
- Network policies restricting traffic to only necessary paths

## Security notes

- All secrets use SealedSecrets -- never commit plaintext secrets to Git
- Network policies enforce default-deny; only explicitly allowed traffic is permitted
- Pod Security Standards set to `restricted` on namespaces
- TLS is required for all external traffic via ingress
- Image versions are pinned (not `latest`) for reproducibility
