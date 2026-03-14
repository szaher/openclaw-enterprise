import { describe, it, expect, vi } from 'vitest';
import { OrgNewsAggregator, type RawNewsItem } from '../src/news/aggregator.js';
import { RelevanceScorer, type UserProfile } from '../src/news/scorer.js';
import { DigestGenerator, type DigestConfig } from '../src/digest/generator.js';
import {
  DocumentChangeDetector,
  type CachedDocumentVersion,
  type CurrentDocumentVersion,
} from '../src/doc-monitor/detector.js';
import { ChangeSummarizer } from '../src/doc-monitor/summarizer.js';
import { ConsistencyChecker, type DocumentClaims, type Claim } from '../src/consistency/checker.js';
import { NotificationService } from '../src/services/notifier.js';

// --- Helpers ---

function makeNewsItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    id: 'news-1',
    source: 'gmail',
    sourceId: 'msg-1',
    title: 'Team update',
    body: 'General update about the platform team and project alpha.',
    author: 'alice@example.com',
    channel: '#announcements',
    url: 'https://example.com/news/1',
    classification: 'internal',
    metadata: {},
    publishedAt: new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'user-1',
    role: 'engineer',
    team: 'platform team',
    orgUnit: 'engineering',
    activeProjects: ['project alpha'],
    interests: ['kubernetes', 'observability'],
    ...overrides,
  };
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    section: 'Requirements',
    statement: 'All deployments must use blue-green strategy.',
    keywords: ['deployment', 'blue-green', 'strategy'],
    ...overrides,
  };
}

// --- Relevance Scoring (T126) ---

describe('RelevanceScorer', () => {
  it('scores items mentioning user team as must-read', () => {
    const scorer = new RelevanceScorer();
    const item = makeNewsItem({
      title: 'Platform Team Q1 Goals',
      body: 'The platform team will focus on reliability and scaling.',
    });
    const profile = makeUserProfile();
    const result = scorer.score(item, profile);

    expect(result.relevance).toBe('must-read');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matchReasons).toContain('team-mention:platform team');
  });

  it('scores items referencing active projects highly', () => {
    const scorer = new RelevanceScorer();
    const item = makeNewsItem({
      title: 'Project Alpha milestone reached',
      body: 'Project alpha has completed phase 1.',
    });
    const profile = makeUserProfile();
    const result = scorer.score(item, profile);

    expect(result.score).toBeGreaterThan(0);
    expect(result.matchReasons).toContain('project-reference');
  });

  it('classifies irrelevant items as skip', () => {
    const scorer = new RelevanceScorer();
    const item = makeNewsItem({
      title: 'HR Policy Update',
      body: 'New vacation policy for marketing department.',
    });
    const profile = makeUserProfile({
      team: 'platform',
      activeProjects: ['infra'],
      interests: [],
    });
    const result = scorer.score(item, profile);

    expect(result.relevance).toBe('skip');
    expect(result.score).toBeLessThan(20);
  });

  it('classifies relevance tiers correctly', () => {
    const scorer = new RelevanceScorer();
    expect(scorer.classifyRelevance(75)).toBe('must-read');
    expect(scorer.classifyRelevance(50)).toBe('should-read');
    expect(scorer.classifyRelevance(25)).toBe('nice-to-know');
    expect(scorer.classifyRelevance(10)).toBe('skip');
  });

  it('scores batch and sorts by score descending', () => {
    const scorer = new RelevanceScorer();
    const items = [
      makeNewsItem({ title: 'Unrelated topic', body: 'Nothing here.' }),
      makeNewsItem({ title: 'Platform Team update', body: 'Platform team news about project alpha.' }),
    ];
    const profile = makeUserProfile();
    const results = scorer.scoreBatch(items, profile);

    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });
});

// --- Digest Composition (T127) ---

describe('DigestGenerator', () => {
  it('generates a digest with eligible items', () => {
    const generator = new DigestGenerator();
    const scoredItems = [
      { item: makeNewsItem(), score: 80, relevance: 'must-read' as const, matchReasons: ['team'] },
      { item: makeNewsItem({ id: 'news-2' }), score: 50, relevance: 'should-read' as const, matchReasons: ['project'] },
    ];
    const config: DigestConfig = {
      userId: 'user-1',
      frequency: 'daily',
      maxClassification: 'confidential',
      maxItems: 10,
      includeNiceToKnow: true,
    };

    const digest = generator.generate(scoredItems, config);

    expect(digest.entries).toHaveLength(2);
    expect(digest.userId).toBe('user-1');
    expect(digest.frequency).toBe('daily');
    expect(digest.skippedItems).toBe(0);
  });

  it('filters items above classification ceiling', () => {
    const generator = new DigestGenerator();
    const scoredItems = [
      { item: makeNewsItem({ classification: 'restricted' }), score: 90, relevance: 'must-read' as const, matchReasons: [] },
      { item: makeNewsItem({ classification: 'internal' }), score: 70, relevance: 'must-read' as const, matchReasons: [] },
    ];
    const config: DigestConfig = {
      userId: 'user-1',
      frequency: 'daily',
      maxClassification: 'internal',
      maxItems: 10,
      includeNiceToKnow: true,
    };

    const digest = generator.generate(scoredItems, config);

    expect(digest.entries).toHaveLength(1);
    expect(digest.entries[0]!.classification).toBe('internal');
    expect(digest.skippedItems).toBe(1);
  });

  it('excludes skip-relevance items', () => {
    const generator = new DigestGenerator();
    const scoredItems = [
      { item: makeNewsItem(), score: 5, relevance: 'skip' as const, matchReasons: [] },
    ];
    const config: DigestConfig = {
      userId: 'user-1',
      frequency: 'weekly',
      maxClassification: 'restricted',
      maxItems: 10,
      includeNiceToKnow: true,
    };

    const digest = generator.generate(scoredItems, config);

    expect(digest.entries).toHaveLength(0);
    expect(digest.skippedItems).toBe(1);
  });

  it('respects maxItems limit', () => {
    const generator = new DigestGenerator();
    const scoredItems = Array.from({ length: 5 }, (_, i) => ({
      item: makeNewsItem({ id: `news-${i}` }),
      score: 80 - i * 5,
      relevance: 'must-read' as const,
      matchReasons: [],
    }));
    const config: DigestConfig = {
      userId: 'user-1',
      frequency: 'daily',
      maxClassification: 'restricted',
      maxItems: 3,
      includeNiceToKnow: true,
    };

    const digest = generator.generate(scoredItems, config);

    expect(digest.entries).toHaveLength(3);
  });
});

// --- Change Classification (T128) ---

describe('DocumentChangeDetector', () => {
  it('classifies large structural changes as critical', () => {
    const cache = {
      get: vi.fn().mockResolvedValue({
        docId: 'doc-1',
        title: 'Architecture',
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        version: 'v1',
        classification: 'internal',
        cachedAt: new Date().toISOString(),
      } satisfies CachedDocumentVersion),
      set: vi.fn(),
    };
    const connector = {
      type: 'gdrive' as const,
      readDocument: vi.fn().mockResolvedValue({
        docId: 'doc-1',
        title: 'Architecture',
        content: 'Completely new content\nNothing the same\nAll different\nBrand new\nReplaced',
        version: 'v2',
        classification: 'internal',
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: 'bob@example.com',
      } satisfies CurrentDocumentVersion),
    };

    const detector = new DocumentChangeDetector(connector, cache);

    // Use classifyChange directly for unit testing
    const diff = { added: 5, removed: 5, modified: 0 };
    const cached = cache.get.mock.results[0] as unknown;
    const result = detector.classifyChange(
      diff,
      {
        docId: 'doc-1', title: 'Architecture',
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        version: 'v1', classification: 'internal', cachedAt: '',
      },
      {
        docId: 'doc-1', title: 'Architecture',
        content: 'New content', version: 'v2',
        classification: 'internal', lastModifiedAt: '', lastModifiedBy: '',
      },
    );

    expect(result).toBe('critical');
  });

  it('classifies small changes as minor', () => {
    const detector = new DocumentChangeDetector(
      { type: 'gdrive', readDocument: vi.fn() },
      { get: vi.fn(), set: vi.fn() },
    );

    const result = detector.classifyChange(
      { added: 1, removed: 1, modified: 1 },
      {
        docId: 'doc-1', title: 'Guide', version: 'v1',
        content: Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n'),
        classification: 'internal', cachedAt: '',
      },
      {
        docId: 'doc-1', title: 'Guide', version: 'v2',
        content: '', classification: 'internal',
        lastModifiedAt: '', lastModifiedBy: '',
      },
    );

    expect(result).toBe('minor');
  });

  it('classifies trivial changes as cosmetic', () => {
    const detector = new DocumentChangeDetector(
      { type: 'gdrive', readDocument: vi.fn() },
      { get: vi.fn(), set: vi.fn() },
    );

    const result = detector.classifyChange(
      { added: 0, removed: 0, modified: 1 },
      {
        docId: 'doc-1', title: 'Guide', version: 'v1',
        content: Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n'),
        classification: 'internal', cachedAt: '',
      },
      {
        docId: 'doc-1', title: 'Guide', version: 'v2',
        content: '', classification: 'internal',
        lastModifiedAt: '', lastModifiedBy: '',
      },
    );

    expect(result).toBe('cosmetic');
  });

  it('classifies classification level change as critical', () => {
    const detector = new DocumentChangeDetector(
      { type: 'gdrive', readDocument: vi.fn() },
      { get: vi.fn(), set: vi.fn() },
    );

    const result = detector.classifyChange(
      { added: 0, removed: 0, modified: 0 },
      {
        docId: 'doc-1', title: 'Guide', version: 'v1',
        content: 'content', classification: 'internal', cachedAt: '',
      },
      {
        docId: 'doc-1', title: 'Guide', version: 'v2',
        content: 'content', classification: 'restricted',
        lastModifiedAt: '', lastModifiedBy: '',
      },
    );

    expect(result).toBe('critical');
  });

  it('handles missing cached version with no-diff-available', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    const connector = {
      type: 'gdrive' as const,
      readDocument: vi.fn().mockResolvedValue({
        docId: 'doc-new',
        title: 'New Doc',
        content: 'Fresh content',
        version: 'v1',
        classification: 'internal',
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: 'alice@example.com',
      } satisfies CurrentDocumentVersion),
    };

    const detector = new DocumentChangeDetector(connector, cache);
    const result = await detector.detect('doc-new');

    expect(result).not.toBeNull();
    expect(result!.diffAvailable).toBe(false);
    expect(result!.previousVersion).toBeNull();
    expect(cache.set).toHaveBeenCalled();
  });
});

// --- Consistency Checking (T130) ---

describe('ConsistencyChecker', () => {
  it('detects contradictions between documents with negation patterns', () => {
    const checker = new ConsistencyChecker();
    const changedDoc: DocumentClaims = {
      docId: 'doc-1',
      title: 'Deployment Policy v2',
      claims: [
        makeClaim({
          id: 'c1',
          statement: 'All deployments must use blue-green strategy.',
          keywords: ['deployment', 'blue-green', 'strategy'],
        }),
      ],
    };

    const relatedDoc: DocumentClaims = {
      docId: 'doc-2',
      title: 'Infrastructure Guide',
      claims: [
        makeClaim({
          id: 'c2',
          statement: 'Deployments must not use blue-green strategy due to cost.',
          keywords: ['deployment', 'blue-green', 'strategy', 'cost'],
        }),
      ],
    };

    const result = checker.check(changedDoc, [relatedDoc]);

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]!.severity).toBe('high');
    expect(result.relatedDocsChecked).toBe(1);
  });

  it('does not flag non-overlapping claims as contradictions', () => {
    const checker = new ConsistencyChecker();
    const changedDoc: DocumentClaims = {
      docId: 'doc-1',
      title: 'Security Policy',
      claims: [
        makeClaim({
          id: 'c1',
          statement: 'All APIs must use TLS 1.3.',
          keywords: ['api', 'tls', 'security'],
        }),
      ],
    };

    const relatedDoc: DocumentClaims = {
      docId: 'doc-2',
      title: 'UI Guide',
      claims: [
        makeClaim({
          id: 'c2',
          statement: 'Buttons must use primary color scheme.',
          keywords: ['button', 'color', 'ui'],
        }),
      ],
    };

    const result = checker.check(changedDoc, [relatedDoc]);
    expect(result.contradictions).toHaveLength(0);
  });

  it('detects enabled/disabled contradictions', () => {
    const checker = new ConsistencyChecker();
    const changedDoc: DocumentClaims = {
      docId: 'doc-1',
      title: 'Feature Flags',
      claims: [
        makeClaim({
          id: 'c1',
          statement: 'Dark mode is enabled for all users.',
          keywords: ['dark-mode', 'feature', 'users'],
        }),
      ],
    };

    const relatedDoc: DocumentClaims = {
      docId: 'doc-2',
      title: 'Release Notes',
      claims: [
        makeClaim({
          id: 'c2',
          statement: 'Dark mode is disabled pending accessibility review.',
          keywords: ['dark-mode', 'feature', 'accessibility'],
        }),
      ],
    };

    const result = checker.check(changedDoc, [relatedDoc]);
    expect(result.contradictions.length).toBeGreaterThanOrEqual(1);
  });
});

// --- Cosmetic Suppression (T131) ---

describe('NotificationService', () => {
  it('suppresses cosmetic changes per policy', async () => {
    const policyEvaluator = {
      evaluate: vi.fn().mockResolvedValue({ suppress: true, reason: 'Cosmetic changes suppressed' }),
    };
    const deliveryTarget = {
      deliver: vi.fn().mockResolvedValue(true),
    };

    const notifier = new NotificationService(policyEvaluator, deliveryTarget);
    await notifier.start();

    const notification = await notifier.notifyDocumentChange(
      {
        docId: 'doc-1',
        title: 'Style Guide',
        changeClassification: 'cosmetic',
        overallSummary: 'Minor whitespace fix.',
        sectionChanges: [],
        userImpacts: [],
        actionRequired: false,
      },
      'user-1',
      'slack',
      'internal',
    );

    expect(notification.suppressed).toBe(true);
    expect(notification.suppressionReason).toBe('Cosmetic changes suppressed');
    expect(deliveryTarget.deliver).not.toHaveBeenCalled();
  });

  it('delivers substantive change notifications', async () => {
    const policyEvaluator = {
      evaluate: vi.fn().mockResolvedValue({ suppress: false, reason: '' }),
    };
    const deliveryTarget = {
      deliver: vi.fn().mockResolvedValue(true),
    };

    const notifier = new NotificationService(policyEvaluator, deliveryTarget);
    await notifier.start();

    const notification = await notifier.notifyDocumentChange(
      {
        docId: 'doc-1',
        title: 'Architecture Doc',
        changeClassification: 'substantive',
        overallSummary: 'Major restructuring of service boundaries.',
        sectionChanges: [{ section: 'Services', changeType: 'modified', description: 'Redesigned' }],
        userImpacts: [],
        actionRequired: true,
      },
      'user-1',
      'slack',
      'internal',
    );

    expect(notification.suppressed).toBe(false);
    expect(notification.urgency).toBe('high');
    expect(deliveryTarget.deliver).toHaveBeenCalledTimes(1);
  });

  it('reports healthy status when running', async () => {
    const notifier = new NotificationService(
      { evaluate: vi.fn() },
      { deliver: vi.fn() },
    );

    await notifier.start();
    const health = await notifier.healthCheck();
    expect(health.status).toBe('healthy');

    await notifier.stop();
    const stoppedHealth = await notifier.healthCheck();
    expect(stoppedHealth.status).toBe('unhealthy');
  });

  it('delivers digest notifications', async () => {
    const deliveryTarget = {
      deliver: vi.fn().mockResolvedValue(true),
    };

    const notifier = new NotificationService(
      { evaluate: vi.fn() },
      deliveryTarget,
    );

    const notification = await notifier.notifyDigest(
      {
        id: 'digest-1',
        userId: 'user-1',
        frequency: 'daily',
        generatedAt: new Date().toISOString(),
        entries: [],
        totalItems: 10,
        skippedItems: 3,
        classificationCeiling: 'internal',
      },
      'slack',
      'internal',
    );

    expect(notification.type).toBe('digest');
    expect(notification.urgency).toBe('normal');
    expect(deliveryTarget.deliver).toHaveBeenCalled();
  });
});

// --- Change Summarizer ---

describe('ChangeSummarizer', () => {
  it('summarizes section-level changes', () => {
    const summarizer = new ChangeSummarizer();
    const detection = {
      docId: 'doc-1',
      title: 'API Guide',
      changeClassification: 'substantive' as const,
      previousVersion: 'v1',
      currentVersion: 'v2',
      classification: 'internal' as const,
      lastModifiedBy: 'alice@example.com',
      lastModifiedAt: new Date().toISOString(),
      diffAvailable: true,
      addedLines: 10,
      removedLines: 5,
      modifiedLines: 3,
    };

    const oldContent = '# Overview\nOld overview content\n# Endpoints\nGET /users';
    const newContent = '# Overview\nNew overview content\n# Endpoints\nGET /users\nPOST /users\n# Authentication\nBearer tokens required';

    const result = summarizer.summarize(detection, oldContent, newContent, [
      {
        userId: 'user-1',
        role: 'engineer',
        team: 'api team',
        activeProjects: ['auth'],
        referencedDocs: ['doc-1'],
      },
    ]);

    expect(result.sectionChanges.length).toBeGreaterThan(0);
    expect(result.actionRequired).toBe(true);
    expect(result.userImpacts).toHaveLength(1);
    expect(result.userImpacts[0]!.impactLevel).toBe('high'); // references doc-1
  });
});
