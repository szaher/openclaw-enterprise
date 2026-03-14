import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { JiraWriteTools } from '../../connector-jira/src/tools/write.js';
import { TicketUpdater } from './updater/updater.js';
import {
  createWorkTrackingHooks,
  type ActivityRecord,
  type WorkTrackingHookConfig,
} from './hooks.js';
import { generateStandupSummary } from './standup/generator.js';

export function activate(api: OpenClawPluginAPI): void {
  // Gateway methods are resolved at runtime via OpenClaw's inter-plugin gateway.
  const gateway = {} as GatewayMethods;

  // Configuration — in production these come from policy/config
  const tenantId = '';
  const userId = '';
  const jiraBaseUrl = '';

  const config: WorkTrackingHookConfig = {
    defaultMergeTransition: undefined,
  };

  // Activity log for standup aggregation
  const activityLog: ActivityRecord[] = [];

  // Jira write operations via connector-jira
  const jiraWriteTools = new JiraWriteTools(
    gateway,
    tenantId,
    userId,
    jiraBaseUrl,
  );

  // Ticket updater for PR-to-Jira auto-updates
  const updater = new TicketUpdater(
    jiraWriteTools,
    gateway,
    tenantId,
    userId,
  );

  // Register hooks for GitHub webhook events
  const hooks = createWorkTrackingHooks(updater, config, activityLog);
  for (const hook of hooks) {
    api.registerHook(hook);
  }

  // Tool: standup_summary — Generate end-of-day standup summary
  api.registerTool({
    name: 'standup_summary',
    description:
      'Generate an end-of-day standup summary aggregating code activity, PR events, and Jira ticket updates.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User identifier' },
        date: {
          type: 'string',
          description: 'Date for the standup (ISO date, e.g., "2026-03-13"). Defaults to today.',
        },
      },
      required: ['userId'],
    },
    execute: async (params) => {
      const p = params as { userId: string; date?: string };
      const date = p.date ?? new Date().toISOString().split('T')[0]!;
      return generateStandupSummary(p.userId, date, activityLog);
    },
  });
}
