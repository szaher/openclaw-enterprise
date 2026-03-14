# ADR-007: Implement OCIP via sessions_send Annotations

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

The OpenClaw Interchange Protocol (OCIP) defines how structured metadata is exchanged between OpenClaw instances and external systems. A transport mechanism is needed for OCIP messages. The options are to build a custom transport layer or to extend OpenClaw's existing messaging primitives.

## Decision

Implement OCIP as structured annotations on OpenClaw's existing `sessions_send` messages rather than a custom transport.

OCIP metadata is attached as structured annotations to standard `sessions_send` calls. When a receiving system understands OCIP, it reads the annotations and processes them. When the annotations are absent, the message is treated as a regular human message with no special handling.

## Rationale

- **Upstream-first principle**: This approach extends the existing `sessions_send` mechanism without forking or replacing it. It builds on top of what already works rather than introducing a parallel communication channel.
- **Graceful fallback**: When OCIP metadata is absent, messages are treated as normal human messages. This means OCIP-unaware systems work without modification, and the protocol degrades gracefully.
- **No custom transport to maintain**: Reusing `sessions_send` avoids the need to build, secure, and operate a separate transport layer for OCIP messages.

## Alternatives Considered

- **Custom transport layer**: Building a dedicated OCIP transport (e.g., gRPC service, message queue topic). This would provide a cleaner separation of concerns but introduces a new system to build, secure, monitor, and maintain. It also requires all participants to implement the custom protocol.
- **Forking sessions_send**: Modifying the core `sessions_send` implementation to natively support OCIP. This creates a fork that must be maintained against upstream changes.

## Consequences

- **Easier**: Adopting OCIP incrementally (systems can add annotation support at their own pace), maintaining compatibility with upstream OpenClaw, operating the system without additional transport infrastructure.
- **More difficult**: Expressing complex OCIP semantics within the constraints of the annotation format. Debugging OCIP-specific issues when they are interleaved with regular message traffic. Annotation payloads must be kept within size limits of the `sessions_send` message format.
