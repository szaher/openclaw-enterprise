import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import { API_BASE_PATH } from '@openclaw-enterprise/shared/constants.js';
import { AutoResponseHook } from './hooks.js';
import type { AutoResponseScopeConfig } from './hooks.js';
import { AutoResponseSummarizer } from './responder/summary.js';

export function activate(api: OpenClawPluginAPI): void {
  // Gateway methods are resolved at runtime via OpenClaw's inter-plugin gateway.
  const gateway = {} as GatewayMethods;

  const hook = new AutoResponseHook(gateway);
  const summarizer = new AutoResponseSummarizer();
  const approvalQueue = hook.getApprovalQueue();

  // Hook: incoming messages routed through classifier -> policy -> responder/queue
  api.registerHook(hook.getHookRegistration());

  // Gateway method: list pending approval queue items
  api.registerGatewayMethod({
    name: 'auto-response.listPending',
    handler: async (params) => {
      const p = params as { userId: string };
      return approvalQueue.listPending(p.userId);
    },
  });

  // Gateway method: approve a pending response
  api.registerGatewayMethod({
    name: 'auto-response.approve',
    handler: async (params) => {
      const p = params as { id: string; tenantId: string; userId: string };
      return approvalQueue.approve(p.id, p.tenantId, p.userId);
    },
  });

  // Gateway method: reject a pending response
  api.registerGatewayMethod({
    name: 'auto-response.reject',
    handler: async (params) => {
      const p = params as { id: string; tenantId: string; userId: string };
      return approvalQueue.reject(p.id, p.tenantId, p.userId);
    },
  });

  // Gateway method: get auto-response summary for briefings
  api.registerGatewayMethod({
    name: 'auto-response.getSummary',
    handler: async (params) => {
      const p = params as { since: string; userId: string };
      const pendingCount = approvalQueue.pendingCount(p.userId);
      return summarizer.getSummary(p.since, pendingCount);
    },
  });

  // Gateway method: update scope configuration (from policy hot-reload)
  api.registerGatewayMethod({
    name: 'auto-response.updateScopeConfig',
    handler: async (params) => {
      const config = params as unknown as AutoResponseScopeConfig;
      hook.updateScopeConfig(config);
      return { updated: true };
    },
  });

  // HTTP route: list pending approvals
  api.registerHttpRoute({
    method: 'GET',
    path: `${API_BASE_PATH}/auto-response/pending`,
    handler: async (req, res) => {
      const request = req as { query: { userId: string } };
      const response = res as { status: (code: number) => { json: (data: unknown) => void } };
      const items = approvalQueue.listPending(request.query.userId);
      response.status(200).json({ items });
    },
  });

  // HTTP route: approve a pending response
  api.registerHttpRoute({
    method: 'POST',
    path: `${API_BASE_PATH}/auto-response/approve`,
    handler: async (req, res) => {
      const request = req as { body: { id: string; tenantId: string; userId: string } };
      const response = res as { status: (code: number) => { json: (data: unknown) => void } };
      try {
        const result = await approvalQueue.approve(
          request.body.id,
          request.body.tenantId,
          request.body.userId,
        );
        response.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        response.status(404).json({ error: message });
      }
    },
  });

  // HTTP route: reject a pending response
  api.registerHttpRoute({
    method: 'POST',
    path: `${API_BASE_PATH}/auto-response/reject`,
    handler: async (req, res) => {
      const request = req as { body: { id: string; tenantId: string; userId: string } };
      const response = res as { status: (code: number) => { json: (data: unknown) => void } };
      try {
        const result = await approvalQueue.reject(
          request.body.id,
          request.body.tenantId,
          request.body.userId,
        );
        response.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        response.status(404).json({ error: message });
      }
    },
  });
}
