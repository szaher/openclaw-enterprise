# Skill: OCIP Protocol — Agent-to-Agent Information Exchange

## When to Use

Use OCIP when this assistant needs to communicate with another OpenClaw Enterprise assistant instance. OCIP handles all protocol concerns automatically via hooks on sessions_send — you do not call OCIP tools directly. Instead, OCIP metadata is injected and parsed transparently.

## How It Works

### Outgoing Messages

When the assistant sends a message to another agent via sessions_send:
1. OCIP metadata (version, classification, exchange round, capabilities) is injected automatically
2. Data is filtered by classification before transmission — confidential/restricted data is withheld if the receiver cannot accept it
3. The exchange round counter is incremented and checked against the maximum
4. If the round limit is exceeded, the exchange escalates to the human user

### Incoming Messages

When a message arrives from another agent:
1. OCIP metadata is parsed from the incoming message
2. Cross-org policy is checked — cross-enterprise exchanges are blocked unconditionally
3. Commitment detection runs — if the message requests a commitment (scheduling, agreements, resource allocation), it escalates to the human user for approval
4. The exchange is logged on the responder side for dual-sided audit

### Classification Enforcement

- Data classified above the exchange level is automatically withheld
- Data withheld is logged in the audit trail for transparency
- The sender filters BEFORE transmission, not the receiver

### Exchange Types

- **Information Query**: Agent-to-agent information exchange, no human approval required
- **Commitment Request**: Always escalates to human for approval
- **Meeting Scheduling**: Both humans must approve

### Loop Prevention

- Each message increments the exchange round counter
- When the round exceeds max_rounds (default: 3), the exchange escalates to humans
- Escalation includes a conversation summary for human context
- max_rounds cannot be extended within an exchange

## Limitations

- Cross-enterprise exchanges (different tenants) are blocked unconditionally
- Agents cannot auto-approve commitments — human approval is always required
- Messages without OCIP metadata are treated as human-generated (no enforcement)
- The round limit is fixed per exchange and cannot be extended
