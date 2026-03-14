/**
 * Shared health check interface and utilities.
 * Every plugin implements healthCheck() via this contract.
 * The gateway aggregates all plugin health checks into GET /api/v1/status.
 */

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'stopped';
  detail?: string;
  lastChecked?: string;
  dependencies?: Record<string, HealthCheckResult>;
}

export interface PluginHealthProvider {
  name: string;
  healthCheck: () => Promise<HealthCheckResult>;
}

/**
 * Aggregate health check results from multiple plugins.
 * Overall status is the worst status across all plugins.
 */
export function aggregateHealth(
  results: Record<string, HealthCheckResult>,
): HealthCheckResult {
  const statuses = Object.values(results).map((r) => r.status);

  let overall: HealthCheckResult['status'] = 'healthy';
  if (statuses.includes('unhealthy')) {
    overall = 'unhealthy';
  } else if (statuses.includes('degraded') || statuses.includes('disabled')) {
    overall = 'degraded';
  }

  return {
    status: overall,
    lastChecked: new Date().toISOString(),
    dependencies: results,
  };
}

/**
 * Create a standard health check handler for a plugin.
 * Wraps the check with timeout and error handling.
 */
export async function safeHealthCheck(
  provider: PluginHealthProvider,
  timeoutMs = 5000,
): Promise<HealthCheckResult> {
  try {
    const result = await Promise.race([
      provider.healthCheck(),
      new Promise<HealthCheckResult>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs),
      ),
    ]);
    return { ...result, lastChecked: new Date().toISOString() };
  } catch (error) {
    return {
      status: 'unhealthy',
      detail: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}
