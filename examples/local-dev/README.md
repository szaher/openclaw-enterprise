# Local Development

Local development setup using Kind (Kubernetes in Docker) with permissive policies for fast iteration.

**Use this when:** You are developing or testing OpenClaw Enterprise locally, want to validate CRD changes, or need a quick sandbox environment.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) or [Podman](https://podman.io/)
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- PostgreSQL 16+ and Redis 7+ (can run as containers)

## Files

| File | Description |
|------|-------------|
| `kind-config.yaml` | Kind cluster configuration with local registry and port mappings |
| `instance-local.yaml` | Single-mode OpenClawInstance pointing to host-local PostgreSQL and Redis |
| `policy-permissive.yaml` | Wide-open policies for development -- all actions allowed, all models allowed |

## Usage

1. Start local PostgreSQL and Redis:

    ```bash
    docker run -d --name openclaw-postgres -p 5432:5432 \
      -e POSTGRES_DB=openclaw \
      -e POSTGRES_USER=openclaw \
      -e POSTGRES_PASSWORD=devpassword \
      postgres:16

    docker run -d --name openclaw-redis -p 6379:6379 redis:7
    ```

2. Create the Kind cluster:

    ```bash
    kind create cluster --config kind-config.yaml --name openclaw-dev
    ```

3. Install the operator (build from source or use a released image):

    ```bash
    # From source
    cd ../../operator
    make docker-build IMG=localhost/openclaw-operator:dev
    kind load docker-image localhost/openclaw-operator:dev --name openclaw-dev
    kubectl apply -f config/crd/
    kubectl apply -f config/rbac/
    kubectl apply -f config/manager/manager.yaml

    # Or from a release
    kubectl apply -f https://github.com/szaher/openclaw-enterprise/releases/latest/download/operator.yaml
    ```

4. Deploy the local instance:

    ```bash
    kubectl apply -f instance-local.yaml
    kubectl apply -f policy-permissive.yaml
    ```

5. Verify:

    ```bash
    kubectl get openclawinstances -n openclaw-enterprise
    kubectl get pods -n openclaw-enterprise
    ```

## Alternatively: use the setup script

The repository includes a setup script that automates Kind cluster creation:

```bash
../../scripts/setup-kind.sh
```

This creates a `openclaw-dev` cluster with a local container registry and ingress controller.

## Cleanup

```bash
kind delete cluster --name openclaw-dev
docker rm -f openclaw-postgres openclaw-redis
```

## Important notes

- The permissive policy in `policy-permissive.yaml` allows **everything** -- do not use it in production
- Local PostgreSQL/Redis run without authentication -- this is acceptable only for development
- The Kind cluster uses `host.docker.internal` to reach services on the host machine
