# ADR-007: Implement OCIP via sessions_send Annotations

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/007-ocip-via-sessions-send.md` |

---

## Context

The OpenClaw Interchange Protocol (OCIP) defines how structured metadata is exchanged between OpenClaw instances and external systems. A transport mechanism is needed for OCIP messages. The options are to build a custom transport layer or to extend OpenClaw's existing messaging primitives.

Key considerations:

- The chosen transport must work with OpenClaw's existing infrastructure.
- Systems that do not understand OCIP should still receive messages normally.
- Building custom transport introduces ongoing maintenance burden.
- The constitution mandates an upstream-first approach.

---

## Decision

Implement OCIP as structured annotations on OpenClaw's existing `sessions_send` messages rather than a custom transport.

OCIP metadata is attached as an `OcipEnvelope` annotation to standard `sessions_send` calls. The envelope contains protocol version, sender identity, classification level, exchange round, capabilities, reply policy, and commitment flags.

When a receiving system understands OCIP, it reads the annotations and processes them according to OCIP semantics. When the annotations are absent, the message is treated as a regular human message with no special handling.

---

## Rationale

- **Upstream-first principle**: This approach extends the existing `sessions_send` mechanism without forking or replacing it. It builds on top of what already works rather than introducing a parallel communication channel.

- **Graceful fallback**: When OCIP metadata is absent, messages are treated as normal human messages. This means OCIP-unaware systems work without modification, and the protocol degrades gracefully.

- **No custom transport to maintain**: Reusing `sessions_send` avoids the need to build, secure, and operate a separate transport layer for OCIP messages.

---

## Alternatives Considered

### Custom transport layer

Building a dedicated OCIP transport (e.g., gRPC service, message queue topic). This would provide a cleaner separation of concerns but introduces a new system to build, secure, monitor, and maintain. It also requires all participants to implement the custom protocol.

### Forking sessions_send

Modifying the core `sessions_send` implementation to natively support OCIP. This creates a fork that must be maintained against upstream changes, violating the upstream-first principle.

---

## Consequences

### What becomes easier

- Adopting OCIP incrementally (systems can add annotation support at their own pace).
- Maintaining compatibility with upstream OpenClaw releases.
- Operating the system without additional transport infrastructure.
- Falling back to normal message delivery when OCIP is not understood.

### What becomes more difficult

- Expressing complex OCIP semantics within the constraints of the annotation format.
- Debugging OCIP-specific issues when they are interleaved with regular message traffic.
- Annotation payloads must be kept within size limits of the `sessions_send` message format.

---

## Implementation

- Envelope builder: `plugins/ocip-protocol/src/envelope/builder.ts`
- Envelope parser: `plugins/ocip-protocol/src/envelope/parser.ts`
- Protocol version: `1.0` (constant `OCIP_PROTOCOL_VERSION`)
- Default max rounds: `3` (constant `OCIP_DEFAULT_MAX_ROUNDS`)
- Full OCIP protocol reference: [OCIP Protocol](../ocip-protocol.md)
