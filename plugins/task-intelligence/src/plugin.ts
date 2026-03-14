import type { OpenClawPluginAPI } from '../../policy-engine/src/openclaw-types.js';
import { TaskDiscoveryScanner } from './discovery/scanner.js';
import { TaskRetentionService } from './discovery/retention.js';

export function activate(api: OpenClawPluginAPI): void {
  const scanner = new TaskDiscoveryScanner([]);
  const retention = new TaskRetentionService({
    findByStatus: async () => [],
    updateStatus: async () => {},
    delete: async () => {},
  });

  api.registerService({
    name: 'task-retention',
    start: () => retention.start(),
    stop: () => retention.stop(),
    healthCheck: () => retention.healthCheck(),
  });

  api.registerTool({
    name: 'generate_briefing',
    description: 'Generate a prioritized daily briefing from all connected systems',
    parameters: {},
    execute: async () => {
      const tasks = await scanner.scan();
      return { taskCount: tasks.length };
    },
  });
}
