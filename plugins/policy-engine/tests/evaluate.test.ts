import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEvaluator } from '../src/evaluator/evaluate.js';
import { OpaClient } from '../src/evaluator/opa-client.js';
import { PolicyEnforcementHook } from '../src/hooks.js';
import { PolicyDeniedError, PolicyApprovalRequiredError, PolicyEngineUnreachableError } from '@openclaw-enterprise/shared/errors.js';

describe('PolicyEvaluator', () => {
  let opaClient: OpaClient;
  let evaluator: PolicyEvaluator;

  beforeEach(() => {
    opaClient = new OpaClient('http://localhost:8181');
    evaluator = new PolicyEvaluator(opaClient);
  });

  it('returns allow when OPA allows', async () => {
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: true,
      require_approval: false,
      reason: 'Action allowed',
      constraints: {},
    });

    const result = await evaluator.evaluate({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'email_read',
      context: { dataClassification: 'internal' },
    });

    expect(result.decision).toBe('allow');
  });

  it('returns deny when OPA denies', async () => {
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: false,
      require_approval: false,
      reason: 'Action blocked by policy',
      constraints: {},
    });

    const result = await evaluator.evaluate({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'email_send',
      context: { dataClassification: 'confidential' },
    });

    expect(result.decision).toBe('deny');
  });

  it('returns require_approval when OPA requires approval', async () => {
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: false,
      require_approval: true,
      reason: 'Requires approval',
      constraints: {},
    });

    const result = await evaluator.evaluate({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'jira_transition',
      context: { dataClassification: 'internal' },
    });

    expect(result.decision).toBe('require_approval');
  });

  it('maps connector actions to correct OPA policy path', async () => {
    const spy = vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: true, require_approval: false, reason: 'ok', constraints: {},
    });

    await evaluator.evaluate({
      tenantId: 't1', userId: 'u1', action: 'email_read',
      context: { dataClassification: 'internal' },
    });

    expect(spy).toHaveBeenCalledWith(
      'openclaw/enterprise/integrations',
      expect.any(Object),
    );
  });
});

describe('PolicyEnforcementHook', () => {
  it('throws PolicyDeniedError on deny', async () => {
    const opaClient = new OpaClient();
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: false, require_approval: false,
      reason: 'Blocked', constraints: {},
    });
    const evaluator = new PolicyEvaluator(opaClient);
    const hook = new PolicyEnforcementHook(evaluator);

    await expect(
      hook.beforeToolExecute({
        toolName: 'email_send',
        tenantId: 't1', userId: 'u1',
        dataClassification: 'confidential',
        params: {},
      }),
    ).rejects.toThrow(PolicyDeniedError);
  });

  it('throws PolicyApprovalRequiredError on require_approval', async () => {
    const opaClient = new OpaClient();
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: false, require_approval: true,
      reason: 'Needs approval', constraints: {},
    });
    const evaluator = new PolicyEvaluator(opaClient);
    const hook = new PolicyEnforcementHook(evaluator);

    await expect(
      hook.beforeToolExecute({
        toolName: 'jira_transition',
        tenantId: 't1', userId: 'u1',
        dataClassification: 'internal',
        params: {},
      }),
    ).rejects.toThrow(PolicyApprovalRequiredError);
  });

  it('does not throw on allow', async () => {
    const opaClient = new OpaClient();
    vi.spyOn(opaClient, 'evaluate').mockResolvedValue({
      allow: true, require_approval: false,
      reason: 'OK', constraints: {},
    });
    const evaluator = new PolicyEvaluator(opaClient);
    const hook = new PolicyEnforcementHook(evaluator);

    await expect(
      hook.beforeToolExecute({
        toolName: 'email_read',
        tenantId: 't1', userId: 'u1',
        dataClassification: 'public',
        params: {},
      }),
    ).resolves.toBeUndefined();
  });
});

describe('OpaClient - fail closed', () => {
  it('throws PolicyEngineUnreachableError when OPA is unreachable', async () => {
    const client = new OpaClient('http://localhost:99999', 100);

    await expect(
      client.evaluate('openclaw/enterprise/actions', {
        tenant_id: 't1', user_id: 'u1', action: 'test',
        data_classification: 'internal',
      }),
    ).rejects.toThrow(PolicyEngineUnreachableError);
  });

  it('returns deny when no result from OPA', async () => {
    const client = new OpaClient();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no result field
    }) as unknown as typeof fetch;

    const result = await client.evaluate('openclaw/enterprise/actions', {
      tenant_id: 't1', user_id: 'u1', action: 'test',
      data_classification: 'internal',
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toContain('No matching policy');
  });
});
