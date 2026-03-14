import type { ChangeClassification } from '@openclaw-enterprise/shared/types.js';

/**
 * A document and its key claims/statements for consistency checking.
 */
export interface DocumentClaims {
  docId: string;
  title: string;
  claims: Claim[];
}

/**
 * A single claim or statement extracted from a document.
 */
export interface Claim {
  id: string;
  section: string;
  statement: string;
  keywords: string[];
}

/**
 * A detected contradiction between two documents.
 */
export interface Contradiction {
  id: string;
  sourceDocId: string;
  sourceDocTitle: string;
  sourceClaim: Claim;
  targetDocId: string;
  targetDocTitle: string;
  targetClaim: Claim;
  severity: 'high' | 'medium' | 'low';
  description: string;
  detectedAt: string;
}

/**
 * Result of a consistency check.
 */
export interface ConsistencyCheckResult {
  changedDocId: string;
  relatedDocsChecked: number;
  contradictions: Contradiction[];
  checkedAt: string;
}

/**
 * A relationship between documents.
 */
export interface DocumentRelationship {
  docId: string;
  relatedDocIds: string[];
}

/**
 * Cross-Document Consistency Checker.
 * Detects contradictions between related documents when one changes.
 * Uses keyword overlap and semantic matching to identify conflicting claims.
 */
export class ConsistencyChecker {
  /**
   * Check for contradictions when a document changes.
   * Compares claims in the changed document against claims in related documents.
   */
  check(
    changedDoc: DocumentClaims,
    relatedDocs: DocumentClaims[],
  ): ConsistencyCheckResult {
    const contradictions: Contradiction[] = [];

    for (const relatedDoc of relatedDocs) {
      const found = this.findContradictions(changedDoc, relatedDoc);
      contradictions.push(...found);
    }

    return {
      changedDocId: changedDoc.docId,
      relatedDocsChecked: relatedDocs.length,
      contradictions,
      checkedAt: new Date().toISOString(),
    };
  }

  private findContradictions(
    source: DocumentClaims,
    target: DocumentClaims,
  ): Contradiction[] {
    const contradictions: Contradiction[] = [];

    for (const sourceClaim of source.claims) {
      for (const targetClaim of target.claims) {
        // Only check claims with keyword overlap (related topics)
        const overlap = this.keywordOverlap(sourceClaim.keywords, targetClaim.keywords);
        if (overlap < 0.3) continue;

        // Check for contradicting patterns
        const contradiction = this.detectContradiction(
          sourceClaim,
          targetClaim,
          overlap,
        );

        if (contradiction) {
          contradictions.push({
            id: crypto.randomUUID(),
            sourceDocId: source.docId,
            sourceDocTitle: source.title,
            sourceClaim,
            targetDocId: target.docId,
            targetDocTitle: target.title,
            targetClaim,
            severity: contradiction.severity,
            description: contradiction.description,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return contradictions;
  }

  private keywordOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    const setA = new Set(a.map((k) => k.toLowerCase()));
    const setB = new Set(b.map((k) => k.toLowerCase()));

    let intersection = 0;
    for (const k of setA) {
      if (setB.has(k)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  private detectContradiction(
    source: Claim,
    target: Claim,
    overlap: number,
  ): { severity: 'high' | 'medium' | 'low'; description: string } | null {
    const sourceStatement = source.statement.toLowerCase();
    const targetStatement = target.statement.toLowerCase();

    // Detect negation contradictions
    const negationPatterns = [
      { positive: /\bmust\b/, negative: /\bmust not\b/ },
      { positive: /\bshall\b/, negative: /\bshall not\b/ },
      { positive: /\brequired\b/, negative: /\bnot required\b/ },
      { positive: /\ballowed\b/, negative: /\bnot allowed\b/ },
      { positive: /\benabled?\b/, negative: /\bdisabled?\b/ },
      { positive: /\binclude[sd]?\b/, negative: /\bexclude[sd]?\b/ },
      { positive: /\byes\b/, negative: /\bno\b/ },
      { positive: /\btrue\b/, negative: /\bfalse\b/ },
    ];

    for (const pattern of negationPatterns) {
      const sourceHasPositive = pattern.positive.test(sourceStatement);
      const sourceHasNegative = pattern.negative.test(sourceStatement);
      const targetHasPositive = pattern.positive.test(targetStatement);
      const targetHasNegative = pattern.negative.test(targetStatement);

      if (
        (sourceHasPositive && targetHasNegative && !sourceHasNegative) ||
        (sourceHasNegative && targetHasPositive && !targetHasNegative)
      ) {
        const severity = overlap >= 0.6 ? 'high' : 'medium';
        return {
          severity,
          description: `Contradicting directives: "${source.statement}" vs "${target.statement}" (keyword overlap: ${(overlap * 100).toFixed(0)}%)`,
        };
      }
    }

    // Detect numeric contradictions (different numbers for same concept)
    const sourceNumbers = sourceStatement.match(/\b\d+(\.\d+)?\b/g);
    const targetNumbers = targetStatement.match(/\b\d+(\.\d+)?\b/g);

    if (
      sourceNumbers &&
      targetNumbers &&
      overlap >= 0.5 &&
      sourceNumbers.length > 0 &&
      targetNumbers.length > 0
    ) {
      // Check if they refer to the same metric but with different values
      const sourceNum = sourceNumbers[0];
      const targetNum = targetNumbers[0];
      if (sourceNum !== targetNum) {
        return {
          severity: 'low',
          description: `Potential numeric inconsistency: "${source.statement}" (${sourceNum}) vs "${target.statement}" (${targetNum})`,
        };
      }
    }

    return null;
  }
}
