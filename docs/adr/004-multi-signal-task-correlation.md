# ADR-004: Multi-Signal Deduplication with Confidence Scoring for Task Correlation

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

When tasks arrive from multiple sources (tickets, PRs, chat messages), duplicates and related items must be identified and correlated. Naive approaches (e.g., exact title matching) miss many duplicates, while overly aggressive merging creates false positives that confuse users. A balanced approach is needed that surfaces likely duplicates without incorrectly merging unrelated tasks.

## Decision

Use multi-signal deduplication with confidence scoring for task correlation. The system evaluates multiple signals and produces a confidence score that determines the action:

- **>= 0.8**: Auto-merge the tasks as duplicates.
- **0.5 - 0.8**: Flag as "possibly related" for human review.
- **< 0.5**: Treat as separate tasks.

The signals used for correlation include:

- Title similarity (fuzzy text matching)
- Entity references (shared ticket IDs, PR numbers, issue links)
- Temporal proximity (tasks created close together in time)
- Participant overlap (same people involved across tasks)

## Rationale

This approach prevents false merges while surfacing likely duplicates for human review. The multi-signal strategy is more robust than any single signal because:

- Title similarity alone misses tasks described differently but referring to the same work.
- Entity references alone misses tasks that haven't been formally linked yet.
- Combining signals with weighted scoring produces a more accurate confidence measure.
- The three-tier threshold (auto-merge, review, separate) provides appropriate automation without sacrificing accuracy.

## Alternatives Considered

- **Exact matching only**: Simple but misses the majority of duplicates that use different wording or identifiers.
- **Aggressive auto-merge on any single signal**: Leads to false merges, requiring manual cleanup and eroding user trust.
- **Fully manual deduplication**: Accurate but does not scale and creates toil for operators.

## Consequences

- **Easier**: Reducing duplicate task noise, keeping task lists clean, surfacing relationships between work items from different sources.
- **More difficult**: Tuning confidence thresholds to balance false positives and false negatives. The system requires ongoing calibration as usage patterns evolve. Multiple signal sources must be maintained and kept in sync.
