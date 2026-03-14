# Air-Gapped Deployment

Deployment for environments without internet access. All container images are pulled from a private/internal registry, and only connectors that reach internal services are enabled.

**Use this when:** Your Kubernetes cluster has no internet access (government, defense, regulated industries), or you need to run entirely on internal infrastructure.

## Prerequisites

- Private container registry accessible from the cluster (e.g., Harbor, Nexus, Artifactory)
- The following images mirrored to your private registry:
  - `ghcr.io/szaher/openclaw-enterprise/gateway:<version>`
  - `openpolicyagent/opa:1.4.2-static`
- PostgreSQL and Redis accessible within the air-gapped network
- Internal OIDC provider (e.g., self-hosted Keycloak)

## Files

| File | Description |
|------|-------------|
| `instance-airgapped.yaml` | HA instance with private registry images, namespace, and secrets |
| `imagepullsecret.yaml` | Docker registry credentials for pulling from private registry |

## Usage

1. Mirror the required images to your private registry:

    ```bash
    # On a machine with internet access
    docker pull ghcr.io/szaher/openclaw-enterprise/gateway:v1.2.0
    docker pull openpolicyagent/opa:1.4.2-static

    docker tag ghcr.io/szaher/openclaw-enterprise/gateway:v1.2.0 \
      registry.internal.local/openclaw-enterprise/gateway:v1.2.0
    docker tag openpolicyagent/opa:1.4.2-static \
      registry.internal.local/openclaw-enterprise/opa:v1.2.0

    docker push registry.internal.local/openclaw-enterprise/gateway:v1.2.0
    docker push registry.internal.local/openclaw-enterprise/opa:v1.2.0
    ```

2. Update `instance-airgapped.yaml` with your actual registry URL and credentials.

3. Apply:

    ```bash
    kubectl apply -f imagepullsecret.yaml
    kubectl apply -f instance-airgapped.yaml
    ```

## Image overrides

The `spec.images` field in the OpenClawInstance CR allows pointing to any registry:

```yaml
spec:
  images:
    gateway: "registry.internal.local/openclaw-enterprise/gateway:v1.2.0"
    opa: "registry.internal.local/openclaw-enterprise/opa:v1.2.0"
```

## Connector restrictions

In air-gapped environments, cloud-based connectors (Gmail, Google Calendar, Google Drive, GitHub Cloud) will not work. Only connectors that reach internal services should be enabled:

| Connector | Works in air-gapped? | Notes |
|-----------|---------------------|-------|
| Jira (Data Center) | Yes | Self-hosted Jira accessible within the network |
| GitHub Enterprise Server | Yes | Self-hosted GHES accessible within the network |
| Gmail | No | Requires Google API access |
| Google Calendar | No | Requires Google API access |
| Google Drive | No | Requires Google API access |
