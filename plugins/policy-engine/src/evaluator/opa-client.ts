import { OPA_SIDECAR_URL, OPA_EVALUATE_TIMEOUT_MS } from '@openclaw-enterprise/shared/constants.js';
import { PolicyEngineUnreachableError } from '@openclaw-enterprise/shared/errors.js';

export interface OpaEvaluateInput {
  tenant_id: string;
  user_id: string;
  action: string;
  data_classification: string;
  channel?: string;
  target_system?: string;
  additional?: Record<string, unknown>;
}

export interface OpaEvaluateResult {
  allow: boolean;
  require_approval: boolean;
  reason: string;
  constraints: Record<string, unknown>;
}

export class OpaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl?: string, timeoutMs?: number) {
    this.baseUrl = baseUrl ?? OPA_SIDECAR_URL;
    this.timeoutMs = timeoutMs ?? OPA_EVALUATE_TIMEOUT_MS;
  }

  async evaluate(policyPath: string, input: OpaEvaluateInput): Promise<OpaEvaluateResult> {
    const url = `${this.baseUrl}/v1/data/${policyPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PolicyEngineUnreachableError(
          `OPA returned status ${response.status}: ${response.statusText}`,
        );
      }

      const body = (await response.json()) as { result?: OpaEvaluateResult };

      if (!body.result) {
        // No result means no matching policy — default deny
        return {
          allow: false,
          require_approval: false,
          reason: 'No matching policy found. Default: deny.',
          constraints: {},
        };
      }

      return body.result;
    } catch (error: unknown) {
      if (error instanceof PolicyEngineUnreachableError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error';

      // Fail closed: if OPA is unreachable, deny everything
      throw new PolicyEngineUnreachableError(message);
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return { status: response.ok ? 'healthy' : 'unhealthy' };
    } catch {
      return { status: 'unreachable' };
    }
  }

  async loadPolicy(policyId: string, regoContent: string): Promise<void> {
    const url = `${this.baseUrl}/v1/policies/${policyId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: regoContent,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Failed to load policy ${policyId}: ${response.statusText}`);
    }
  }
}
