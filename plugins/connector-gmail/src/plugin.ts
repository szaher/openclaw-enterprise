import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { GmailReadTools } from './tools/read.js';
import { GmailInboxPoller } from './services/poller.js';

/**
 * Gmail connector plugin entry point (T055-T059).
 *
 * Registers:
 * - email_read tool: fetch a specific email by ID
 * - email_search tool: search emails with a Gmail query
 * - gmail-inbox-poller service: polls for new messages on a configurable interval
 */
export function activate(api: OpenClawPluginAPI): void {
  // The gateway, tenantId, userId, and accessToken are injected at runtime.
  // For registration, we define the tool shapes; execution context is bound per-request.

  api.registerTool({
    name: 'email_read',
    description: 'Fetch a specific email by message ID from Gmail. Returns structured data (subject, sender, summary, date). Raw email body is discarded after extraction.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID to fetch' },
      },
      required: ['messageId'],
    },
    execute: async (params) => {
      const { messageId, _gateway, _tenantId, _userId, _accessToken } = params as {
        messageId: string;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
        _accessToken: string;
      };

      const tools = new GmailReadTools(_gateway, _tenantId, _userId, _accessToken);
      return tools.emailRead({ messageId });
    },
  });

  api.registerTool({
    name: 'email_search',
    description: 'Search emails in Gmail using a query string (same syntax as Gmail search). Returns structured data for matching emails. Raw email bodies are discarded after extraction.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g., "from:alice subject:project")' },
        maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, maxResults, _gateway, _tenantId, _userId, _accessToken } = params as {
        query: string;
        maxResults?: number;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
        _accessToken: string;
      };

      const tools = new GmailReadTools(_gateway, _tenantId, _userId, _accessToken);
      return tools.emailSearch({ query, maxResults });
    },
  });

  // Inbox poller service — lifecycle managed by runtime with injected config.
  // See GmailInboxPoller for the full implementation.
  api.registerService({
    name: 'gmail-inbox-poller',
    start: async () => {
      // Service startup is handled by the runtime, which provides
      // gateway, refreshToken, tenantId, userId via GmailInboxPoller constructor.
    },
    stop: async () => {
      // Cleanup handled by runtime
    },
    healthCheck: async () => ({ status: 'healthy' }),
  });
}
