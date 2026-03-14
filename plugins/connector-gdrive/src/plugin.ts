import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared';
import { GDriveReadConnector } from './tools/read.js';
import type { GDriveApiClient } from './tools/read.js';
import { GDriveDocumentPoller } from './services/poller.js';
import type { GDriveChangesApiClient, GDriveChangeEvent } from './services/poller.js';

/**
 * Configuration for the GDrive connector plugin.
 * Provided at activation time by the host environment.
 */
export interface GDrivePluginConfig {
  tenantId: string;
  userId: string;
  apiClient: GDriveApiClient;
  changesApiClient: GDriveChangesApiClient;
  pollIntervalMs?: number;
}

/**
 * GDrive connector plugin entry point.
 *
 * Registers:
 * - gdrive_read tool: fetch a single document by ID
 * - gdrive_search tool: search documents by query
 * - gdrive-document-poller service: polls for document changes
 *
 * All data access goes through ConnectorBase.executeRead which enforces:
 * - Policy evaluation before access
 * - Classification of returned data
 * - Audit logging of every operation
 * - Ephemeral raw data handling (discarded after extraction)
 * - OAuth revocation detection
 */
export function activate(api: OpenClawPluginAPI, config: GDrivePluginConfig): void {
  // The gateway methods are injected at runtime by OpenClaw's plugin system.
  // We cast here because the actual gateway is wired by the host.
  const gateway = {
    'policy.evaluate': async (params) => {
      const result = await (api as unknown as { callGateway(name: string, params: unknown): Promise<unknown> })
        .callGateway('policy.evaluate', params);
      return result;
    },
    'policy.classify': async (params) => {
      const result = await (api as unknown as { callGateway(name: string, params: unknown): Promise<unknown> })
        .callGateway('policy.classify', params);
      return result;
    },
    'audit.log': async (params) => {
      const result = await (api as unknown as { callGateway(name: string, params: unknown): Promise<unknown> })
        .callGateway('audit.log', params);
      return result;
    },
  } as unknown as GatewayMethods;

  const connector = new GDriveReadConnector(
    gateway,
    config.tenantId,
    config.userId,
    config.apiClient,
  );

  // Register gdrive_read tool
  api.registerTool({
    name: 'gdrive_read',
    description:
      'Fetch a Google Drive document by ID. Returns structured data (title, summary, classification). Raw content is discarded after extraction.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The Google Drive file ID to read.',
        },
      },
      required: ['fileId'],
    },
    execute: async (params) => connector.read({ fileId: params['fileId'] as string }),
  });

  // Register gdrive_search tool
  api.registerTool({
    name: 'gdrive_search',
    description:
      'Search Google Drive documents by query. Returns structured results (title, summary, classification). Raw content is discarded after extraction.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for Google Drive.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10).',
        },
      },
      required: ['query'],
    },
    execute: async (params) =>
      connector.search({
        query: params['query'] as string,
        maxResults: params['maxResults'] as number | undefined,
      }),
  });

  // Register document change poller service
  const poller = new GDriveDocumentPoller({
    tenantId: config.tenantId,
    userId: config.userId,
    apiClient: config.changesApiClient,
    pollIntervalMs: config.pollIntervalMs,
    onChangeEvent: (event: GDriveChangeEvent) => {
      // Emit change events via OpenClaw's event system for org-intelligence to consume
      // The host plugin system routes these to interested subscribers
      void (api as unknown as { emit(event: string, data: unknown): void })
        .emit('connector.gdrive.change', event);
    },
  });

  api.registerService(poller.getServiceRegistration());
}
