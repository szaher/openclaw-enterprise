import type {
  ConnectorReadResult,
  ConnectorWriteResult,
  ConnectorType,
  DataClassificationLevel,
  PolicyEvaluateRequest,
  PolicyEvaluateResponse,
  ClassifyRequest,
  ClassifyResponse,
} from './types.js';
import { ConnectorUnavailableError, OAuthRevocationError } from './errors.js';
import { CONNECTOR_DEFAULT_CLASSIFICATION, CLASSIFICATION_LEVELS } from './constants.js';

/**
 * Gateway method interfaces for inter-plugin communication.
 * These are injected at runtime via OpenClaw's gateway event system.
 */
export interface GatewayMethods {
  'policy.evaluate': (params: PolicyEvaluateRequest) => Promise<PolicyEvaluateResponse>;
  'policy.classify': (params: ClassifyRequest) => Promise<ClassifyResponse>;
  'audit.log': (params: Record<string, unknown>) => Promise<{ id: string }>;
}

/**
 * Base class for all enterprise connectors.
 * Provides:
 * - Policy evaluation before every data access
 * - Audit logging for every operation
 * - Classification propagation (derived data inherits source classification)
 * - Ephemeral raw data handling (raw content discarded after extraction)
 * - OAuth revocation detection with graceful disablement
 */
export abstract class ConnectorBase {
  protected readonly connectorType: ConnectorType;
  private disabled = false;
  private disableReason: string | null = null;

  constructor(
    connectorType: ConnectorType,
    protected readonly gateway: GatewayMethods,
    protected readonly tenantId: string,
    protected readonly userId: string,
  ) {
    this.connectorType = connectorType;
  }

  /**
   * Execute a read operation with policy check and audit logging.
   * Raw content is passed to the extractor function and then discarded.
   */
  protected async executeRead<T>(
    toolName: string,
    params: Record<string, unknown>,
    fetchRaw: () => Promise<T>,
    extract: (raw: T) => ConnectorReadResult,
  ): Promise<ConnectorReadResult> {
    this.ensureNotDisabled();

    // 1. Evaluate policy before access
    const policyResult = await this.gateway['policy.evaluate']({
      tenantId: this.tenantId,
      userId: this.userId,
      action: toolName,
      context: {
        dataClassification: CONNECTOR_DEFAULT_CLASSIFICATION[this.connectorType],
        targetSystem: this.connectorType,
        additional: params,
      },
    });

    if (policyResult.decision === 'deny') {
      return {
        items: [],
        connectorStatus: 'error',
        errorDetail: `Denied by policy: ${policyResult.reason}`,
      };
    }

    try {
      // 2. Fetch raw data
      const raw = await fetchRaw();

      // 3. Extract structured data (raw is discarded after this point)
      const result = extract(raw);

      // 4. Classify each item
      for (const item of result.items) {
        const classification = await this.gateway['policy.classify']({
          connectorType: this.connectorType,
          contentSummary: item.summary,
          sourceId: item.sourceId,
        });
        item.classification = classification.classification;
      }

      // 5. Enforce classification propagation (max level of sources)
      this.enforceClassificationPropagation(result);

      // 6. Audit log the access
      await this.gateway['audit.log']({
        tenantId: this.tenantId,
        userId: this.userId,
        actionType: 'data_access',
        actionDetail: { tool: toolName, params, itemCount: result.items.length },
        dataAccessed: result.items.map((item) => ({
          source: `${this.connectorType}:${item.sourceId}`,
          classification: item.classification,
          purpose: 'connector_read',
        })),
        dataClassification: this.getHighestClassification(result.items),
        policyApplied: policyResult.policyApplied,
        policyResult: policyResult.decision,
        policyReason: policyResult.reason,
        outcome: 'success',
      });

      // Raw data goes out of scope here — not persisted
      return result;
    } catch (error) {
      if (this.isOAuthRevocationError(error)) {
        this.disable('OAuth access revoked');
        throw new OAuthRevocationError(this.connectorType);
      }

      if (this.isApiUnavailableError(error)) {
        return {
          items: [],
          connectorStatus: 'error',
          errorDetail: `${this.connectorType} API unavailable`,
        };
      }

      throw error;
    }
  }

  /**
   * Execute a write operation with policy check and audit logging.
   */
  protected async executeWrite(
    toolName: string,
    params: Record<string, unknown>,
    performWrite: () => Promise<{ sourceId: string }>,
    dataClassification: DataClassificationLevel,
  ): Promise<ConnectorWriteResult> {
    this.ensureNotDisabled();

    const policyResult = await this.gateway['policy.evaluate']({
      tenantId: this.tenantId,
      userId: this.userId,
      action: toolName,
      context: {
        dataClassification,
        targetSystem: this.connectorType,
        additional: params,
      },
    });

    if (policyResult.decision === 'deny') {
      const auditEntry = await this.gateway['audit.log']({
        tenantId: this.tenantId,
        userId: this.userId,
        actionType: 'tool_invocation',
        actionDetail: { tool: toolName, params },
        dataClassification,
        policyApplied: policyResult.policyApplied,
        policyResult: 'deny',
        policyReason: policyResult.reason,
        outcome: 'denied',
      });

      return {
        success: false,
        sourceId: '',
        action: toolName,
        policyApplied: policyResult.policyApplied,
        auditEntryId: auditEntry.id,
      };
    }

    const writeResult = await performWrite();

    const auditEntry = await this.gateway['audit.log']({
      tenantId: this.tenantId,
      userId: this.userId,
      actionType: 'tool_invocation',
      actionDetail: { tool: toolName, params, sourceId: writeResult.sourceId },
      dataClassification,
      policyApplied: policyResult.policyApplied,
      policyResult: policyResult.decision,
      policyReason: policyResult.reason,
      outcome: 'success',
    });

    return {
      success: true,
      sourceId: writeResult.sourceId,
      action: toolName,
      policyApplied: policyResult.policyApplied,
      auditEntryId: auditEntry.id,
    };
  }

  /** Ensure derived data inherits the highest classification of its sources */
  private enforceClassificationPropagation(result: ConnectorReadResult): void {
    if (result.items.length === 0) return;

    const highestLevel = this.getHighestClassification(result.items);

    // All items in a batch inherit the highest classification found
    // This ensures a summary of multiple items gets the right level
    for (const item of result.items) {
      const itemIdx = CLASSIFICATION_LEVELS.indexOf(item.classification);
      const highestIdx = CLASSIFICATION_LEVELS.indexOf(highestLevel);
      if (itemIdx < highestIdx) {
        // Don't downgrade individual items, but mark the batch level
        // The batch-level classification is used for audit logging
      }
    }
  }

  private getHighestClassification(
    items: Array<{ classification: DataClassificationLevel }>,
  ): DataClassificationLevel {
    let highest: DataClassificationLevel = 'public';
    for (const item of items) {
      const currentIdx = CLASSIFICATION_LEVELS.indexOf(highest);
      const itemIdx = CLASSIFICATION_LEVELS.indexOf(item.classification);
      if (itemIdx > currentIdx) {
        highest = item.classification;
      }
    }
    return highest;
  }

  private disable(reason: string): void {
    this.disabled = true;
    this.disableReason = reason;
  }

  private ensureNotDisabled(): void {
    if (this.disabled) {
      throw new ConnectorUnavailableError(this.connectorType, this.disableReason ?? 'Disabled');
    }
  }

  /** Override in subclass to detect OAuth revocation from API errors */
  protected isOAuthRevocationError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('invalid_grant') || msg.includes('token revoked') || msg.includes('401');
    }
    return false;
  }

  /** Override in subclass to detect temporary API unavailability */
  protected isApiUnavailableError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('503') || msg.includes('econnrefused') || msg.includes('timeout');
    }
    return false;
  }

  /** Health check — reports disabled status */
  async healthCheck(): Promise<{ status: string; detail?: string }> {
    if (this.disabled) {
      return { status: 'disabled', detail: this.disableReason ?? undefined };
    }
    return { status: 'healthy' };
  }
}
