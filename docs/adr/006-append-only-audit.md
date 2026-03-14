# ADR-006: Append-Only Audit Logging in Separate PostgreSQL Database

**Status**: Accepted
**Date**: 2026-03-13
**Decision Makers**: Project Team

## Context

The system requires a tamper-evident audit log that records all significant actions for compliance and forensic purposes. The constitution mandates immutability of audit records. Decisions are needed on storage mechanism, data isolation, and retention management strategy.

## Decision

Use a PostgreSQL append-only table partitioned by month for audit logging, stored in a separate database from the operational data.

Key design points:

- **Append-only**: The audit table permits only INSERT operations. UPDATE and DELETE are prohibited at the database level.
- **Monthly partitioning**: The table is partitioned by month to enable efficient retention management (drop old partitions) and query performance (partition pruning on time-range queries).
- **Separate database**: Audit data lives in a dedicated PostgreSQL database, isolated from the operational database.

## Rationale

- **Immutability requirement from constitution**: The append-only constraint directly satisfies the constitutional requirement that audit records cannot be modified or deleted through normal operations.
- **Monthly partitioning enables retention management and query performance**: Partitions can be archived or dropped as whole units when they age out of the retention window. Queries filtering by time range benefit from partition pruning.
- **Separate database prevents audit data from being affected by operational DB issues**: Operational database maintenance (migrations, restores, performance issues) cannot inadvertently affect audit records. The audit database can have its own backup schedule, replication, and access controls.

## Alternatives Considered

- **Audit log in the same database**: Simpler to operate but creates risk of audit data loss during operational DB restores. Also makes it harder to enforce separate access controls.
- **Immutable object storage (e.g., S3 with Object Lock)**: Provides strong immutability guarantees but makes querying difficult and introduces dependency on cloud-specific services.
- **Dedicated audit service (e.g., Elasticsearch)**: Good query capabilities but adds operational complexity and a new technology to the stack.

## Consequences

- **Easier**: Proving audit integrity for compliance, managing retention by dropping monthly partitions, querying audit data efficiently with time-range filters, isolating audit access controls.
- **More difficult**: Operating a second PostgreSQL database, ensuring audit writes succeed even when the operational database is under load, managing cross-database consistency if audit records reference operational entities.
