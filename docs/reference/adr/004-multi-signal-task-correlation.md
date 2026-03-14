# ADR-004: Multi-Signal Task Correlation with Confidence Scoring

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/004-multi-signal-task-correlation.md` |

---

## Context

When tasks arrive from multiple sources (Jira tickets, GitHub PRs, email threads, calendar events, Google Drive documents), duplicates and related items must be identified and correlated. Naive approaches (e.g., exact title matching) miss many duplicates, while overly aggressive merging creates false positives that confuse users. A balanced approach is needed that surfaces likely duplicates without incorrectly merging unrelated tasks.

---

## Decision

Use multi-signal deduplication with confidence scoring for task correlation. The system evaluates multiple signals and produces a weighted confidence score that determines the action taken.

### Correlation Signals

| Signal | Description | Weight |
|--------|-------------|--------|
| Title similarity | Fuzzy text matching (Jaccard similarity) between task titles | Variable |
| Entity references | Shared ticket IDs, PR numbers, issue links across systems | High |
| Temporal proximity | Tasks created close together in time | Low-medium |
| Participant overlap | Same people involved across tasks from different systems | Medium |
| Cross-system ID | Explicit cross-references (e.g., Jira ticket mentioned in PR description) | High |

### Confidence Thresholds

| Score Range | Action |
|-------------|--------|
| >= 0.8 | Auto-merge the tasks as duplicates |
| 0.5 -- 0.8 | Flag as "possibly related" for human review |
| < 0.5 | Treat as separate tasks |

---

## Rationale

This approach prevents false merges while surfacing likely duplicates for human review. The multi-signal strategy is more robust than any single signal because:

- Title similarity alone misses tasks described differently but referring to the same work.
- Entity references alone misses tasks that have not been formally linked yet.
- Combining signals with weighted scoring produces a more accurate confidence measure.
- The three-tier threshold (auto-merge, review, separate) provides appropriate automation without sacrificing accuracy.

---

## Alternatives Considered

### Exact matching only

Simple but misses the majority of duplicates that use different wording or identifiers.

### Aggressive auto-merge on any single signal

Leads to false merges, requiring manual cleanup and eroding user trust.

### Fully manual deduplication

Accurate but does not scale and creates toil for operators.

---

## Consequences

### What becomes easier

- Reducing duplicate task noise for users.
- Keeping task lists clean across multiple source systems.
- Surfacing relationships between work items from different sources.
- Prioritizing tasks accurately by consolidating signals.

### What becomes more difficult

- Tuning confidence thresholds to balance false positives and false negatives.
- The system requires ongoing calibration as usage patterns evolve.
- Multiple signal sources must be maintained and kept in sync.

---

## Implementation

- Correlator: `plugins/task-intelligence/src/correlation/correlator.ts`
- Scorer: `plugins/task-intelligence/src/scoring/scorer.ts`
- Thresholds: defined in `plugins/shared/src/constants.ts`
  - `CORRELATION_AUTO_MERGE_THRESHOLD = 0.8`
  - `CORRELATION_POSSIBLY_RELATED_THRESHOLD = 0.5`
