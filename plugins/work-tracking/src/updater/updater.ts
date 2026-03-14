import type {
  ConnectorWriteResult,
  PolicyEvaluateRequest,
  PolicyEvaluateResponse,
} from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';

/**
 * Jira write function signatures expected by the updater.
 * These are called via the gateway or directly via tool invocation.
 */
export interface JiraWriteOperations {
  jiraComment(params: {
    issueKey: string;
    body: string;
    classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  }): Promise<ConnectorWriteResult>;

  jiraTransition(params: {
    issueKey: string;
    transitionId: string;
    transitionName: string;
    classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  }): Promise<ConnectorWriteResult>;
}

/**
 * PR merge details used to build the update comment.
 */
export interface PrMergeDetails {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string;
  repository: string;
  baseBranch: string;
  headBranch: string;
  mergedAt: string;
}

/**
 * Result of updating a single ticket.
 */
export interface TicketUpdateResult {
  ticketKey: string;
  commentResult: ConnectorWriteResult | null;
  transitionResult: ConnectorWriteResult | null;
  skipped: boolean;
  skipReason?: string;
}

/**
 * TicketUpdater handles updating Jira tickets when PRs are merged.
 *
 * It adds a summary comment with PR details and optionally transitions
 * the ticket status, subject to policy constraints.
 */
export class TicketUpdater {
  constructor(
    private readonly jiraOps: JiraWriteOperations,
    private readonly gateway: GatewayMethods,
    private readonly tenantId: string,
    private readonly userId: string,
  ) {}

  /**
   * Update a Jira ticket after a PR merge.
   * Adds a summary comment and transitions the ticket if allowed by policy.
   */
  async updateTicketForMerge(
    ticketKey: string,
    prDetails: PrMergeDetails,
    targetTransition?: { id: string; name: string },
  ): Promise<TicketUpdateResult> {
    const result: TicketUpdateResult = {
      ticketKey,
      commentResult: null,
      transitionResult: null,
      skipped: false,
    };

    // Add summary comment with PR link
    const commentBody = this.buildMergeComment(prDetails);
    result.commentResult = await this.jiraOps.jiraComment({
      issueKey: ticketKey,
      body: commentBody,
    });

    if (!result.commentResult.success) {
      return result;
    }

    // Transition if a target transition is specified
    if (targetTransition) {
      // Check policy for allowed transitions
      const policyResult = await this.checkTransitionPolicy(
        ticketKey,
        targetTransition.name,
      );

      if (policyResult.decision === 'deny') {
        result.transitionResult = null;
        result.skipped = false;
        // Comment was still added, transition denied by policy
        return result;
      }

      // Check if the transition is in the allowed list
      const allowedTransitions = policyResult.constraints.allowedTransitions ?? [];
      if (
        allowedTransitions.length > 0 &&
        !allowedTransitions.includes(targetTransition.name)
      ) {
        result.skipped = false;
        result.transitionResult = null;
        return result;
      }

      result.transitionResult = await this.jiraOps.jiraTransition({
        issueKey: ticketKey,
        transitionId: targetTransition.id,
        transitionName: targetTransition.name,
      });
    }

    return result;
  }

  /**
   * Update multiple Jira tickets for a single PR merge.
   */
  async updateTicketsForMerge(
    ticketKeys: string[],
    prDetails: PrMergeDetails,
    targetTransition?: { id: string; name: string },
  ): Promise<TicketUpdateResult[]> {
    const results: TicketUpdateResult[] = [];

    for (const ticketKey of ticketKeys) {
      const result = await this.updateTicketForMerge(
        ticketKey,
        prDetails,
        targetTransition,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Build a formatted comment summarizing the PR merge.
   */
  private buildMergeComment(prDetails: PrMergeDetails): string {
    const lines = [
      `PR #${prDetails.prNumber} merged: ${prDetails.prTitle}`,
      '',
      `Repository: ${prDetails.repository}`,
      `Author: ${prDetails.author}`,
      `Branch: ${prDetails.headBranch} -> ${prDetails.baseBranch}`,
      `Merged: ${prDetails.mergedAt}`,
      '',
      `Link: ${prDetails.prUrl}`,
    ];

    return lines.join('\n');
  }

  /**
   * Check policy constraints for a ticket transition.
   */
  private async checkTransitionPolicy(
    issueKey: string,
    transitionName: string,
  ): Promise<PolicyEvaluateResponse> {
    const request: PolicyEvaluateRequest = {
      tenantId: this.tenantId,
      userId: this.userId,
      action: 'jira_transition',
      context: {
        dataClassification: 'internal',
        targetSystem: 'jira',
        additional: {
          issueKey,
          transitionName,
          triggeredBy: 'work_tracking_auto_update',
        },
      },
    };

    return this.gateway['policy.evaluate'](request);
  }
}
