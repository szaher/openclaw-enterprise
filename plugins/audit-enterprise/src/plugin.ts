import type { OpenClawPluginAPI } from './openclaw-types.js';
import { AuditWriter } from './writer/writer.js';
import type { DbPool } from './writer/writer.js';
import { createAuditLogHandler } from './writer/log-method.js';
import { createAuditQueryHandler } from './query/query-method.js';
import { createAuditRoutes } from './routes.js';

/**
 * Activate the audit-enterprise plugin.
 *
 * Registers:
 * - `audit.log` gateway method   (append-only audit writes)
 * - `audit.query` gateway method (filtered, paginated reads)
 * - REST routes under /api/v1/audit
 */
export function activate(api: OpenClawPluginAPI, db: DbPool): void {
  const writer = new AuditWriter(db);

  // Gateway methods
  api.registerGatewayMethod({
    name: 'audit.log',
    handler: createAuditLogHandler(writer),
  });

  const queryHandler = createAuditQueryHandler(db);
  api.registerGatewayMethod({
    name: 'audit.query',
    handler: queryHandler,
  });

  // REST routes
  const routes = createAuditRoutes(queryHandler, db);
  for (const route of routes) {
    api.registerHttpRoute(route);
  }
}
