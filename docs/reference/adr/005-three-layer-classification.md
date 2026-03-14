# ADR-005: Three-Layer Data Classification

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/005-three-layer-classification.md` |

---

## Context

Data flowing through the system from various connectors must be classified by sensitivity level to enforce appropriate access controls and handling policies. A single classification mechanism is insufficient: purely static defaults miss context-sensitive content, purely AI-based classification is expensive and may produce false negatives, and purely manual classification does not scale.

---

## Decision

Use a three-layer data classification system:

### Layer 1: Connector Defaults

Each connector defines a baseline classification level for all data it ingests.

| Connector | Default Classification |
|-----------|----------------------|
| `gmail` | `internal` |
| `gcal` | `internal` |
| `jira` | `internal` |
| `github` | `public` |
| `gdrive` | `internal` |

### Layer 2: AI Reclassification (Upgrade Only)

An AI model reviews content and may **upgrade** the classification level if it detects sensitive content that exceeds the connector default. AI reclassification can only upgrade, never downgrade, a classification level.

Example: A social security number shared in a Slack channel (default: `internal`) would be upgraded to `confidential` or `restricted` by the AI layer.

### Layer 3: Admin Override

Human administrators can manually set the classification level for any data item, providing final authority over classification decisions. Admin overrides can both upgrade and downgrade classification levels.

---

## Classification Levels

| Level | Order | Description |
|-------|-------|-------------|
| `public` | 0 | Publicly available information |
| `internal` | 1 | Internal company information |
| `confidential` | 2 | Sensitive business information |
| `restricted` | 3 | Highly sensitive, strictly controlled access |

### Data Classification Record

Every classification assignment is tracked:

| Field | Description |
|-------|-------------|
| `dataRef` | Reference to the classified data item |
| `level` | Current classification level |
| `assignedBy` | `connector_default`, `ai_reclassification`, or `admin_override` |
| `originalLevel` | Level before reclassification/override |
| `overrideBy` | Admin user ID (if admin override) |
| `overrideReason` | Reason for admin override |
| `assessedAt` | Timestamp of last assessment |

---

## Rationale

The three-layer approach balances cost, accuracy, and control:

- **Connector defaults provide baseline without AI cost**: The majority of data can be correctly classified by its source alone, avoiding unnecessary AI inference costs.

- **AI reclassification catches sensitive content that exceeds defaults**: When sensitive data appears in a low-default channel, the AI layer catches it and upgrades the classification.

- **Upgrade-only AI prevents unsafe downgrades**: The AI layer can only escalate classifications, ensuring it cannot accidentally reduce protections on sensitive data.

- **Admin override provides human authority**: When automated classification is wrong in either direction, a human administrator has final say.

---

## Alternatives Considered

### Static classification only

Simple and cheap but fails to catch sensitive content posted in low-default channels.

### AI-only classification

Accurate but expensive to run on all data, and introduces latency. Also creates a single point of failure for classification decisions.

### Two-layer without admin override

Lacks the escape hatch for when automated systems get it wrong, reducing operator trust.

---

## Consequences

### What becomes easier

- Achieving accurate classification at scale.
- Controlling AI inference costs by only running AI on data that might need reclassification.
- Providing operators with clear authority over classification decisions.
- Auditing classification history (all transitions are recorded).

### What becomes more difficult

- Implementing and maintaining three classification layers with clear precedence rules.
- Auditing why a particular classification was applied requires checking all three layers.
- The `assignedBy` field must be preserved through all data transformations.

---

## Implementation

- Classification logic: `plugins/policy-engine/src/classification/classify.ts`
- Default mappings: `plugins/shared/src/constants.ts` (`CONNECTOR_DEFAULT_CLASSIFICATION`)
- Data model: `db/migrations/007_data_classifications.sql`
- Shared types: `plugins/shared/src/types.ts` (`DataClassification`, `ClassificationAssigner`)
