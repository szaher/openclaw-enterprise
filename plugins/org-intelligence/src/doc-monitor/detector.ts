import type {
  ChangeClassification,
  ConnectorReadResult,
  ConnectorType,
  DataClassificationLevel,
} from '@openclaw-enterprise/shared/types.js';

/**
 * Cached document version for comparison.
 */
export interface CachedDocumentVersion {
  docId: string;
  title: string;
  content: string;
  version: string;
  classification: DataClassificationLevel;
  cachedAt: string;
}

/**
 * Current document version fetched from connector.
 */
export interface CurrentDocumentVersion {
  docId: string;
  title: string;
  content: string;
  version: string;
  classification: DataClassificationLevel;
  lastModifiedAt: string;
  lastModifiedBy: string;
}

/**
 * Result of a document change detection.
 */
export interface ChangeDetectionResult {
  docId: string;
  title: string;
  changeClassification: ChangeClassification;
  previousVersion: string | null;
  currentVersion: string;
  classification: DataClassificationLevel;
  lastModifiedBy: string;
  lastModifiedAt: string;
  diffAvailable: boolean;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
}

/**
 * Interface for accessing cached document versions.
 */
export interface DocumentCache {
  get(docId: string): Promise<CachedDocumentVersion | null>;
  set(doc: CachedDocumentVersion): Promise<void>;
}

/**
 * Interface for a connector that can fetch document content.
 */
export interface DocumentConnectorReader {
  type: ConnectorType;
  readDocument(docId: string): Promise<CurrentDocumentVersion | null>;
}

/**
 * Document Change Detector.
 * Compares current vs cached version via GDrive connector.
 * Classifies changes as: cosmetic | minor | substantive | critical.
 * Handles missing cached version by flagging no-diff-available.
 */
export class DocumentChangeDetector {
  constructor(
    private readonly connector: DocumentConnectorReader,
    private readonly cache: DocumentCache,
  ) {}

  /**
   * Detect changes in a document by comparing current version to cached.
   */
  async detect(docId: string): Promise<ChangeDetectionResult | null> {
    const current = await this.connector.readDocument(docId);
    if (!current) {
      return null; // Document not found or inaccessible
    }

    const cached = await this.cache.get(docId);

    // No cached version — flag as no-diff-available
    if (!cached) {
      // Cache the current version for future comparison
      await this.cache.set({
        docId: current.docId,
        title: current.title,
        content: current.content,
        version: current.version,
        classification: current.classification,
        cachedAt: new Date().toISOString(),
      });

      return {
        docId: current.docId,
        title: current.title,
        changeClassification: 'minor',
        previousVersion: null,
        currentVersion: current.version,
        classification: current.classification,
        lastModifiedBy: current.lastModifiedBy,
        lastModifiedAt: current.lastModifiedAt,
        diffAvailable: false,
        addedLines: 0,
        removedLines: 0,
        modifiedLines: 0,
      };
    }

    // Same version — no change
    if (cached.version === current.version) {
      return null;
    }

    // Compute diff metrics
    const diff = this.computeDiff(cached.content, current.content);

    // Classify the change
    const changeClassification = this.classifyChange(diff, cached, current);

    // Update cache with current version
    await this.cache.set({
      docId: current.docId,
      title: current.title,
      content: current.content,
      version: current.version,
      classification: current.classification,
      cachedAt: new Date().toISOString(),
    });

    return {
      docId: current.docId,
      title: current.title,
      changeClassification,
      previousVersion: cached.version,
      currentVersion: current.version,
      classification: current.classification,
      lastModifiedBy: current.lastModifiedBy,
      lastModifiedAt: current.lastModifiedAt,
      diffAvailable: true,
      addedLines: diff.added,
      removedLines: diff.removed,
      modifiedLines: diff.modified,
    };
  }

  /**
   * Detect changes across multiple documents.
   */
  async detectBatch(docIds: string[]): Promise<ChangeDetectionResult[]> {
    const results = await Promise.allSettled(
      docIds.map((id) => this.detect(id)),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<ChangeDetectionResult | null> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value!);
  }

  private computeDiff(
    oldContent: string,
    newContent: string,
  ): { added: number; removed: number; modified: number } {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    let added = 0;
    let removed = 0;

    for (const line of newLines) {
      if (!oldSet.has(line)) added++;
    }

    for (const line of oldLines) {
      if (!newSet.has(line)) removed++;
    }

    // Estimate modified lines as the overlap of added+removed
    const modified = Math.min(added, removed);
    const pureAdded = added - modified;
    const pureRemoved = removed - modified;

    return { added: pureAdded, removed: pureRemoved, modified };
  }

  classifyChange(
    diff: { added: number; removed: number; modified: number },
    cached: CachedDocumentVersion,
    current: CurrentDocumentVersion,
  ): ChangeClassification {
    const totalChanges = diff.added + diff.removed + diff.modified;
    const oldLineCount = cached.content.split('\n').length;
    const changeRatio = oldLineCount > 0 ? totalChanges / oldLineCount : 1;

    // Classification level changed = critical
    if (cached.classification !== current.classification) {
      return 'critical';
    }

    // Title changed = at least substantive
    if (cached.title !== current.title) {
      return 'substantive';
    }

    // Large structural changes = critical
    if (changeRatio > 0.5) {
      return 'critical';
    }

    // Moderate changes = substantive
    if (changeRatio > 0.15 || diff.added > 20 || diff.removed > 20) {
      return 'substantive';
    }

    // Small changes = minor
    if (totalChanges > 2) {
      return 'minor';
    }

    // Trivial (whitespace, typo) = cosmetic
    return 'cosmetic';
  }
}
