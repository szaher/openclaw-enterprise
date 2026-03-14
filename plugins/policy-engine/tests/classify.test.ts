import { describe, it, expect, vi } from 'vitest';
import { DataClassifier } from '../src/classification/classify.js';

describe('DataClassifier', () => {
  it('returns connector default when no AI classifier', async () => {
    const classifier = new DataClassifier();

    const result = await classifier.classify({
      connectorType: 'gmail',
      contentSummary: 'Test email',
      sourceId: 'msg-1',
    });

    expect(result.classification).toBe('internal');
    expect(result.assignedBy).toBe('connector_default');
    expect(result.originalLevel).toBeNull();
    expect(result.confidence).toBe(1.0);
  });

  it('returns public for public GitHub repos', async () => {
    const classifier = new DataClassifier();

    const result = await classifier.classify({
      connectorType: 'github',
      contentSummary: 'Public PR',
      sourceId: 'pr-1',
    });

    expect(result.classification).toBe('public');
  });

  it('upgrades classification when AI detects sensitive content', async () => {
    const aiClassify = vi.fn().mockResolvedValue({
      level: 'confidential',
      confidence: 0.95,
    });
    const classifier = new DataClassifier(aiClassify);

    const result = await classifier.classify({
      connectorType: 'gmail',
      contentSummary: 'SSN: 123-45-6789',
      sourceId: 'msg-2',
    });

    expect(result.classification).toBe('confidential');
    expect(result.assignedBy).toBe('ai_reclassification');
    expect(result.originalLevel).toBe('internal');
    expect(result.confidence).toBe(0.95);
  });

  it('does NOT downgrade classification (AI can only upgrade)', async () => {
    const aiClassify = vi.fn().mockResolvedValue({
      level: 'public',
      confidence: 0.9,
    });
    const classifier = new DataClassifier(aiClassify);

    const result = await classifier.classify({
      connectorType: 'gmail',
      contentSummary: 'Normal email',
      sourceId: 'msg-3',
    });

    // Gmail default is 'internal', AI says 'public' — keep 'internal'
    expect(result.classification).toBe('internal');
    expect(result.assignedBy).toBe('connector_default');
  });

  it('falls back to connector default when AI fails', async () => {
    const aiClassify = vi.fn().mockRejectedValue(new Error('AI unavailable'));
    const classifier = new DataClassifier(aiClassify);

    const result = await classifier.classify({
      connectorType: 'jira',
      contentSummary: 'Ticket content',
      sourceId: 'jira-1',
    });

    expect(result.classification).toBe('internal');
    expect(result.assignedBy).toBe('connector_default');
  });

  it('defaults unknown connectors to internal', async () => {
    const classifier = new DataClassifier();

    const result = await classifier.classify({
      connectorType: 'unknown' as 'gmail',
      contentSummary: 'test',
      sourceId: 'x',
    });

    expect(result.classification).toBe('internal');
  });
});
