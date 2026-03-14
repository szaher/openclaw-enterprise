# ADR-006: Append-Only Audit Logging in Separate PostgreSQL Database

| Property | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2026-03-13 |
| **Decision Makers** | Project Team |
| **Source** | `docs/adr/006-append-only-audit.md` |

---

## Context

The system requires a tamper-evident audit log that records all significant actions for compliance and forensic purposes. The constitution mandates immutability of audit records. Decisions are needed on storage mechanism, data isolation, and retention management strategy.

Key requirements:

- Audit records must be immutable (no modification or deletion through normal operations).
- Audit data must be queryable with time-range filters.
- Retention must be manageable without affecting query performance.
- Audit data must be isolated from operational data.

---

## Decision

Use a PostgreSQL append-only table partitioned by month for audit logging, stored in a separate database from the operational data.

### Design Points

| Aspect | Decision |
|--------|----------|
| **Storage** | PostgreSQL `audit.audit_entries` table |
| **Immutability** | INSERT only; UPDATE and DELETE blocked by database triggers |
| **Partitioning** | Monthly partitions by `timestamp` column (`PARTITION BY RANGE`) |
| **Isolation** | Separate PostgreSQL database from operational data |
| **Retention** | 1-year minimum; old partitions archived or dropped |
| **GDPR** | Compliance via anonymization of user identifiers, not deletion |
| **ID Format** | ULID (time-ordered, sortable) |

### Partition Naming

Partitions follow the pattern `audit_entries_YYYY_MM` (e.g., `audit_entries_2026_03`). Twelve months of partitions are created ahead of time.

### Mutation Prevention

Two triggers enforce immutability:

```sql
-- Prevents UPDATE operations
CREATE TRIGGER audit_entries_no_update
  BEFORE UPDATE ON audit.audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_mutation();

-- Prevents DELETE operations
CREATE TRIGGER audit_entries_no_delete
  BEFORE DELETE ON audit.audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_mutation();
```

Both triggers call a function that raises an exception: "Audit entries are immutable. UPDATE and DELETE operations are not allowed."

---

## Rationale

- **Immutability requirement from constitution**: The append-only constraint directly satisfies the constitutional requirement that audit records cannot be modified or deleted through normal operations.

- **Monthly partitioning enables retention management and query performance**: Partitions can be archived or dropped as whole units when they age out of the retention window. Queries filtering by time range benefit from partition pruning.

- **Separate database prevents audit data from being affected by operational DB issues**: Operational database maintenance (migrations, restores, performance issues) cannot inadvertently affect audit records. The audit database can have its own backup schedule, replication, and access controls.

---

## Alternatives Considered

### Audit log in the same database

Simpler to operate but creates risk of audit data loss during operational DB restores. Also makes it harder to enforce separate access controls.

### Immutable object storage (e.g., S3 with Object Lock)

Provides strong immutability guarantees but makes querying difficult and introduces dependency on cloud-specific services.

### Dedicated audit service (e.g., Elasticsearch)

Good query capabilities but adds operational complexity and a new technology to the stack.

---

## Consequences

### What becomes easier

- Proving audit integrity for compliance audits.
- Managing retention by dropping monthly partitions.
- Querying audit data efficiently with time-range filters (partition pruning).
- Isolating audit access controls from operational database.
- Exporting audit data for compliance reporting.

### What becomes more difficult

- Operating a second PostgreSQL database.
- Ensuring audit writes succeed even when the operational database is under load.
- Managing cross-database consistency if audit records reference operational entities.

---

## Implementation

- Schema: `db/migrations/004_audit_entries.sql`
- Audit writer: `plugins/audit-enterprise/src/writer/writer.ts`
- Query handler: `plugins/audit-enterprise/src/query/query-method.ts`
- Export: `plugins/audit-enterprise/src/export/user-data.ts`
- Routes: `plugins/audit-enterprise/src/routes.ts`
- Constants: `AUDIT_MIN_RETENTION_YEARS = 1`, `AUDIT_QUERY_TIMEOUT_MS = 10000`, `AUDIT_DEFAULT_PAGE_SIZE = 100`, `AUDIT_MAX_PAGE_SIZE = 1000`
