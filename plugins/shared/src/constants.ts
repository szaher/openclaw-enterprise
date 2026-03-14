import type { ConnectorType, DataClassificationLevel } from './types.js';

// Policy hierarchy order (index 0 = highest authority)
export const POLICY_SCOPE_HIERARCHY = ['enterprise', 'org', 'team', 'user'] as const;

export const POLICY_DOMAINS = [
  'models',
  'actions',
  'integrations',
  'agent-to-agent',
  'features',
  'data',
  'audit',
] as const;

// Classification levels ordered from lowest to highest sensitivity
export const CLASSIFICATION_LEVELS: readonly DataClassificationLevel[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
] as const;

// Default classification per connector type
export const CONNECTOR_DEFAULT_CLASSIFICATION: Record<ConnectorType, DataClassificationLevel> = {
  gmail: 'internal',
  gcal: 'internal',
  jira: 'internal',
  github: 'public',
  gdrive: 'internal',
};

// Task correlation thresholds
export const CORRELATION_AUTO_MERGE_THRESHOLD = 0.8;
export const CORRELATION_POSSIBLY_RELATED_THRESHOLD = 0.5;

// Task retention (days)
export const TASK_ACTIVE_RETENTION_DAYS = 90;
export const TASK_ARCHIVE_AFTER_DAYS = 30;
export const TASK_PURGE_AFTER_ARCHIVE_DAYS = 90;

// Policy hot-reload
export const POLICY_HOT_RELOAD_INTERVAL_MS = 10_000;
export const POLICY_HOT_RELOAD_MAX_DELAY_MS = 60_000;

// Audit
export const AUDIT_MIN_RETENTION_YEARS = 1;
export const AUDIT_QUERY_TIMEOUT_MS = 10_000;
export const AUDIT_DEFAULT_PAGE_SIZE = 100;
export const AUDIT_MAX_PAGE_SIZE = 1000;

// OCIP defaults
export const OCIP_PROTOCOL_VERSION = '1.0';
export const OCIP_DEFAULT_MAX_ROUNDS = 3;

// OPA sidecar
export const OPA_SIDECAR_URL = 'http://localhost:8181';
export const OPA_EVALUATE_TIMEOUT_MS = 5_000;

// API versioning
export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

// AI disclosure label
export const AI_DISCLOSURE_LABEL = "Sent by user's OpenClaw assistant";
