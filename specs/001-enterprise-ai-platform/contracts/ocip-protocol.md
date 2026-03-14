# Contract: OpenClaw Interchange Protocol (OCIP)

**Type**: Agent-to-Agent Protocol
**Plugin**: ocip-protocol

## Message Envelope

Every assistant-generated message carries OCIP metadata as structured annotations on the OpenClaw `sessions_send` message.

```yaml
ocip:
  version: "1.0"
  message_type: agent-generated | agent-assisted | human
  source_agent:
    instance_id: string
    user_id: string
    org_unit: string
    tenant_id: string
  classification: public | internal | confidential | restricted
  conversation_id: string
  exchange_round: integer
  max_rounds: integer
  capabilities:
    can_commit: boolean       # Always false unless human approved
    can_share:                # Classification levels this agent can share
      - public
      - internal
  reply_policy: agent-ok | human-only | no-reply-needed
  requires_commitment: boolean
  expires_at: string          # ISO 8601 datetime
```

## Exchange Types

### Information Query

Agent-to-agent information exchange. No human approval required (if policy allows).

- `reply_policy`: agent-ok
- `requires_commitment`: false
- `max_rounds`: defined by policy (default: 3)

### Commitment Request

Requires human approval from the responder. Agent escalates rather than auto-responding.

- `reply_policy`: agent-ok (for the auto-generated escalation notice)
- `requires_commitment`: true
- Policy enforcement: responder agent MUST escalate to human

### Meeting Scheduling

Special case of commitment request. Both humans MUST approve.

- `reply_policy`: human-only
- `requires_commitment`: true

## Cross-Org Rules

- Exchanges within the same tenant across different org units: ALLOWED, governed by org-level policies
- Org-level policies define: what data can be shared, with which org units, at what classification level
- Exchanges across different tenants (cross-enterprise): BLOCKED unconditionally

## Loop Prevention

1. `exchange_round` incremented on every message in a conversation
2. When `exchange_round` > `max_rounds`: exchange MUST escalate to humans
3. No mechanism to extend `max_rounds` within an exchange
4. Escalation message includes conversation summary for human context

## Classification Enforcement

1. Sender filters data BEFORE transmission based on receiver's `can_share` levels
2. Sender MUST NOT include data classified above the exchange's `classification` level
3. `data_withheld` array logged in the Exchange audit record for transparency

## Audit Contract

Both sides of every exchange produce an audit entry with:
- Full transcript
- Data shared (source, fields)
- Data withheld (reason, description)
- Policy applied
- Outcome (resolved / escalated / denied)
