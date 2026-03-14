import type {
  ClassifyRequest,
  ClassifyResponse,
  ConnectorType,
  DataClassificationLevel,
  ClassificationAssigner,
} from '@openclaw-enterprise/shared/types.js';
import {
  CONNECTOR_DEFAULT_CLASSIFICATION,
  CLASSIFICATION_LEVELS,
} from '@openclaw-enterprise/shared/constants.js';

/**
 * Gateway method handler for `policy.classify`.
 * Three-layer classification pipeline:
 * 1. Per-connector defaults (e.g., Gmail = "internal", public GitHub = "public")
 * 2. AI reclassification for sensitive content detection (can only upgrade, never downgrade)
 * 3. Admin override (handled separately via admin API)
 */
export class DataClassifier {
  constructor(
    private readonly aiClassify?: (contentSummary: string) => Promise<{
      level: DataClassificationLevel;
      confidence: number;
    }>,
  ) {}

  async classify(params: ClassifyRequest): Promise<ClassifyResponse> {
    // Layer 1: Connector default
    const connectorDefault = CONNECTOR_DEFAULT_CLASSIFICATION[params.connectorType as ConnectorType] ?? 'internal';

    // Layer 2: AI reclassification (if available)
    if (this.aiClassify && params.contentSummary) {
      try {
        const aiResult = await this.aiClassify(params.contentSummary);

        // AI can only upgrade classification, never downgrade
        const defaultIdx = CLASSIFICATION_LEVELS.indexOf(connectorDefault);
        const aiIdx = CLASSIFICATION_LEVELS.indexOf(aiResult.level);

        if (aiIdx > defaultIdx) {
          return {
            classification: aiResult.level,
            assignedBy: 'ai_reclassification' as ClassificationAssigner,
            originalLevel: connectorDefault,
            confidence: aiResult.confidence,
          };
        }
      } catch {
        // AI classification failed — fall back to connector default
        // Don't block on classification failures
      }
    }

    // No reclassification needed — use connector default
    return {
      classification: connectorDefault,
      assignedBy: 'connector_default' as ClassificationAssigner,
      originalLevel: null,
      confidence: 1.0,
    };
  }
}
