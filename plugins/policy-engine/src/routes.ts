import type { Policy, PolicyDomain, PolicyScope } from '@openclaw-enterprise/shared/types.js';
import { API_BASE_PATH } from '@openclaw-enterprise/shared/constants.js';
import { PolicyHierarchyValidator } from './hierarchy/validator.js';

export interface PolicyStore {
  create(policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Policy>;
  findById(id: string): Promise<Policy | null>;
  findByFilter(filter: {
    scope?: PolicyScope;
    domain?: PolicyDomain;
    status?: string;
  }): Promise<Policy[]>;
  update(id: string, updates: Partial<Policy> & { changeReason: string }): Promise<Policy>;
  deprecate(id: string, changeReason: string): Promise<Policy>;
}

export interface AuditLogger {
  log(entry: Record<string, unknown>): Promise<void>;
}

export interface UserContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

/**
 * Policy CRUD REST route handlers.
 * All routes:
 * - Require SSO/OIDC authentication
 * - Include X-Request-Id header in response
 * - Produce audit log entries for all mutations
 * - Return versioned responses
 */
export class PolicyRoutes {
  private readonly validator: PolicyHierarchyValidator;

  constructor(
    private readonly store: PolicyStore,
    private readonly audit: AuditLogger,
  ) {
    this.validator = new PolicyHierarchyValidator();
  }

  /** POST /api/v1/policies */
  async createPolicy(
    body: {
      scope: PolicyScope;
      scopeId: string;
      domain: PolicyDomain;
      name: string;
      version: string;
      content: string;
      changeReason: string;
    },
    user: UserContext,
  ): Promise<{ status: number; body: unknown }> {
    // Validate hierarchy constraints
    const validation = await this.validator.validate(body.scope, body.scopeId, body.content, this.store);
    if (!validation.valid) {
      return {
        status: 400,
        body: { error: 'POLICY_HIERARCHY_VIOLATION', detail: validation.errors },
      };
    }

    const policy = await this.store.create({
      scope: body.scope,
      scopeId: body.scopeId,
      domain: body.domain,
      name: body.name,
      version: body.version,
      content: body.content,
      status: 'active',
      createdBy: user.userId,
      changeReason: body.changeReason,
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      actionType: 'policy_change',
      actionDetail: { operation: 'create', policyId: policy.id },
      dataClassification: 'internal',
      policyApplied: 'system',
      policyResult: 'allow',
      policyReason: 'Policy creation by authorized user',
      outcome: 'success',
    });

    return { status: 201, body: policy };
  }

  /** GET /api/v1/policies?scope={scope}&domain={domain} */
  async listPolicies(query: {
    scope?: PolicyScope;
    domain?: PolicyDomain;
  }): Promise<{ status: number; body: unknown }> {
    const policies = await this.store.findByFilter(query);
    return { status: 200, body: policies };
  }

  /** GET /api/v1/policies/:id */
  async getPolicy(id: string): Promise<{ status: number; body: unknown }> {
    const policy = await this.store.findById(id);
    if (!policy) {
      return { status: 404, body: { error: 'NOT_FOUND', detail: `Policy ${id} not found` } };
    }
    return { status: 200, body: policy };
  }

  /** PUT /api/v1/policies/:id */
  async updatePolicy(
    id: string,
    body: {
      content?: string;
      status?: string;
      changeReason: string;
    },
    user: UserContext,
  ): Promise<{ status: number; body: unknown }> {
    const existing = await this.store.findById(id);
    if (!existing) {
      return { status: 404, body: { error: 'NOT_FOUND', detail: `Policy ${id} not found` } };
    }

    if (body.content) {
      const validation = await this.validator.validate(
        existing.scope,
        existing.scopeId,
        body.content,
        this.store,
      );
      if (!validation.valid) {
        return {
          status: 400,
          body: { error: 'POLICY_HIERARCHY_VIOLATION', detail: validation.errors },
        };
      }
    }

    const updated = await this.store.update(id, {
      content: body.content,
      changeReason: body.changeReason,
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      actionType: 'policy_change',
      actionDetail: { operation: 'update', policyId: id, changeReason: body.changeReason },
      dataClassification: 'internal',
      policyApplied: 'system',
      policyResult: 'allow',
      policyReason: 'Policy update by authorized user',
      outcome: 'success',
    });

    return { status: 200, body: updated };
  }

  /** DELETE /api/v1/policies/:id (deprecate, not delete) */
  async deprecatePolicy(
    id: string,
    user: UserContext,
  ): Promise<{ status: number; body: unknown }> {
    const existing = await this.store.findById(id);
    if (!existing) {
      return { status: 404, body: { error: 'NOT_FOUND', detail: `Policy ${id} not found` } };
    }

    const deprecated = await this.store.deprecate(id, 'Deprecated via API');

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      actionType: 'policy_change',
      actionDetail: { operation: 'deprecate', policyId: id },
      dataClassification: 'internal',
      policyApplied: 'system',
      policyResult: 'allow',
      policyReason: 'Policy deprecation by authorized user',
      outcome: 'success',
    });

    return { status: 200, body: deprecated };
  }

  /** Returns route registrations for the plugin */
  getRouteRegistrations() {
    return [
      { method: 'POST' as const, path: `${API_BASE_PATH}/policies`, handler: this.createPolicy.bind(this) },
      { method: 'GET' as const, path: `${API_BASE_PATH}/policies`, handler: this.listPolicies.bind(this) },
      { method: 'GET' as const, path: `${API_BASE_PATH}/policies/:id`, handler: this.getPolicy.bind(this) },
      { method: 'PUT' as const, path: `${API_BASE_PATH}/policies/:id`, handler: this.updatePolicy.bind(this) },
      { method: 'DELETE' as const, path: `${API_BASE_PATH}/policies/:id`, handler: this.deprecatePolicy.bind(this) },
    ];
  }
}
