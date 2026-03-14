import type { MessageClassification } from '@openclaw-enterprise/shared/types.js';

/**
 * Record of an auto-response that was sent or queued.
 */
export interface AutoResponseRecord {
  messageId: string;
  channel: string;
  sender: string;
  subject: string;
  classification: MessageClassification;
  action: 'sent' | 'queued' | 'notified' | 'blocked' | 'skipped';
  responseBody?: string;
  timestamp: string;
}

/**
 * Summary of auto-responses for inclusion in daily briefing.
 */
export interface AutoResponseSummary {
  /** Total count of messages processed since last briefing. */
  totalProcessed: number;
  /** Breakdown by classification. */
  byClassification: Record<MessageClassification, number>;
  /** Breakdown by action taken. */
  byAction: Record<string, number>;
  /** Breakdown by channel. */
  byChannel: Record<string, number>;
  /** Critical messages that were auto-handled (user should review). */
  criticalMessages: Array<{
    messageId: string;
    sender: string;
    subject: string;
    action: string;
    channel: string;
  }>;
  /** Number of responses awaiting approval. */
  pendingApprovalCount: number;
  /** Time range covered by this summary. */
  periodStart: string;
  periodEnd: string;
}

/**
 * AutoResponseSummarizer aggregates auto-response records since the last
 * briefing and produces a summary for inclusion in the daily briefing.
 *
 * The briefing plugin calls getSummary() when assembling the briefing.
 */
export class AutoResponseSummarizer {
  private readonly records: AutoResponseRecord[] = [];

  /**
   * Record an auto-response action for later summarization.
   */
  addRecord(record: AutoResponseRecord): void {
    this.records.push(record);
  }

  /**
   * Generate a summary of all auto-responses since the given timestamp.
   * After generating, records older than periodStart are pruned.
   */
  getSummary(since: string, pendingApprovalCount: number = 0): AutoResponseSummary {
    const sinceDate = new Date(since);
    const now = new Date().toISOString();

    const relevantRecords = this.records.filter(
      (r) => new Date(r.timestamp) >= sinceDate,
    );

    const byClassification: Record<MessageClassification, number> = {
      critical: 0,
      'needs-response': 0,
      informational: 0,
      noise: 0,
    };

    const byAction: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const criticalMessages: AutoResponseSummary['criticalMessages'] = [];

    for (const record of relevantRecords) {
      byClassification[record.classification]++;

      byAction[record.action] = (byAction[record.action] ?? 0) + 1;
      byChannel[record.channel] = (byChannel[record.channel] ?? 0) + 1;

      if (record.classification === 'critical') {
        criticalMessages.push({
          messageId: record.messageId,
          sender: record.sender,
          subject: record.subject,
          action: record.action,
          channel: record.channel,
        });
      }
    }

    // Prune old records
    const pruneThreshold = sinceDate;
    const keepRecords = this.records.filter(
      (r) => new Date(r.timestamp) >= pruneThreshold,
    );
    this.records.length = 0;
    this.records.push(...keepRecords);

    return {
      totalProcessed: relevantRecords.length,
      byClassification,
      byAction,
      byChannel,
      criticalMessages,
      pendingApprovalCount,
      periodStart: since,
      periodEnd: now,
    };
  }
}
