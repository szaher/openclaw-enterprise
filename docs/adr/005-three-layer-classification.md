# ADR-005: Three-Layer Data Classification

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

Data flowing through the system from various connectors must be classified by sensitivity level to enforce appropriate access controls and handling policies. A single classification mechanism is insufficient: purely static defaults miss context-sensitive content, purely AI-based classification is expensive and may produce false negatives, and purely manual classification does not scale.

## Decision

Use a three-layer data classification system:

1. **Per-connector defaults**: Each connector defines a baseline classification level for all data it ingests (e.g., Slack messages default to "internal", HR system data defaults to "confidential").
2. **AI reclassification**: An AI model reviews content and may upgrade the classification level if it detects sensitive content that exceeds the connector default. AI reclassification can only upgrade, never downgrade, a classification level.
3. **Admin override**: Human administrators can manually set the classification level for any data item, providing final authority over classification decisions.

## Rationale

The three-layer approach balances cost, accuracy, and control:

- **Connector defaults provide baseline without AI cost**: The majority of data can be correctly classified by its source alone, avoiding unnecessary AI inference costs.
- **AI reclassification catches sensitive content that exceeds defaults**: When someone shares a social security number in a Slack channel, the AI layer catches this and upgrades the classification even though Slack defaults to "internal."
- **Upgrade-only AI prevents unsafe downgrades**: The AI layer can only escalate classifications, ensuring it cannot accidentally reduce protections on sensitive data.
- **Admin override provides human authority**: When automated classification is wrong in either direction, a human administrator has final say.

## Alternatives Considered

- **Static classification only**: Simple and cheap but fails to catch sensitive content posted in low-default channels.
- **AI-only classification**: Accurate but expensive to run on all data, and introduces latency. Also creates a single point of failure for classification decisions.
- **Two-layer without admin override**: Lacks the escape hatch for when automated systems get it wrong, reducing operator trust.

## Consequences

- **Easier**: Achieving accurate classification at scale, controlling AI inference costs by only running AI on data that might need reclassification, providing operators with clear authority over classification decisions.
- **More difficult**: Implementing and maintaining three classification layers with clear precedence rules. Auditing why a particular classification was applied requires checking all three layers.
