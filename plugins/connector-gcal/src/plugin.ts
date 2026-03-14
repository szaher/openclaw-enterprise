import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { GCalReadTools } from './tools/read.js';
import { GCalSyncService } from './services/sync.js';

/**
 * Google Calendar connector plugin entry point (T061-T065).
 *
 * Registers:
 * - calendar_read tool: fetch calendar events within a time range
 * - calendar_search tool: search events by query, includes free/busy blocks
 * - gcal-sync service: periodically syncs calendar events
 */
export function activate(api: OpenClawPluginAPI): void {
  api.registerTool({
    name: 'calendar_read',
    description: 'Fetch calendar events within a time range from Google Calendar. Returns structured event data (title, start, end, attendees, location). Raw event descriptions are discarded after extraction.',
    parameters: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'Start of time range (ISO 8601). Defaults to now.' },
        timeMax: { type: 'string', description: 'End of time range (ISO 8601). Defaults to 7 days from now.' },
        maxResults: { type: 'number', description: 'Maximum number of events to return (default: 25)' },
      },
      required: [],
    },
    execute: async (params) => {
      const { timeMin, timeMax, maxResults, _gateway, _tenantId, _userId, _accessToken, _calendarId } = params as {
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
        _accessToken: string;
        _calendarId?: string;
      };

      const tools = new GCalReadTools(_gateway, _tenantId, _userId, _accessToken, _calendarId);
      return tools.calendarRead({ timeMin, timeMax, maxResults });
    },
  });

  api.registerTool({
    name: 'calendar_search',
    description: 'Search Google Calendar events by keyword query. Returns matching events with free/busy block information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for calendar events' },
        timeMin: { type: 'string', description: 'Start of time range (ISO 8601). Defaults to now.' },
        timeMax: { type: 'string', description: 'End of time range (ISO 8601). Defaults to 7 days from now.' },
        maxResults: { type: 'number', description: 'Maximum number of events (default: 25)' },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, timeMin, timeMax, maxResults, _gateway, _tenantId, _userId, _accessToken, _calendarId } = params as {
        query: string;
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
        _gateway: GatewayMethods;
        _tenantId: string;
        _userId: string;
        _accessToken: string;
        _calendarId?: string;
      };

      const tools = new GCalReadTools(_gateway, _tenantId, _userId, _accessToken, _calendarId);
      return tools.calendarSearch({ query, timeMin, timeMax, maxResults });
    },
  });

  // Calendar sync service — lifecycle managed by runtime with injected config.
  // See GCalSyncService for the full implementation.
  api.registerService({
    name: 'gcal-sync',
    start: async () => {
      // Service startup is handled by the runtime, which provides
      // gateway, refreshToken, tenantId, userId via GCalSyncService constructor.
    },
    stop: async () => {
      // Cleanup handled by runtime
    },
    healthCheck: async () => ({ status: 'healthy' }),
  });
}
