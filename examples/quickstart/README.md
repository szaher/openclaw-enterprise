# Quickstart

The fastest way to get OpenClaw Enterprise running. Deploys a single-replica instance with minimal configuration and no connectors enabled.

**Use this when:** You want to evaluate OpenClaw Enterprise, run a proof-of-concept, or get familiar with the platform before production deployment.

## Prerequisites

- Kubernetes cluster (v1.27+)
- OpenClaw Enterprise operator installed ([deployment guide](https://szaher.github.io/openclaw-enterprise/deployment/operator/))
- PostgreSQL 16+ and Redis 7+ accessible from the cluster

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates `openclaw-system` and `openclaw-enterprise` namespaces |
| `secrets.yaml` | Placeholder secrets for PostgreSQL, Redis, and SSO -- **edit before applying** |
| `instance-minimal.yaml` | Simplest OpenClawInstance: single mode, 1 replica, no connectors |
| `kustomization.yaml` | Kustomize overlay to apply all resources at once |

## Usage

1. Edit `secrets.yaml` with your real database credentials and SSO client secret:

    ```bash
    vim secrets.yaml  # Replace all CHANGE_ME values
    ```

2. Apply everything:

    ```bash
    kubectl apply -k .
    ```

3. Verify the instance is running:

    ```bash
    kubectl get openclawinstances -n openclaw-enterprise
    kubectl get pods -n openclaw-enterprise
    ```

## What gets created

- Two namespaces: `openclaw-system` (operator) and `openclaw-enterprise` (workloads)
- Three Kubernetes Secrets (PostgreSQL, Redis, SSO)
- One `OpenClawInstance` CR in single mode with 1 replica
- The operator reconciles the CR and creates a gateway Deployment + Service

## Next steps

- Add connectors: see [`../connectors/`](../connectors/)
- Add policies: see [`../policies/`](../policies/)
- Scale to production: see [`../production/`](../production/)
