import type { OpenClawPluginAPI } from './openclaw-types.js';
import { OpaClient } from './evaluator/opa-client.js';
import { PolicyEvaluator } from './evaluator/evaluate.js';
import { PolicyResolveMethod } from './hierarchy/resolve-method.js';
import { DataClassifier } from './classification/classify.js';
import { PolicyHotReloadWatcher } from './hot-reload/watcher.js';
import { PolicyRoutes } from './routes.js';
import { PolicyEnforcementHook } from './hooks.js';

export function activate(api: OpenClawPluginAPI): void {
  const opaClient = new OpaClient();
  const evaluator = new PolicyEvaluator(opaClient);
  const classifier = new DataClassifier();

  // Gateway methods
  api.registerGatewayMethod({
    name: 'policy.evaluate',
    handler: async (params) => evaluator.evaluate(params as Parameters<typeof evaluator.evaluate>[0]),
  });

  api.registerGatewayMethod({
    name: 'policy.classify',
    handler: async (params) => classifier.classify(params as Parameters<typeof classifier.classify>[0]),
  });

  // Hook: enforce policy on every tool invocation
  const enforcementHook = new PolicyEnforcementHook(evaluator);
  api.registerHook(enforcementHook.getHookRegistration());

  // Service: hot-reload policy changes
  const watcher = new PolicyHotReloadWatcher(
    opaClient,
    async (_since: Date) => {
      // Placeholder: fetch updated policies from PostgreSQL
      return [];
    },
  );

  api.registerService({
    name: 'policy-hot-reload',
    start: () => watcher.start(),
    stop: () => watcher.stop(),
    healthCheck: () => watcher.healthCheck(),
  });
}
