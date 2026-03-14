# Contract: Policy Engine API

**Type**: Gateway RPC Methods + REST HTTP Routes
**Plugin**: policy-engine

## Gateway RPC Methods (via registerGatewayMethod)

### policy.evaluate

Evaluates an action against the policy hierarchy. Called by every plugin before executing a tool.

**Request**:
```json
{
  "method": "policy.evaluate",
  "params": {
    "tenant_id": "string",
    "user_id": "string",
    "action": "string (tool name or action type)",
    "context": {
      "data_classification": "public | internal | confidential | restricted",
      "channel": "string (optional)",
      "target_system": "string (optional)",
      "additional": "object (action-specific context)"
    }
  }
}
```

**Response**:
```json
{
  "decision": "allow | deny | require_approval",
  "policy_applied": "string (policy ID)",
  "reason": "string (human-readable explanation)",
  "constraints": {
    "max_classification": "string (optional)",
    "allowed_transitions": ["string (optional)"],
    "disclosure_required": "boolean (optional)"
  }
}
```

### policy.resolve

Resolves the effective policy for a given scope and domain (with hierarchy flattening).

**Request**:
```json
{
  "method": "policy.resolve",
  "params": {
    "tenant_id": "string",
    "user_id": "string",
    "domain": "models | actions | integrations | agent-to-agent | features | data | audit"
  }
}
```

**Response**:
```json
{
  "effective_policy": "object (flattened YAML-equivalent)",
  "hierarchy": [
    {"scope": "enterprise", "policy_id": "string"},
    {"scope": "org", "policy_id": "string"},
    {"scope": "team", "policy_id": "string"},
    {"scope": "user", "policy_id": "string | null"}
  ]
}
```

### policy.classify

Classifies data using per-connector defaults + AI reclassification.

**Request**:
```json
{
  "method": "policy.classify",
  "params": {
    "connector_type": "string",
    "content_summary": "string (extracted text for AI classification)",
    "source_id": "string"
  }
}
```

**Response**:
```json
{
  "classification": "public | internal | confidential | restricted",
  "assigned_by": "connector_default | ai_reclassification",
  "original_level": "string (if reclassified)",
  "confidence": "number (0-1, for AI reclassification)"
}
```

## REST HTTP Routes (via registerHttpRoute)

### POST /api/v1/policies

Create a new policy. Requires Enterprise Admin, Org Admin, or Team Lead role (scoped).

### GET /api/v1/policies?scope={scope}&domain={domain}

List policies filtered by scope and/or domain.

### GET /api/v1/policies/{id}

Get a specific policy by ID.

### PUT /api/v1/policies/{id}

Update a policy. Requires change_reason in request body. Validates hierarchy constraints.

### DELETE /api/v1/policies/{id}

Deprecate a policy (sets status to deprecated, does not delete).

All endpoints:
- Require SSO/OIDC authentication
- Include `X-Request-Id` header in response
- Produce audit log entries for all mutations
- Return versioned responses (Content-Type includes version)
