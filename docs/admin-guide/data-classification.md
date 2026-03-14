# Data Classification Administration

OpenClaw Enterprise enforces a four-level data classification system. Classification travels with data at all times -- summaries, derivatives, cached results, and agent-to-agent exchanges all carry the classification of their source material. This is a constitutional requirement of the system.

---

## Classification Levels

| Level | Label | Description | Example Data |
|---|---|---|---|
| 1 | `public` | Information intended for public access. No restrictions on model routing or sharing. | Public GitHub issues, open-source documentation, published blog posts |
| 2 | `internal` | General business information. Default level for most connectors. | Internal emails, calendar events, Jira tickets, Google Drive documents |
| 3 | `confidential` | Sensitive business information requiring access controls and restricted model routing. | Financial reports, HR documents, customer PII, security configurations |
| 4 | `restricted` | Highest sensitivity. Strictest controls on access, model routing, and sharing. | Credentials, encryption keys, legal holds, M&A documents, medical records |

> **Key Rule:** Data classification can only be upgraded (moved to a higher level), never downgraded, through automated processes. Only an admin override with a logged reason can change classification in any direction.

---

## Three-Layer Assignment Pipeline

Data classification is assigned through a three-layer pipeline. Each layer can only upgrade (increase) the classification set by the previous layer, with one exception: admin overrides can set any level.

```
Layer 1: Connector Default
    │
    ▼
Layer 2: AI Reclassification (upgrade only)
    │
    ▼
Layer 3: Admin Override (any direction, reason required)
    │
    ▼
Final Classification
```

### Layer 1: Connector Defaults

Each connector assigns a default classification to all data it ingests:

| Connector | Default Classification | Rationale |
|---|---|---|
| Gmail | `internal` | Email content is business-internal by default |
| Google Calendar | `internal` | Calendar events contain meeting details and attendees |
| Jira | `internal` | Tickets contain project details and business logic |
| GitHub (public repos) | `public` | Public repository data is publicly accessible |
| GitHub (private repos) | `internal` | Private repository data is business-internal |
| Google Drive | `internal` | Documents are business-internal by default |

These defaults are configurable via the `data` policy domain. See [Policy Engine](policy-engine.md) for details.

### Layer 2: AI Reclassification

After connector ingestion, an AI classifier analyzes the content and may upgrade the classification. The AI classifier:

- **Can only upgrade** the classification (e.g., `internal` to `confidential`). It can never downgrade.
- Scans for patterns indicating higher sensitivity: PII (names, emails, SSNs, phone numbers), financial data, credentials, API keys, legal language, medical information.
- Logs every reclassification decision to the audit trail with the reason for upgrade.
- Can be disabled per-policy by setting `allow_ai_reclassification: false` in the `data` policy domain.

**Example reclassification:**

An email ingested by the Gmail connector is initially classified as `internal` (connector default). The AI classifier detects a Social Security number in the email body and upgrades the classification to `confidential`.

```
Gmail email → internal (connector default) → confidential (AI detected PII)
```

### Layer 3: Admin Override

Administrators can override the classification of any data item to any level. This is the only mechanism that can downgrade a classification.

**Requirements for admin override:**

- Caller must have `org_admin` or `enterprise_admin` role.
- A `reason` field is required and cannot be empty.
- The override, including the administrator identity, previous classification, new classification, and reason, is logged to the immutable audit trail.

```bash
curl -X PUT https://openclaw.example.com/api/v1/data/item_abc123/classification \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "classification": "public",
    "reason": "Document has been approved for public release by legal team (LEGAL-2026-0142)"
  }'
```

**Response:**

```json
{
  "item_id": "item_abc123",
  "previous_classification": "internal",
  "new_classification": "public",
  "override_by": "admin@example.com",
  "override_at": "2026-03-13T14:30:00Z",
  "reason": "Document has been approved for public release by legal team (LEGAL-2026-0142)"
}
```

---

## Classification Propagation

When data is processed, transformed, or summarized, the resulting output inherits the classification of its source material. This is enforced automatically and cannot be bypassed.

| Operation | Propagation Rule | Example |
|---|---|---|
| Summarization | Output inherits source classification | Summary of a `confidential` document is `confidential` |
| Multi-source aggregation | Output inherits the highest source classification | Summary of `internal` email + `confidential` doc = `confidential` summary |
| Cached/derived data | Inherits source classification | Cached search results retain original classification |
| Agent-to-agent exchange | Classification travels with the data envelope | OCIP message carries source classification |
| Copy/export | Retains original classification | Exported data retains its classification label |

> **Important:** There is no concept of "declassification by transformation." Summarizing a confidential document does not make the summary internal. The summary is confidential.

---

## Model Routing

Data classification directly controls which AI models can process the data. This is enforced by the policy engine at the point of model invocation.

| Classification | Default Model Routing | Override Available |
|---|---|---|
| `public` | Any allowed model (external or self-hosted) | N/A |
| `internal` | Any allowed model (external or self-hosted) | N/A |
| `confidential` | Self-hosted models only | Enterprise policy can explicitly allow specific external models |
| `restricted` | Self-hosted models only | Enterprise policy can explicitly allow specific external models |

### Default Behavior

By default, `confidential` and `restricted` data is only sent to self-hosted models. This prevents sensitive data from being transmitted to third-party model providers.

The models policy domain controls which models are approved for classified data:

```json
{
  "domain": "models",
  "rules": {
    "allowed_models": ["gpt-4", "claude-3-opus", "llama-3-70b"],
    "confidential_data_models": ["llama-3-70b"],
    "restricted_data_models": ["llama-3-70b"]
  }
}
```

In this example, only the self-hosted `llama-3-70b` model can process confidential or restricted data. Public and internal data can use any of the three allowed models.

### Overriding Model Routing

An `enterprise_admin` can explicitly allow external models for classified data by adding them to the `confidential_data_models` or `restricted_data_models` arrays. This should only be done when the external model provider has been vetted and contractual data protection agreements are in place.

```json
{
  "domain": "models",
  "rules": {
    "confidential_data_models": ["llama-3-70b", "claude-3-opus"],
    "restricted_data_models": ["llama-3-70b"]
  },
  "change_reason": "Allow Claude for confidential data per DPA signed 2026-03-01 (CONTRACT-2026-0089)"
}
```

---

## Agent-to-Agent Exchange Enforcement

When OpenClaw instances communicate via the OCIP protocol, data classification is enforced at the sender side:

1. The sender constructs an OCIP envelope containing data items with their classifications.
2. The policy engine checks the receiver's maximum allowed classification (configured in the `agent_to_agent` policy domain via `max_classification_outbound`).
3. Any data item with a classification above the receiver's clearance is **filtered out** of the envelope before sending.
4. The filtering action is logged to the audit trail.

**Example:**

```
Sender policy: max_classification_outbound = "internal"

OCIP envelope contains:
  - Item A: public     → INCLUDED
  - Item B: internal   → INCLUDED
  - Item C: confidential → FILTERED OUT
  - Item D: restricted   → FILTERED OUT
```

The receiver never sees Items C and D. The sender's audit log records that these items were filtered due to classification policy.

---

## Configuration via Policy

Data classification behavior is controlled through the `data` policy domain:

```json
{
  "domain": "data",
  "scope": { "level": "enterprise" },
  "status": "active",
  "rules": {
    "default_classification": "internal",
    "allow_ai_reclassification": true,
    "ai_reclassification_direction": "upgrade_only",
    "retention_days": 365,
    "ephemeral_data_ttl_hours": 24,
    "allow_data_export": true,
    "export_max_classification": "internal"
  },
  "change_reason": "Enterprise baseline data classification policy"
}
```

| Field | Description | Default |
|---|---|---|
| `default_classification` | Classification assigned when no connector default or AI classification applies | `internal` |
| `allow_ai_reclassification` | Whether the AI classifier is enabled | `true` |
| `ai_reclassification_direction` | Direction AI can reclassify (`upgrade_only` is the only supported value) | `upgrade_only` |
| `retention_days` | Minimum data retention period in days | `365` |
| `ephemeral_data_ttl_hours` | Time-to-live for ephemeral/cached data in hours | `24` |
| `allow_data_export` | Whether data export is permitted | `true` |
| `export_max_classification` | Maximum classification level that can be exported via the export API | `internal` |

---

## Troubleshooting

### Data Classified Higher Than Expected

1. Check the connector default for the data source (see table above).
2. Check the audit log for AI reclassification events on the data item.
3. The AI classifier may have detected sensitive patterns. Review the reclassification reason in the audit entry.
4. If the classification is incorrect, use an admin override to set the correct level (requires a reason).

### Confidential Data Sent to Wrong Model

1. Verify the `confidential_data_models` list in the active `models` policy.
2. Check for org-level or team-level policies that may have modified the model list (hierarchy merge uses intersection -- a lower-level policy cannot add models not in the parent).
3. Review the audit log for the model invocation to see which policy was applied.

### Agent Exchange Missing Data

If a receiving OpenClaw instance reports missing data from an OCIP exchange:

1. Check the sender's `max_classification_outbound` in the `agent_to_agent` policy.
2. Review the sender's audit log for classification filtering events.
3. The missing data items likely had a classification above the outbound maximum and were filtered.
