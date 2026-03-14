import type { ConnectorReadResult, ConnectorType } from '@openclaw-enterprise/shared/types.js';

/**
 * Raw news item discovered from a monitored channel or email list.
 */
export interface RawNewsItem {
  id: string;
  source: ConnectorType | string;
  sourceId: string;
  title: string;
  body: string;
  author: string;
  channel: string;
  url: string;
  classification: ConnectorReadResult['items'][0]['classification'];
  metadata: Record<string, unknown>;
  publishedAt: string;
  discoveredAt: string;
}

/**
 * Interface for connectors that can provide news items.
 */
export interface NewsConnectorReader {
  type: ConnectorType;
  read(params: Record<string, unknown>): Promise<ConnectorReadResult>;
}

/**
 * Configuration for monitored news sources.
 */
export interface MonitoredSource {
  connectorType: ConnectorType;
  channel: string;
  filters?: Record<string, unknown>;
}

/**
 * Org News Aggregator.
 * Scans monitored channels and email lists via connector read tools
 * to discover organizational news items.
 */
export class OrgNewsAggregator {
  constructor(
    private readonly connectors: NewsConnectorReader[],
    private readonly monitoredSources: MonitoredSource[],
  ) {}

  /**
   * Scan all monitored sources and return raw news items.
   * Connectors that fail are skipped (graceful degradation).
   */
  async aggregate(): Promise<RawNewsItem[]> {
    const items: RawNewsItem[] = [];

    const results = await Promise.allSettled(
      this.monitoredSources.map(async (source) => {
        const connector = this.connectors.find((c) => c.type === source.connectorType);
        if (!connector) {
          return { source, result: null };
        }

        const result = await connector.read({
          channel: source.channel,
          ...source.filters,
        });

        return { source, result };
      }),
    );

    for (const settled of results) {
      if (settled.status === 'rejected') {
        continue; // Graceful degradation — skip unavailable sources
      }

      const { source, result } = settled.value;
      if (!result || result.connectorStatus === 'error') {
        continue;
      }

      for (const item of result.items) {
        items.push(this.toRawNewsItem(source, item));
      }
    }

    return items;
  }

  private toRawNewsItem(
    source: MonitoredSource,
    item: ConnectorReadResult['items'][0],
  ): RawNewsItem {
    return {
      id: crypto.randomUUID(),
      source: source.connectorType,
      sourceId: item.sourceId,
      title: item.title,
      body: item.summary,
      author: (item.metadata['author'] as string) ?? 'unknown',
      channel: source.channel,
      url: item.url,
      classification: item.classification,
      metadata: item.metadata,
      publishedAt: item.timestamp,
      discoveredAt: new Date().toISOString(),
    };
  }
}
