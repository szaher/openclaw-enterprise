import type { DataClassificationLevel } from '@openclaw-enterprise/shared/types.js';
import { CLASSIFICATION_LEVELS } from '@openclaw-enterprise/shared/constants.js';

/**
 * A data item that may be included or excluded based on classification.
 */
export interface ClassifiableDataItem {
  source: string;
  fields: string[];
  classification: DataClassificationLevel;
  description: string;
}

/**
 * Record of data that was withheld from transmission.
 */
export interface WithheldRecord {
  reason: string;
  description: string;
}

/**
 * Result of classification filtering.
 */
export interface FilterResult {
  allowed: ClassifiableDataItem[];
  withheld: WithheldRecord[];
}

/**
 * Filters data items before transmission based on the receiver's
 * acceptable classification levels (can_share).
 *
 * Per ocip-protocol.md:
 * - Sender filters data BEFORE transmission based on receiver's can_share levels
 * - Sender MUST NOT include data classified above the exchange's classification level
 * - data_withheld array is logged in the Exchange audit record for transparency
 */
export class ClassificationFilter {
  /**
   * Filter data items, keeping only those whose classification level
   * is within the receiver's can_share levels and at or below the
   * exchange classification ceiling.
   */
  filter(
    items: ClassifiableDataItem[],
    receiverCanShare: DataClassificationLevel[],
    exchangeClassification: DataClassificationLevel,
  ): FilterResult {
    const allowed: ClassifiableDataItem[] = [];
    const withheld: WithheldRecord[] = [];

    const exchangeCeiling = CLASSIFICATION_LEVELS.indexOf(exchangeClassification);

    for (const item of items) {
      const itemLevel = CLASSIFICATION_LEVELS.indexOf(item.classification);

      // Check against exchange classification ceiling
      if (itemLevel > exchangeCeiling) {
        withheld.push({
          reason: `Classification "${item.classification}" exceeds exchange ceiling "${exchangeClassification}"`,
          description: `${item.source}: ${item.description}`,
        });
        continue;
      }

      // Check against receiver's can_share levels
      if (!receiverCanShare.includes(item.classification)) {
        withheld.push({
          reason: `Receiver cannot accept classification "${item.classification}"`,
          description: `${item.source}: ${item.description}`,
        });
        continue;
      }

      allowed.push(item);
    }

    return { allowed, withheld };
  }

  /**
   * Returns the numeric sensitivity index for a classification level.
   * Higher index = more sensitive.
   */
  static classificationIndex(level: DataClassificationLevel): number {
    return CLASSIFICATION_LEVELS.indexOf(level);
  }

  /**
   * Returns true if levelA is more sensitive than levelB.
   */
  static isMoreSensitive(
    levelA: DataClassificationLevel,
    levelB: DataClassificationLevel,
  ): boolean {
    return (
      CLASSIFICATION_LEVELS.indexOf(levelA) >
      CLASSIFICATION_LEVELS.indexOf(levelB)
    );
  }
}
