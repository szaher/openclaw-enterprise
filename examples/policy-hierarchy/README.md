# Policy Hierarchy

Demonstrates the four-level policy scope hierarchy: `enterprise > org > team > user`. Each level can narrow (restrict) permissions but never widen (permit) beyond the level above.

**Use this when:** You want to understand how OpenClaw Enterprise's policy hierarchy works, or need templates for building multi-level policy configurations.

## How the hierarchy works

```
enterprise   Broadest scope -- defines the absolute security floor
  |            No lower-level policy can exceed these boundaries.
  org        Department/org-unit scope -- narrows enterprise rules
  |            e.g., Engineering can use external models for code,
  |            but still can't use them for confidential data.
  team       Team scope -- narrows org rules further
  |            e.g., Platform team can auto-approve infra actions,
  |            but production deploys still require approval.
  user       Narrowest scope -- individual user overrides
               e.g., Admin gets audit export, but within team boundaries.
```

**Key principle:** Lower scopes can only **restrict**, never **expand**. If the enterprise policy blocks external models for confidential data, no org/team/user policy can override that.

## Files

Apply in order from broadest to narrowest:

| File | Scope | Description |
|------|-------|-------------|
| `enterprise-baseline.yaml` | `enterprise` | Organization-wide security floor |
| `org-engineering.yaml` | `org` | Engineering org: code model access, auto-approve code reviews |
| `team-platform.yaml` | `team` | Platform team: infra auto-approvals, production approval gates |
| `user-admin.yaml` | `user` | Admin user: policy management, audit export access |

## Usage

```bash
# Apply in hierarchy order
kubectl apply -f enterprise-baseline.yaml
kubectl apply -f org-engineering.yaml
kubectl apply -f team-platform.yaml
kubectl apply -f user-admin.yaml
```

## Effective policy evaluation

When the policy engine evaluates a request, it merges policies from all applicable scopes. The most restrictive rule wins:

1. Enterprise baseline says: "external models allowed for public + internal data"
2. Org engineering says: "external models allowed for public + internal + code-related data"
3. But enterprise already set the ceiling -- code-related data classified as "internal" is allowed; "confidential" is not, regardless of org policy

The OPA sidecar evaluates all applicable policies and applies the most restrictive outcome.

## Example: model routing resolution

| Data Classification | Enterprise | Org (Engineering) | Effective |
|---------------------|------------|-------------------|-----------|
| Public              | External OK | External OK       | External OK |
| Internal            | External OK | External OK       | External OK |
| Confidential        | Internal only | (cannot override) | Internal only |
| Restricted          | Internal only | (cannot override) | Internal only |
