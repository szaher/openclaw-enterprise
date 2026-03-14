export class OpenClawEnterpriseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'OpenClawEnterpriseError';
  }
}

export class PolicyEngineUnreachableError extends OpenClawEnterpriseError {
  constructor(detail?: string) {
    super(
      `Policy engine is unreachable. All actions denied (fail-closed).${detail ? ` ${detail}` : ''}`,
      'POLICY_ENGINE_UNREACHABLE',
    );
    this.name = 'PolicyEngineUnreachableError';
  }
}

export class PolicyDeniedError extends OpenClawEnterpriseError {
  constructor(
    public readonly action: string,
    public readonly policyApplied: string,
    public readonly reason: string,
  ) {
    super(`Action "${action}" denied by policy ${policyApplied}: ${reason}`, 'POLICY_DENIED');
    this.name = 'PolicyDeniedError';
  }
}

export class PolicyApprovalRequiredError extends OpenClawEnterpriseError {
  constructor(
    public readonly action: string,
    public readonly policyApplied: string,
    public readonly reason: string,
  ) {
    super(
      `Action "${action}" requires approval per policy ${policyApplied}: ${reason}`,
      'POLICY_APPROVAL_REQUIRED',
    );
    this.name = 'PolicyApprovalRequiredError';
  }
}

export class PolicyHierarchyViolationError extends OpenClawEnterpriseError {
  constructor(
    public readonly childScope: string,
    public readonly parentScope: string,
    public readonly detail: string,
  ) {
    super(
      `Policy at scope "${childScope}" cannot expand beyond parent scope "${parentScope}": ${detail}`,
      'POLICY_HIERARCHY_VIOLATION',
    );
    this.name = 'PolicyHierarchyViolationError';
  }
}

export class ClassificationViolationError extends OpenClawEnterpriseError {
  constructor(
    public readonly dataClassification: string,
    public readonly allowedMaximum: string,
    public readonly context: string,
  ) {
    super(
      `Data classified as "${dataClassification}" exceeds allowed maximum "${allowedMaximum}" for ${context}`,
      'CLASSIFICATION_VIOLATION',
    );
    this.name = 'ClassificationViolationError';
  }
}

export class ConnectorUnavailableError extends OpenClawEnterpriseError {
  constructor(
    public readonly connectorType: string,
    public readonly detail: string,
  ) {
    super(`Connector "${connectorType}" is unavailable: ${detail}`, 'CONNECTOR_UNAVAILABLE');
    this.name = 'ConnectorUnavailableError';
  }
}

export class OAuthRevocationError extends OpenClawEnterpriseError {
  constructor(public readonly connectorType: string) {
    super(
      `OAuth access revoked for connector "${connectorType}". Connector disabled.`,
      'OAUTH_REVOKED',
    );
    this.name = 'OAuthRevocationError';
  }
}

export class ExchangeRoundLimitError extends OpenClawEnterpriseError {
  constructor(
    public readonly exchangeId: string,
    public readonly maxRounds: number,
  ) {
    super(
      `Exchange "${exchangeId}" reached maximum round limit (${maxRounds}). Escalating to humans.`,
      'EXCHANGE_ROUND_LIMIT',
    );
    this.name = 'ExchangeRoundLimitError';
  }
}

export class CommitmentRequiresHumanError extends OpenClawEnterpriseError {
  constructor(public readonly exchangeId: string) {
    super(
      `Exchange "${exchangeId}" requires a commitment. Human approval is mandatory.`,
      'COMMITMENT_REQUIRES_HUMAN',
    );
    this.name = 'CommitmentRequiresHumanError';
  }
}

export class CrossEnterpriseBlockedError extends OpenClawEnterpriseError {
  constructor(
    public readonly sourceTenantId: string,
    public readonly targetTenantId: string,
  ) {
    super(
      `Cross-enterprise exchanges are blocked. Source: ${sourceTenantId}, Target: ${targetTenantId}`,
      'CROSS_ENTERPRISE_BLOCKED',
    );
    this.name = 'CrossEnterpriseBlockedError';
  }
}

export class AuditWriteError extends OpenClawEnterpriseError {
  constructor(detail: string) {
    super(`Failed to write audit entry: ${detail}`, 'AUDIT_WRITE_FAILED');
    this.name = 'AuditWriteError';
  }
}
