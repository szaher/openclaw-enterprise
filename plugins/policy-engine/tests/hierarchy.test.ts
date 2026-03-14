import { describe, it, expect } from 'vitest';
import { PolicyHierarchyResolver, mergeRestrictive, parsePolicyContent } from '../src/hierarchy/resolver.js';
import { PolicyHierarchyValidator } from '../src/hierarchy/validator.js';
import type { Policy, PolicyDomain, PolicyScope } from '@openclaw-enterprise/shared/types.js';

describe('PolicyHierarchyResolver', () => {
  describe('parsePolicyContent', () => {
    it('parses simple key-value pairs', () => {
      const result = parsePolicyContent('enabled: true\nmax_rounds: 3\nname: test');
      expect(result).toEqual({ enabled: true, max_rounds: 3, name: 'test' });
    });

    it('parses arrays', () => {
      const content = 'allowed_types:\n  - information_query\n  - meeting_scheduling';
      const result = parsePolicyContent(content);
      expect(result.allowed_types).toEqual(['information_query', 'meeting_scheduling']);
    });

    it('ignores comments and blank lines', () => {
      const result = parsePolicyContent('# comment\n\nkey: value');
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('mergeRestrictive', () => {
    it('restricts arrays to intersection', () => {
      const parent = { allowed: ['a', 'b', 'c'] };
      const child = { allowed: ['b', 'c', 'd'] };
      const result = mergeRestrictive(parent, child);
      expect(result.allowed).toEqual(['b', 'c']);
    });

    it('restricts booleans via AND (child cannot enable what parent disables)', () => {
      expect(mergeRestrictive({ flag: false }, { flag: true })).toEqual({ flag: false });
      expect(mergeRestrictive({ flag: true }, { flag: false })).toEqual({ flag: false });
      expect(mergeRestrictive({ flag: true }, { flag: true })).toEqual({ flag: true });
    });

    it('restricts numbers to minimum', () => {
      expect(mergeRestrictive({ limit: 10 }, { limit: 5 })).toEqual({ limit: 5 });
      expect(mergeRestrictive({ limit: 3 }, { limit: 7 })).toEqual({ limit: 3 });
    });

    it('preserves parent values not in child', () => {
      const result = mergeRestrictive({ a: 1, b: 2 }, { b: 1 });
      expect(result).toEqual({ a: 1, b: 1 });
    });

    it('allows child to add new restrictions', () => {
      const result = mergeRestrictive({ a: 1 }, { b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe('PolicyHierarchyResolver.resolve', () => {
    it('uses enterprise policy as base', async () => {
      const resolver = new PolicyHierarchyResolver();
      const mockFetch = async (scope: PolicyScope, _scopeId: string, _domain: PolicyDomain) => {
        if (scope === 'enterprise') {
          return {
            id: 'ent-1', scope: 'enterprise' as PolicyScope, scopeId: 'default',
            domain: 'actions' as PolicyDomain, name: 'test', version: '1.0',
            content: 'enabled: true\nmax_actions: 10', status: 'active' as const,
            createdBy: 'admin', createdAt: '', updatedAt: '', changeReason: 'init',
          };
        }
        return null;
      };

      const result = await resolver.resolve('actions', { enterprise: 'default' }, mockFetch);
      expect(result.effectivePolicy).toEqual({ enabled: true, max_actions: 10 });
      expect(result.hierarchy[0]).toEqual({ scope: 'enterprise', policyId: 'ent-1' });
    });

    it('restricts at lower levels', async () => {
      const resolver = new PolicyHierarchyResolver();
      const mockFetch = async (scope: PolicyScope) => {
        const policies: Record<string, Policy> = {
          enterprise: {
            id: 'ent-1', scope: 'enterprise', scopeId: 'default',
            domain: 'actions', name: 'test', version: '1.0',
            content: 'enabled: true\nmax_actions: 10', status: 'active',
            createdBy: 'admin', createdAt: '', updatedAt: '', changeReason: 'init',
          },
          org: {
            id: 'org-1', scope: 'org', scopeId: 'eng',
            domain: 'actions', name: 'test', version: '1.0',
            content: 'max_actions: 5', status: 'active',
            createdBy: 'admin', createdAt: '', updatedAt: '', changeReason: 'init',
          },
        };
        return (policies[scope] as Policy) ?? null;
      };

      const result = await resolver.resolve(
        'actions',
        { enterprise: 'default', org: 'eng' },
        mockFetch,
      );
      expect(result.effectivePolicy.max_actions).toBe(5);
      expect(result.effectivePolicy.enabled).toBe(true);
    });
  });
});

describe('PolicyHierarchyValidator', () => {
  const validator = new PolicyHierarchyValidator();

  it('allows enterprise policies without validation', async () => {
    const result = await validator.validate('enterprise', 'default', 'anything: true', {
      findByFilter: async () => [],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects org policy that enables what enterprise disables', async () => {
    const result = await validator.validate('org', 'eng', 'auto_send: true', {
      findByFilter: async () => [
        { scope: 'enterprise' as PolicyScope, scopeId: 'default', content: 'auto_send: false' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('cannot enable');
  });

  it('rejects org policy that exceeds numeric limit', async () => {
    const result = await validator.validate('org', 'eng', 'max_rounds: 10', {
      findByFilter: async () => [
        { scope: 'enterprise' as PolicyScope, scopeId: 'default', content: 'max_rounds: 3' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds');
  });

  it('rejects org policy with array values outside parent set', async () => {
    const result = await validator.validate(
      'org', 'eng',
      'allowed_types:\n  - information_query\n  - commitment_request',
      {
        findByFilter: async () => [
          {
            scope: 'enterprise' as PolicyScope,
            scopeId: 'default',
            content: 'allowed_types:\n  - information_query',
          },
        ],
      },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expand beyond');
  });

  it('allows org policy that is more restrictive', async () => {
    const result = await validator.validate('org', 'eng', 'max_rounds: 2', {
      findByFilter: async () => [
        { scope: 'enterprise' as PolicyScope, scopeId: 'default', content: 'max_rounds: 3' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
