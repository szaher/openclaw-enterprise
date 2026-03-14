import type { OpenClawPluginAPI } from './openclaw-types.js';
import type { AgentIdentity } from '@openclaw-enterprise/shared/types.js';
import type { GatewayMethods } from './exchange-log/gateway.js';
import { OcipHooks } from './hooks.js';

/**
 * OCIP Protocol Plugin — Agent-to-Agent Information Exchange
 *
 * Implements the OpenClaw Interchange Protocol (OCIP) for secure,
 * policy-governed communication between OpenClaw Enterprise agent instances.
 *
 * Features:
 * - OCIP envelope injection on outgoing sessions_send messages
 * - OCIP envelope parsing on incoming sessions_send messages
 * - Sender-side classification filtering
 * - Loop prevention with human escalation
 * - Commitment detection with mandatory human approval
 * - Cross-org policy enforcement (cross-enterprise blocked)
 * - Dual-sided exchange audit logging
 */
export function activate(api: OpenClawPluginAPI): void {
  // Gateway methods are resolved at runtime via OpenClaw's inter-plugin gateway.
  // Actual resolution happens when the gateway wires up plugin dependencies.
  const gateway = {} as GatewayMethods;

  // Local agent identity is configured at runtime from the gateway instance config.
  const localAgent: AgentIdentity = {
    instanceId: '',
    userId: '',
    tenantId: '',
    orgUnit: '',
    canReceiveQueries: true,
    canAutoRespond: true,
    canMakeCommitments: false,
    maxClassificationShared: 'internal',
    supportedExchangeTypes: ['information_query', 'commitment_request', 'meeting_scheduling'],
    maxRoundsAccepted: 3,
  };

  const ocipHooks = new OcipHooks({ localAgent, gateway });

  // Register OCIP hooks on sessions_send
  for (const hook of ocipHooks.getHookRegistrations()) {
    api.registerHook(hook);
  }
}
