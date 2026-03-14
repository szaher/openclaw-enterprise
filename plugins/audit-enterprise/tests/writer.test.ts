import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditWriter, AuditWriteError, generateSortableId } from '../src/writer/writer.js';
import type { DbPool, AuditWriteParams } from '../src/writer/writer.js';
import { createAuditLogHandler } from '../src/writer/log-method.js';
import { createAuditQueryHandler } from '../src/query/query-method.js';
import { createAuditRoutes } from '../src/routes.js';
import type { AuditEntry } from '@openclaw-enterprise/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWriteParams(overrides?: Partial<AuditWriteParams>): AuditWriteParams {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    actionType: 'tool_invocation',
    actionDetail: { tool: 'send_email' },
    dataAccessed: [{ source: 'gmail', classification: 'internal', purpose: 'read inbox' }],
    modelUsed: 'gpt-4',
    modelTokens: { input: 100, output: 50 },
    dataClassification: 'internal',
    policyApplied: 'default-policy',
    policyResult: 'allow',
    policyReason: 'Allowed by default policy',
    outcome: 'success',
    requestId: 'req-001',
    ...overrides,
  };
}

function createMockDb(rows: Array<Record<string, unknown>> = []): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

function makeSampleRow(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: '0190a1b2c3d4abcdef012345',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    timestamp: '2026-03-13T10:00:00.000Z',
    action_type: 'tool_invocation',
    action_detail: { tool: 'send_email' },
    data_accessed: [{ source: 'gmail', classification: 'internal', purpose: 'read inbox' }],
    model_used: 'gpt-4',
    model_tokens: { input: 100, output: 50 },
    data_classification: 'internal',
    policy_applied: 'default-policy',
    policy_result: 'allow',
    policy_reason: 'Allowed by default policy',
    outcome: 'success',
    request_id: 'req-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ULID / Sortable ID Generation
// ---------------------------------------------------------------------------

describe('generateSortableId', () => {
  it('produces a 26-character string', () => {
    const id = generateSortableId();
    expect(id).toHaveLength(26);
  });

  it('produces lexicographically sortable IDs over time', async () => {
    const id1 = generateSortableId();
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    const id2 = generateSortableId();
    expect(id1 < id2).toBe(true);
  });

  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSortableId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// AuditWriter — append-only enforcement
// ---------------------------------------------------------------------------

describe('AuditWriter', () => {
  it('exposes only an insert method (no update or delete)', () => {
    const db = createMockDb();
    const writer = new AuditWriter(db);

    expect(typeof writer.insert).toBe('function');
    expect('update' in writer).toBe(false);
    expect('delete' in writer).toBe(false);
    // Also verify via Object.getOwnPropertyNames on prototype
    const protoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(writer)).filter(
      (m) => m !== 'constructor',
    );
    expect(protoMethods).toEqual(['insert']);
  });

  it('inserts an audit entry and returns id + timestamp', async () => {
    const returnedRow = { id: 'abc123', timestamp: '2026-03-13T00:00:00Z' };
    const db = createMockDb([returnedRow]);
    const writer = new AuditWriter(db);

    const result = await writer.insert(makeWriteParams());

    expect(result.id).toBe('abc123');
    expect(result.timestamp).toBe('2026-03-13T00:00:00Z');
    expect(db.query).toHaveBeenCalledTimes(1);

    // Verify the SQL is an INSERT (not UPDATE or DELETE)
    const sql = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO audit.audit_entries');
    expect(sql).not.toContain('UPDATE');
    expect(sql).not.toContain('DELETE');
  });

  it('throws AuditWriteError on database failure', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    const writer = new AuditWriter(db);

    await expect(writer.insert(makeWriteParams())).rejects.toThrow(AuditWriteError);
  });

  it('throws AuditWriteError when insert returns no rows', async () => {
    const db = createMockDb([]); // empty rows
    const writer = new AuditWriter(db);

    await expect(writer.insert(makeWriteParams())).rejects.toThrow(AuditWriteError);
  });
});

// ---------------------------------------------------------------------------
// audit.log gateway method
// ---------------------------------------------------------------------------

describe('audit.log handler', () => {
  it('maps snake_case params and returns audit_entry_id + timestamp', async () => {
    const returnedRow = { id: 'entry-1', timestamp: '2026-03-13T12:00:00Z' };
    const db = createMockDb([returnedRow]);
    const writer = new AuditWriter(db);
    const handler = createAuditLogHandler(writer);

    const result = await handler({
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      action_type: 'data_access',
      action_detail: {},
      data_accessed: [{ source: 'gdrive', classification: 'confidential', purpose: 'read doc' }],
      model_used: null,
      model_tokens: null,
      data_classification: 'confidential',
      policy_applied: 'policy-abc',
      policy_result: 'allow',
      policy_reason: 'Allowed',
      outcome: 'success',
      request_id: 'req-002',
    });

    expect(result).toEqual({
      audit_entry_id: 'entry-1',
      timestamp: '2026-03-13T12:00:00Z',
    });
  });
});

// ---------------------------------------------------------------------------
// audit.query gateway method — filtering & pagination
// ---------------------------------------------------------------------------

describe('audit.query handler', () => {
  let db: DbPool & { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = {
      query: vi.fn(),
    };
  });

  it('filters by tenant_id (required)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // COUNT
      .mockResolvedValueOnce({ rows: [] }); // SELECT

    const handler = createAuditQueryHandler(db);
    const result = await handler({ tenant_id: 'tenant-1' });

    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.has_more).toBe(false);
  });

  it('filters by user_id and action_type', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // COUNT
      .mockResolvedValueOnce({ rows: [makeSampleRow()] }); // SELECT

    const handler = createAuditQueryHandler(db);
    const result = await handler({
      tenant_id: 'tenant-1',
      filters: { user_id: 'user-1', action_type: 'tool_invocation' },
    });

    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);

    // Verify filter params were passed
    const countCall = db.query.mock.calls[1]!;
    const countSql = countCall[0] as string;
    expect(countSql).toContain('user_id = $2');
    expect(countSql).toContain('action_type = $3');
  });

  it('filters by date range (from/to)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const handler = createAuditQueryHandler(db);
    await handler({
      tenant_id: 'tenant-1',
      filters: { from: '2026-03-01T00:00:00Z', to: '2026-03-13T23:59:59Z' },
    });

    const countSql = db.query.mock.calls[1]![0] as string;
    expect(countSql).toContain('timestamp >= $2');
    expect(countSql).toContain('timestamp <= $3');
  });

  it('enforces default page_size of 100', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const handler = createAuditQueryHandler(db);
    const result = await handler({ tenant_id: 'tenant-1' });

    expect(result.page_size).toBe(100);
  });

  it('caps page_size at 1000', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const handler = createAuditQueryHandler(db);
    const result = await handler({ tenant_id: 'tenant-1', page_size: 5000 });

    expect(result.page_size).toBe(1000);
  });

  it('computes has_more correctly', async () => {
    const rows = Array.from({ length: 2 }, (_, i) =>
      makeSampleRow({ id: `id-${i}` }),
    );

    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })
      .mockResolvedValueOnce({ rows });

    const handler = createAuditQueryHandler(db);
    const result = await handler({ tenant_id: 'tenant-1', page_size: 2, page: 1 });

    expect(result.has_more).toBe(true);
    expect(result.total).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// REST routes — export format
// ---------------------------------------------------------------------------

describe('REST routes', () => {
  function createMockResponse() {
    const res: Record<string, unknown> = {};
    res['statusCode'] = 200;
    res['status'] = vi.fn((code: number) => {
      res['statusCode'] = code;
      return res;
    });
    res['json'] = vi.fn();
    res['setHeader'] = vi.fn();
    res['end'] = vi.fn();
    return res;
  }

  const sampleEntry: AuditEntry = {
    id: 'entry-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    timestamp: '2026-03-13T10:00:00.000Z',
    actionType: 'tool_invocation',
    actionDetail: { tool: 'send_email' },
    dataAccessed: [{ source: 'gmail', classification: 'internal', purpose: 'read' }],
    modelUsed: 'gpt-4',
    modelTokens: { input: 100, output: 50 },
    dataClassification: 'internal',
    policyApplied: 'default-policy',
    policyResult: 'allow',
    policyReason: 'Allowed',
    outcome: 'success',
    requestId: 'req-001',
  };

  it('export route returns CSV with correct headers', async () => {
    const queryHandler = vi.fn().mockResolvedValue({
      entries: [sampleEntry],
      total: 1,
      page: 1,
      page_size: 1000,
      has_more: false,
    });
    const db = createMockDb();
    const routes = createAuditRoutes(queryHandler, db);

    // Export route is first
    const exportRoute = routes.find((r) => r.path.endsWith('/export'));
    expect(exportRoute).toBeDefined();

    const req = {
      params: {},
      query: { format: 'csv' },
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', roles: ['enterprise_admin'], orgUnit: 'eng', effectivePermissions: { canManagePolicies: true, policyScope: 'enterprise', canQueryAudit: true, auditScope: 'enterprise' } },
    };
    const res = createMockResponse();

    await exportRoute!.handler(req, res);

    const csvBody = (res['end'] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const lines = csvBody.split('\n');
    expect(lines[0]).toBe('id,tenant_id,user_id,timestamp,action_type,data_classification,policy_applied,policy_result,outcome,request_id');
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  it('export route returns JSON structure', async () => {
    const queryHandler = vi.fn().mockResolvedValue({
      entries: [sampleEntry],
      total: 1,
      page: 1,
      page_size: 1000,
      has_more: false,
    });
    const db = createMockDb();
    const routes = createAuditRoutes(queryHandler, db);
    const exportRoute = routes.find((r) => r.path.endsWith('/export'));

    const req = {
      params: {},
      query: { format: 'json' },
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', roles: ['enterprise_admin'], orgUnit: 'eng', effectivePermissions: { canManagePolicies: true, policyScope: 'enterprise', canQueryAudit: true, auditScope: 'enterprise' } },
    };
    const res = createMockResponse();

    await exportRoute!.handler(req, res);

    const jsonCall = (res['json'] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { entries: unknown[]; total: number };
    expect(jsonCall.entries).toHaveLength(1);
    expect(jsonCall.total).toBe(1);
  });

  it('returns 401 when no user context', async () => {
    const queryHandler = vi.fn();
    const db = createMockDb();
    const routes = createAuditRoutes(queryHandler, db);
    const listRoute = routes.find((r) => r.path === '/api/v1/audit');

    const req = { params: {}, query: {} }; // no user
    const res = createMockResponse();

    await listRoute!.handler(req, res);

    expect(res['status']).toHaveBeenCalledWith(401);
  });
});
