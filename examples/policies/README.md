# Policy Examples

Individual PolicyBundle examples for each of the 7 policy domains. Use these as starting points for building your own policy bundles.

**Use this when:** You want to understand how policies work in each domain, or need a template for writing custom Rego policies.

## Policy domains

OpenClaw Enterprise organizes policies into 7 domains, each governing a different aspect of assistant behavior:

| File | Domain | What it controls |
|------|--------|-----------------|
| `model-routing.yaml` | `models` | Which AI models can process data at each classification level |
| `action-autonomy.yaml` | `actions` | Whether the assistant acts autonomously, requests approval, or is blocked |
| `data-classification.yaml` | `data` | How data is classified and what restrictions apply per classification |
| `integration-permissions.yaml` | `integrations` | Which connectors users can access and what operations are allowed |
| `audit-retention.yaml` | `audit` | How long audit logs are retained and who can export them |
| `agent-to-agent.yaml` | `agent-to-agent` | OCIP cross-organization trust, data filtering, and loop prevention |
| `feature-gating.yaml` | `features` | Which features are available at each scope (enterprise/org/team/user) |

## Usage

Apply individual policies as needed:

```bash
# Apply model routing policy
kubectl apply -f model-routing.yaml

# Apply multiple policies
kubectl apply -f model-routing.yaml -f action-autonomy.yaml -f data-classification.yaml
```

## Policy scopes

Each policy has a `scope` that determines its position in the hierarchy:

```
enterprise  (broadest -- security floor for the entire organization)
  org       (department-level -- can narrow but not widen enterprise rules)
    team    (team-level -- can narrow but not widen org rules)
      user  (individual -- can narrow but not widen team rules)
```

All examples in this directory use `scope: enterprise`. For hierarchy examples showing how scopes interact, see [`../policy-hierarchy/`](../policy-hierarchy/).

## Writing custom policies

Policies are written in [Rego](https://www.openpolicyagent.org/docs/latest/policy-language/) (OPA's policy language). Each policy must:

1. Declare a `package` matching the pattern `openclaw.enterprise.<domain>`
2. Define `default` values for the main decision variable
3. Use `input.*` to access the request context

Example structure:

```rego
package openclaw.enterprise.models

default allow = false

allow {
    input.model.provider == "internal"
}
```

For the full policy writing guide, see the [documentation](https://szaher.github.io/openclaw-enterprise/how-to/write-policies/).
