// ============================================================================
// OpenClaw Enterprise — Shared Type Definitions
// ============================================================================

// --- Policy Types ---

export type PolicyScope = 'enterprise' | 'org' | 'team' | 'user';

export type PolicyDomain =
  | 'models'
  | 'actions'
  | 'integrations'
  | 'agent-to-agent'
  | 'features'
  | 'data'
  | 'audit';

export type PolicyStatus = 'active' | 'draft' | 'deprecated';

export interface Policy {
  id: string;
  scope: PolicyScope;
  scopeId: string;
  domain: PolicyDomain;
  name: string;
  version: string;
  content: string;
  status: PolicyStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  changeReason: string;
}

// --- Data Classification ---

export type DataClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export type ClassificationAssigner = 'connector_default' | 'ai_reclassification' | 'admin_override';

export interface DataClassification {
  dataRef: string;
  level: DataClassificationLevel;
  assignedBy: ClassificationAssigner;
  originalLevel: DataClassificationLevel | null;
  overrideBy: string | null;
  overrideReason: string | null;
  assessedAt: string;
}

// --- Action Autonomy ---

export type ActionAutonomyLevel = 'autonomous' | 'notify' | 'approve' | 'block';

// --- Connector Types ---

export type ConnectorType = 'gmail' | 'gcal' | 'jira' | 'github' | 'gdrive';

export type ConnectorPermission = 'read' | 'write' | 'admin';

export type ConnectorStatus = 'active' | 'disabled' | 'error';

export interface Connector {
  id: string;
  type: ConnectorType;
  tenantId: string;
  userId: string | null;
  permissions: ConnectorPermission;
  defaultClassification: DataClassificationLevel;
  status: ConnectorStatus;
  credentialsRef: string;
  lastSyncAt: string | null;
  errorDetails: string | null;
  config: Record<string, unknown>;
}

// --- Audit Types ---

export type AuditActionType =
  | 'tool_invocation'
  | 'data_access'
  | 'model_call'
  | 'policy_decision'
  | 'agent_exchange'
  | 'policy_change';

export type AuditOutcome = 'success' | 'denied' | 'error' | 'pending_approval';

export type PolicyResult = 'allow' | 'deny' | 'require_approval';

export interface AuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  timestamp: string;
  actionType: AuditActionType;
  actionDetail: Record<string, unknown>;
  dataAccessed: DataAccessRecord[];
  modelUsed: string | null;
  modelTokens: { input: number; output: number } | null;
  dataClassification: DataClassificationLevel;
  policyApplied: string;
  policyResult: PolicyResult;
  policyReason: string;
  outcome: AuditOutcome;
  requestId: string;
}

export interface DataAccessRecord {
  source: string;
  classification: DataClassificationLevel;
  purpose: string;
}

// --- Task Types ---

export type TaskStatus = 'discovered' | 'active' | 'completed' | 'archived' | 'purged';

export interface TaskSource {
  system: string;
  id: string;
  url: string;
}

export interface UrgencySignals {
  senderSeniority: number | null;
  followUpCount: number;
  slaTimer: string | null;
  blockingRelationships: string[];
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  priorityScore: number;
  status: TaskStatus;
  sources: TaskSource[];
  correlationId: string | null;
  correlationConfidence: number | null;
  deadline: string | null;
  urgencySignals: UrgencySignals;
  classification: DataClassificationLevel;
  discoveredAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  purgeAt: string | null;
}

// --- Exchange Types (OCIP) ---

export type ExchangeType = 'information_query' | 'commitment_request' | 'meeting_scheduling';

export type ExchangeOutcome = 'in_progress' | 'resolved' | 'escalated' | 'denied' | 'expired';

export type OcipMessageType = 'agent-generated' | 'agent-assisted' | 'human';

export type ReplyPolicy = 'agent-ok' | 'human-only' | 'no-reply-needed';

export interface AgentIdentity {
  instanceId: string;
  userId: string;
  tenantId: string;
  orgUnit: string;
  canReceiveQueries: boolean;
  canAutoRespond: boolean;
  canMakeCommitments: boolean;
  maxClassificationShared: DataClassificationLevel;
  supportedExchangeTypes: ExchangeType[];
  maxRoundsAccepted: number;
}

export interface Exchange {
  exchangeId: string;
  conversationId: string;
  initiatorAgentId: string;
  initiatorUserId: string;
  responderAgentId: string;
  responderUserId: string;
  exchangeType: ExchangeType;
  currentRound: number;
  maxRounds: number;
  classificationLevel: DataClassificationLevel;
  outcome: ExchangeOutcome;
  escalationReason: string | null;
  dataShared: Array<{ source: string; fields: string[] }>;
  dataWithheld: Array<{ reason: string; description: string }>;
  policyApplied: string;
  transcript: Record<string, unknown>[];
  channel: string;
  startedAt: string;
  endedAt: string | null;
}

// --- Briefing Types ---

export type DeliveryChannel = 'slack' | 'email' | 'web_ui';

export type NewsRelevance = 'must-read' | 'should-read' | 'nice-to-know' | 'skip';

export interface Briefing {
  id: string;
  userId: string;
  tenantId: string;
  generatedAt: string;
  tasks: Array<{ taskId: string; rank: number }>;
  timeBlocks: Array<{ start: string; end: string; taskId: string | null; label: string }>;
  autoResponseSummary: Record<string, unknown>;
  orgNewsItems: Array<{ title: string; relevance: NewsRelevance; source: string }>;
  docChangeAlerts: Array<{ docId: string; summary: string; impact: string }>;
  alerts: Array<{ type: string; message: string; severity: string }>;
  connectorStatus: Record<ConnectorType, 'ok' | 'partial' | 'error' | 'unreachable'>;
  deliveryChannel: DeliveryChannel;
  deliveredAt: string | null;
}

// --- RBAC Types ---

export type BuiltInRole = 'enterprise_admin' | 'org_admin' | 'team_lead' | 'user';

export interface UserContext {
  userId: string;
  email: string;
  roles: BuiltInRole[];
  orgUnit: string;
  tenantId: string;
  effectivePermissions: {
    canManagePolicies: boolean;
    policyScope: PolicyScope;
    canQueryAudit: boolean;
    auditScope: PolicyScope;
  };
}

// --- Connector Interface Contract ---

export interface ConnectorReadResult {
  items: Array<{
    id: string;
    source: string;
    sourceId: string;
    title: string;
    summary: string;
    classification: DataClassificationLevel;
    url: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }>;
  connectorStatus: 'ok' | 'partial' | 'error';
  errorDetail?: string;
}

export interface ConnectorWriteResult {
  success: boolean;
  sourceId: string;
  action: string;
  policyApplied: string;
  auditEntryId: string;
}

// --- Policy Evaluation Contract ---

export interface PolicyEvaluateRequest {
  tenantId: string;
  userId: string;
  action: string;
  context: {
    dataClassification: DataClassificationLevel;
    channel?: string;
    targetSystem?: string;
    additional?: Record<string, unknown>;
  };
}

export interface PolicyEvaluateResponse {
  decision: PolicyResult;
  policyApplied: string;
  reason: string;
  constraints: {
    maxClassification?: DataClassificationLevel;
    allowedTransitions?: string[];
    disclosureRequired?: boolean;
  };
}

// --- Classification Contract ---

export interface ClassifyRequest {
  connectorType: ConnectorType;
  contentSummary: string;
  sourceId: string;
}

export interface ClassifyResponse {
  classification: DataClassificationLevel;
  assignedBy: ClassificationAssigner;
  originalLevel: DataClassificationLevel | null;
  confidence: number;
}

// --- Message Classification (Auto-Response) ---

export type MessageClassification = 'critical' | 'needs-response' | 'informational' | 'noise';

// --- Document Change Types ---

export type ChangeClassification = 'cosmetic' | 'minor' | 'substantive' | 'critical';
