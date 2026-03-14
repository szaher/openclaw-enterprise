import type { DataClassificationLevel, NewsRelevance } from '@openclaw-enterprise/shared/types.js';
import { CLASSIFICATION_LEVELS } from '@openclaw-enterprise/shared/constants.js';
import type { ScoredNewsItem } from '../news/scorer.js';

/**
 * Digest frequency options.
 */
export type DigestFrequency = 'daily' | 'weekly';

/**
 * A single digest entry with classification-aware content.
 */
export interface DigestEntry {
  title: string;
  summary: string;
  source: string;
  url: string;
  relevance: NewsRelevance;
  score: number;
  classification: DataClassificationLevel;
  matchReasons: string[];
}

/**
 * A composed digest ready for delivery.
 */
export interface Digest {
  id: string;
  userId: string;
  frequency: DigestFrequency;
  generatedAt: string;
  entries: DigestEntry[];
  totalItems: number;
  skippedItems: number;
  classificationCeiling: DataClassificationLevel;
}

/**
 * Configuration for digest generation.
 */
export interface DigestConfig {
  userId: string;
  frequency: DigestFrequency;
  maxClassification: DataClassificationLevel;
  maxItems: number;
  includeNiceToKnow: boolean;
}

/**
 * Personalized Digest Generator.
 * Composes weekly/daily digests with scored items.
 * Respects data classification by filtering items that exceed
 * the user's maximum allowed classification level.
 */
export class DigestGenerator {
  /**
   * Generate a digest from scored news items.
   * Items classified above the user's ceiling are excluded.
   * Items classified as 'skip' are always excluded.
   */
  generate(scoredItems: ScoredNewsItem[], config: DigestConfig): Digest {
    const maxLevelIndex = CLASSIFICATION_LEVELS.indexOf(config.maxClassification);
    let skippedItems = 0;

    // Filter by classification ceiling and relevance
    const eligible = scoredItems.filter((scored) => {
      // Always skip items classified as 'skip' relevance
      if (scored.relevance === 'skip') {
        skippedItems++;
        return false;
      }

      // Skip 'nice-to-know' if not included
      if (!config.includeNiceToKnow && scored.relevance === 'nice-to-know') {
        skippedItems++;
        return false;
      }

      // Enforce classification ceiling
      const itemLevelIndex = CLASSIFICATION_LEVELS.indexOf(scored.item.classification);
      if (itemLevelIndex > maxLevelIndex) {
        skippedItems++;
        return false;
      }

      return true;
    });

    // Take top N items, already sorted by score
    const topItems = eligible.slice(0, config.maxItems);

    const entries: DigestEntry[] = topItems.map((scored) => ({
      title: scored.item.title,
      summary: this.truncateSummary(scored.item.body),
      source: `${scored.item.source}:${scored.item.channel}`,
      url: scored.item.url,
      relevance: scored.relevance,
      score: scored.score,
      classification: scored.item.classification,
      matchReasons: scored.matchReasons,
    }));

    return {
      id: crypto.randomUUID(),
      userId: config.userId,
      frequency: config.frequency,
      generatedAt: new Date().toISOString(),
      entries,
      totalItems: scoredItems.length,
      skippedItems,
      classificationCeiling: config.maxClassification,
    };
  }

  private truncateSummary(body: string, maxLength = 280): string {
    if (body.length <= maxLength) return body;
    return body.slice(0, maxLength - 3) + '...';
  }
}
