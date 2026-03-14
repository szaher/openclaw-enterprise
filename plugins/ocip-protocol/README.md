# @openclaw-enterprise/ocip-protocol

OCIP (OpenClaw Interchange Protocol) plugin for secure, policy-governed agent-to-agent information exchange between OpenClaw Enterprise instances.

## Overview

This plugin implements the OCIP protocol, enabling assistants to communicate with each other while enforcing enterprise security policies:

- **Envelope injection/parsing**: Automatically attaches OCIP metadata to outgoing messages and parses it from incoming messages
- **Classification filtering**: Filters data before transmission based on receiver capabilities and exchange classification ceiling
- **Loop prevention**: Tracks exchange rounds and escalates to humans when limits are reached
- **Commitment detection**: Identifies commitments (scheduling, agreements, resource allocation) and requires human approval
- **Cross-org enforcement**: Allows intra-enterprise cross-org exchanges per policy, blocks cross-enterprise unconditionally
- **Dual-sided audit logging**: Both initiator and responder log full exchange details

## Architecture

```
Outgoing sessions_send --> OcipHooks.handleOutgoing()
                            |
                            +-- OcipEnvelopeBuilder (inject metadata)
                            +-- ClassificationFilter (filter data)
                            +-- ExchangeRoundCounter (loop prevention)
                            +-- ExchangeLogger (audit log)

Incoming sessions_send --> OcipHooks.handleIncoming()
                            |
                            +-- OcipEnvelopeParser (parse metadata)
                            +-- CrossOrgPolicyChecker (org policy)
                            +-- CommitmentDetector (escalation)
                            +-- ExchangeLogger (audit log)
```

## Plugin Dependencies

- `policy-engine`: Policy evaluation for cross-org checks and exchange authorization
- `audit-enterprise`: Audit logging for all exchange events

## Exchange Types

| Type | Reply Policy | Commitment | Human Required |
|------|-------------|------------|----------------|
| information_query | agent-ok | No | No (if policy allows) |
| commitment_request | agent-ok | Yes | Yes (responder) |
| meeting_scheduling | human-only | Yes | Yes (both sides) |

## Development

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm typecheck    # Type-check without emitting
```

## File Structure

```
src/
  plugin.ts                        # Entry point, registers hooks
  openclaw-types.ts                # OpenClaw plugin API type definitions
  hooks.ts                         # sessions_send hook handlers
  envelope/
    builder.ts                     # OCIP envelope construction
    parser.ts                      # OCIP envelope parsing
    commitment.ts                  # Commitment detection
  classification/
    filter.ts                      # Sender-side classification filter
    cross-org.ts                   # Cross-org/cross-enterprise policy
  loop-prevention/
    counter.ts                     # Exchange round tracking
  exchange-log/
    logger.ts                      # Dual-sided audit logger
    gateway.ts                     # Gateway method interfaces
tests/
  ocip.test.ts                     # Unit tests
SKILL.md                           # Agent skill description
```
