# How To: Set Up OCIP Agent-to-Agent Exchanges

This guide walks through enabling and configuring the OpenClaw Interchange Protocol (OCIP) for secure, policy-governed communication between OpenClaw Enterprise agent instances.

## Overview

OCIP enables agent-to-agent exchanges where one user's assistant communicates with another user's assistant. Key guarantees:

- Agents always identify themselves (no pretending to be human)
- Classification is enforced at the sender side (data above clearance is filtered before transmission)
- Every exchange has a hard round limit (escalates to humans when reached)
- Commitments (scheduling, agreeing, approving) always require human approval
- Both sides of every exchange are logged in the audit trail

### Exchange Types

| Type | Description | Human Approval Required? |
|---|---|---|
| `information_query` | One agent asks another for information | No (agent can respond autonomously) |
| `commitment_request` | One agent requests a commitment from another user | Yes (always) |
| `meeting_scheduling` | One agent proposes a meeting to another | Yes (always) |

## Prerequisites

- OpenClaw Enterprise running with the ocip-protocol plugin enabled
- At least two users with configured agent instances
- Policy allowing agent-to-agent exchanges

## Step 1: Enable Agent Exchange in Policy

Agent-to-agent exchanges are disabled by default. Create a policy to enable them:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: PolicyBundle
metadata:
  name: ocip-exchange-policy
  namespace: openclaw
spec:
  policies:
    - scope: enterprise
      domain: agent-to-agent
      name: enable-agent-exchange
      content: |
        package openclaw.enterprise.agent_exchange

        import rego.v1

        default allow := false

        # Allow information queries between agents
        allow if {
          input.exchange_type == "information_query"
          same_tenant
        }

        # Allow meeting scheduling (requires human approval -- enforced structurally)
        allow if {
          input.exchange_type == "meeting_scheduling"
          same_tenant
        }

        # Allow commitment requests (requires human approval -- enforced structurally)
        allow if {
          input.exchange_type == "commitment_request"
          same_tenant
        }

        # Block all cross-tenant exchanges by default
        deny if {
          not same_tenant
        }

        same_tenant if {
          input.initiator_tenant_id == input.responder_tenant_id
        }

        reason := "Cross-tenant exchanges blocked" if { deny }
        reason := "Agent exchange allowed within tenant" if { allow }

        constraints := {
          "max_rounds": 3,
          "max_classification_shared": "internal",
        }
```

Apply the policy:

```bash
kubectl apply -f ocip-exchange-policy.yaml
```

## Step 2: Configure Agent Identity

Each user's agent instance has an identity configuration that controls what it can do in exchanges. Configure this in the OpenClawInstance:

```yaml
apiVersion: openclaw.enterprise.io/v1
kind: OpenClawInstance
metadata:
  name: production
  namespace: openclaw
spec:
  # ... other spec fields ...
  integrations:
    - type: ocip
      enabled: true
      config:
        defaultAgentIdentity: |
          {
            "canReceiveQueries": true,
            "canAutoRespond": true,
            "canMakeCommitments": false,
            "maxClassificationShared": "internal",
            "supportedExchangeTypes": ["information_query", "commitment_request", "meeting_scheduling"],
            "maxRoundsAccepted": 3
          }
```

### Agent Identity Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `canReceiveQueries` | boolean | `true` | Whether this agent accepts incoming information queries |
| `canAutoRespond` | boolean | `true` | Whether this agent can respond autonomously (for `information_query` only) |
| `canMakeCommitments` | boolean | `false` | Whether this agent can make commitments (always requires human approval regardless) |
| `maxClassificationShared` | string | `"internal"` | Maximum data classification level that can be shared in exchanges |
| `supportedExchangeTypes` | array | All three types | Which exchange types this agent supports |
| `maxRoundsAccepted` | number | `3` | Maximum conversation rounds before escalating to human |

> **Important:** Even if `canMakeCommitments` is set to `true`, the OCIP protocol structurally requires human approval for all commitments. This is a constitutional rule, not a configurable policy.

## Step 3: Set Max Rounds Policy

The round limit prevents infinite loops between agents. When the limit is reached, the exchange escalates to humans.

Configure the maximum rounds per exchange type:

```yaml
- scope: enterprise
  domain: agent-to-agent
  name: exchange-round-limits
  content: |
    package openclaw.enterprise.agent_exchange

    import rego.v1

    max_rounds := 3 if {
      input.exchange_type == "information_query"
    }

    max_rounds := 2 if {
      input.exchange_type == "meeting_scheduling"
    }

    max_rounds := 1 if {
      input.exchange_type == "commitment_request"
    }
```

The default maximum rounds is 3 (defined by `OCIP_DEFAULT_MAX_ROUNDS` in the shared constants). There is no mechanism to extend the limit during an active exchange.

## Step 4: Configure Cross-Organization Permissions

By default, cross-tenant exchanges are blocked. To enable exchanges between organizations within the same enterprise, create a more permissive policy:

```yaml
- scope: enterprise
  domain: agent-to-agent
  name: cross-org-exchange-policy
  content: |
    package openclaw.enterprise.agent_exchange

    import rego.v1

    default allow := false

    # Allow information queries within the enterprise (cross-org)
    allow if {
      input.exchange_type == "information_query"
      same_enterprise
      input.classification_level in ["public", "internal"]
    }

    # Block cross-org exchanges for confidential/restricted data
    deny if {
      input.classification_level in ["confidential", "restricted"]
      not same_org
    }

    # Always block cross-enterprise exchanges
    deny if {
      not same_enterprise
    }

    same_enterprise if {
      input.initiator_tenant_id == input.responder_tenant_id
    }

    same_org if {
      input.initiator_org_unit == input.responder_org_unit
    }

    reason := "Cross-enterprise exchanges are blocked" if {
      not same_enterprise
    }
    reason := "Confidential data cannot be shared cross-org" if {
      input.classification_level in ["confidential", "restricted"]
      not same_org
    }
    reason := "Exchange allowed" if { allow }
```

> **Warning:** Cross-enterprise exchanges (different tenants) are always blocked by the OCIP protocol. This is enforced structurally via `CrossEnterpriseBlockedError` and cannot be overridden by policy.

## Step 5: Test with a Sample Exchange

### Initiate an Information Query

Ask your agent to query information from another user's agent:

```
"Ask Alice's assistant what the status of the Q1 report is."
```

The OCIP protocol will:

1. Check if Alice's agent accepts incoming queries (`canReceiveQueries: true`)
2. Evaluate policy for the exchange (`policy.evaluate` with `agent-to-agent` domain)
3. Inject OCIP envelope metadata into the outgoing message
4. Filter any data above `maxClassificationShared` before sending
5. Record the exchange in the audit log (both sides)

### Verify via API

Check the exchange was created:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange&userId=user-123" \
  | jq '.entries[0]'
```

Expected audit entry:

```json
{
  "id": "audit-x1y2z3",
  "actionType": "agent_exchange",
  "actionDetail": {
    "exchangeId": "exc-abc123",
    "exchangeType": "information_query",
    "initiatorAgentId": "agent-user123",
    "responderAgentId": "agent-alice",
    "currentRound": 1,
    "maxRounds": 3,
    "classificationLevel": "internal"
  },
  "policyApplied": "enable-agent-exchange",
  "policyResult": "allow",
  "outcome": "success"
}
```

## Step 6: Review Exchange Logs

### List All Exchanges

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange" \
  | jq '.entries[] | {
    exchangeId: .actionDetail.exchangeId,
    type: .actionDetail.exchangeType,
    initiator: .actionDetail.initiatorAgentId,
    responder: .actionDetail.responderAgentId,
    round: .actionDetail.currentRound,
    outcome: .outcome,
    timestamp: .timestamp
  }'
```

### Find Escalated Exchanges

Exchanges that hit the round limit are escalated to humans:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange" \
  | jq '.entries[] | select(.actionDetail.escalated == true)'
```

### Find Denied Exchanges

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange&policyResult=deny" \
  | jq '.entries[] | {
    exchangeId: .actionDetail.exchangeId,
    reason: .policyReason,
    timestamp: .timestamp
  }'
```

### Review Data Shared and Withheld

Each exchange record includes what data was shared and what was withheld due to classification:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<your-openclaw-domain>/api/v1/audit?actionType=agent_exchange&requestId=req-abc" \
  | jq '.entries[0].actionDetail | {dataShared, dataWithheld}'
```

Example:

```json
{
  "dataShared": [
    { "source": "jira:ENG-100", "fields": ["status", "assignee", "summary"] }
  ],
  "dataWithheld": [
    { "reason": "classification_exceeded", "description": "Confidential field 'internal_notes' withheld" }
  ]
}
```

## OCIP Protocol Details

### Message Envelope

Every OCIP message carries metadata:

| Field | Description |
|---|---|
| `protocolVersion` | OCIP version (`1.0`) |
| `messageType` | `agent-generated`, `agent-assisted`, or `human` |
| `replyPolicy` | `agent-ok`, `human-only`, or `no-reply-needed` |
| `exchangeId` | Unique exchange identifier |
| `currentRound` | Current round number |
| `maxRounds` | Maximum allowed rounds |
| `classificationLevel` | Maximum classification in this message |
| `aiDisclosureLabel` | "Sent by user's OpenClaw assistant" |

### Safety Guarantees

| Guarantee | Enforcement |
|---|---|
| Agent identification | Structural (OCIP envelope is always injected) |
| Classification filtering | Sender-side (data above clearance is removed before transmission) |
| Round limits | Structural (`ExchangeRoundLimitError` on limit) |
| Commitment approval | Structural (`CommitmentRequiresHumanError` always) |
| Cross-enterprise blocking | Structural (`CrossEnterpriseBlockedError` always) |
| Dual audit logging | Both sides logged automatically |

## Troubleshooting

| Symptom | Possible Cause | Resolution |
|---|---|---|
| Exchange denied | No agent-to-agent policy | Create and apply a policy allowing exchanges |
| `CROSS_ENTERPRISE_BLOCKED` | Attempting cross-tenant exchange | Cross-enterprise exchanges are structurally blocked; cannot be overridden |
| `EXCHANGE_ROUND_LIMIT` | Hit max rounds | Exchange escalated to humans; increase `maxRoundsAccepted` if appropriate |
| `COMMITMENT_REQUIRES_HUMAN` | Agent tried to commit | Expected behavior; user must approve commitments |
| Data withheld in exchange | Classification exceeds `maxClassificationShared` | Increase `maxClassificationShared` in agent identity or policy |
| Responder agent rejects query | `canReceiveQueries: false` | Update the responder agent's identity configuration |
