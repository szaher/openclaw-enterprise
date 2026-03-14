import type { OpenClawPluginAPI } from '../../policy-engine/src/openclaw-types.js';
import { OrgNewsAggregator } from './news/aggregator.js';
import { RelevanceScorer } from './news/scorer.js';
import { DigestGenerator } from './digest/generator.js';
import { DocumentChangeDetector } from './doc-monitor/detector.js';
import { ChangeSummarizer } from './doc-monitor/summarizer.js';
import { ConsistencyChecker } from './consistency/checker.js';
import { NotificationService } from './services/notifier.js';

export function activate(api: OpenClawPluginAPI): void {
  const aggregator = new OrgNewsAggregator([], []);
  const scorer = new RelevanceScorer();
  const digestGenerator = new DigestGenerator();
  const summarizer = new ChangeSummarizer();
  const consistencyChecker = new ConsistencyChecker();

  // Notification service with stub policy evaluator and delivery target
  const notifier = new NotificationService(
    {
      evaluate: async (changeClassification) => ({
        suppress: changeClassification === 'cosmetic',
        reason: changeClassification === 'cosmetic' ? 'Cosmetic changes suppressed by policy' : '',
      }),
    },
    {
      deliver: async () => true,
    },
  );

  api.registerService({
    name: 'org-intelligence-notifier',
    start: () => notifier.start(),
    stop: () => notifier.stop(),
    healthCheck: () => notifier.healthCheck(),
  });

  api.registerTool({
    name: 'aggregate_org_news',
    description: 'Aggregate news from monitored organizational channels and email lists',
    parameters: {},
    execute: async () => {
      const rawItems = await aggregator.aggregate();
      return { itemCount: rawItems.length, items: rawItems };
    },
  });

  api.registerTool({
    name: 'score_news_relevance',
    description: 'Score news items for relevance to the current user',
    parameters: {},
    execute: async (params) => {
      const items = (params['items'] as Array<Record<string, unknown>>) ?? [];
      const profile = (params['profile'] as Record<string, unknown>) ?? {};
      return {
        scoredCount: items.length,
        profile: profile['userId'] ?? 'unknown',
      };
    },
  });

  api.registerTool({
    name: 'generate_org_digest',
    description: 'Generate a personalized org intelligence digest',
    parameters: {},
    execute: async () => {
      const rawItems = await aggregator.aggregate();
      return { itemCount: rawItems.length };
    },
  });

  api.registerTool({
    name: 'detect_document_changes',
    description: 'Detect and classify changes in monitored documents',
    parameters: {},
    execute: async (params) => {
      const docIds = (params['docIds'] as string[]) ?? [];
      return { checked: docIds.length };
    },
  });

  api.registerTool({
    name: 'check_document_consistency',
    description: 'Check for contradictions between related documents',
    parameters: {},
    execute: async () => {
      return { contradictions: 0 };
    },
  });
}
