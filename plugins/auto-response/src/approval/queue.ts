import type { MessageClassification } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

/**
 * A pending auto-response awaiting user approval.
 */
export interface PendingResponse {
  id: string;
  messageId: string;
  channel: string;
  sender: string;
  subject: string;
  originalBody: string;
  responseBody: string;
  classification: MessageClassification;
  policyApplied: string;
  tenantId: string;
  userId: string;
  createdAt: string;
}

/**
 * Result of an approval or rejection action.
 */
export interface ApprovalActionResult {
  id: string;
  action: 'approved' | 'rejected';
  responseBody: string;
}

/**
 * ApprovalQueue stores pending auto-responses for the "approve" autonomy level.
 *
 * In production, this would be backed by PostgreSQL. This implementation uses
 * an in-memory store suitable for single-instance deployments and testing.
 *
 * Exposed via gateway methods for user review through OpenClaw's UI or API.
 */
export class ApprovalQueue {
  private readonly pending: Map<string, PendingResponse> = new Map();
  private nextId = 1;

  constructor(private readonly gateway: GatewayMethods) {}

  /**
   * Add a response to the approval queue.
   * Returns the queue entry ID.
   */
  async enqueue(entry: Omit<PendingResponse, 'id' | 'createdAt'>): Promise<string> {
    const id = `approval-${this.nextId++}`;
    const pendingEntry: PendingResponse = {
      ...entry,
      id,
      createdAt: new Date().toISOString(),
    };

    this.pending.set(id, pendingEntry);

    // Log to audit
    await this.gateway['audit.log']({
      tenantId: entry.tenantId,
      userId: entry.userId,
      actionType: 'tool_invocation',
      actionDetail: {
        tool: 'auto-response.enqueue',
        messageId: entry.messageId,
        channel: entry.channel,
        classification: entry.classification,
        queueEntryId: id,
      },
      dataClassification: 'internal',
      policyApplied: entry.policyApplied,
      policyResult: 'require_approval',
      policyReason: 'Response requires user approval before sending',
      outcome: 'pending_approval',
    });

    return id;
  }

  /**
   * Approve a pending response.
   * Removes it from the queue and returns the approved response body for sending.
   */
  async approve(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalActionResult> {
    const entry = this.pending.get(id);
    if (!entry) {
      throw new Error(`Pending response "${id}" not found`);
    }

    this.pending.delete(id);

    // Log approval to audit
    await this.gateway['audit.log']({
      tenantId,
      userId,
      actionType: 'policy_decision',
      actionDetail: {
        tool: 'auto-response.approve',
        queueEntryId: id,
        messageId: entry.messageId,
        channel: entry.channel,
      },
      dataClassification: 'internal',
      policyApplied: entry.policyApplied,
      policyResult: 'allow',
      policyReason: 'User approved auto-response',
      outcome: 'success',
    });

    return {
      id,
      action: 'approved',
      responseBody: entry.responseBody,
    };
  }

  /**
   * Reject a pending response.
   * Removes it from the queue without sending.
   */
  async reject(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<ApprovalActionResult> {
    const entry = this.pending.get(id);
    if (!entry) {
      throw new Error(`Pending response "${id}" not found`);
    }

    this.pending.delete(id);

    // Log rejection to audit
    await this.gateway['audit.log']({
      tenantId,
      userId,
      actionType: 'policy_decision',
      actionDetail: {
        tool: 'auto-response.reject',
        queueEntryId: id,
        messageId: entry.messageId,
        channel: entry.channel,
      },
      dataClassification: 'internal',
      policyApplied: entry.policyApplied,
      policyResult: 'deny',
      policyReason: 'User rejected auto-response',
      outcome: 'denied',
    });

    return {
      id,
      action: 'rejected',
      responseBody: entry.responseBody,
    };
  }

  /**
   * List all pending responses for a given user.
   */
  listPending(userId: string): PendingResponse[] {
    const results: PendingResponse[] = [];
    for (const entry of this.pending.values()) {
      if (entry.userId === userId) {
        results.push(entry);
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get a single pending response by ID.
   */
  get(id: string): PendingResponse | undefined {
    return this.pending.get(id);
  }

  /**
   * Get count of pending responses for a user.
   */
  pendingCount(userId: string): number {
    let count = 0;
    for (const entry of this.pending.values()) {
      if (entry.userId === userId) {
        count++;
      }
    }
    return count;
  }
}
