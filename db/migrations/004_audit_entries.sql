CREATE TABLE IF NOT EXISTS audit.audit_entries (
  id VARCHAR(26) NOT NULL, -- ULID
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('tool_invocation', 'data_access', 'model_call', 'policy_decision', 'agent_exchange', 'policy_change')),
  action_detail JSONB NOT NULL DEFAULT '{}',
  data_accessed JSONB NOT NULL DEFAULT '[]',
  model_used VARCHAR(255),
  model_tokens JSONB,
  data_classification VARCHAR(20) NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  policy_applied VARCHAR(255) NOT NULL,
  policy_result VARCHAR(20) NOT NULL CHECK (policy_result IN ('allow', 'deny', 'require_approval')),
  policy_reason TEXT NOT NULL DEFAULT '',
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'denied', 'error', 'pending_approval')),
  request_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for the next 12 months (extend as needed)
DO $$
DECLARE
  start_date DATE := DATE_TRUNC('month', NOW());
  partition_name TEXT;
  partition_start DATE;
  partition_end DATE;
BEGIN
  FOR i IN 0..11 LOOP
    partition_start := start_date + (i || ' months')::INTERVAL;
    partition_end := start_date + ((i + 1) || ' months')::INTERVAL;
    partition_name := 'audit_entries_' || TO_CHAR(partition_start, 'YYYY_MM');

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_entries FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );
  END LOOP;
END $$;

CREATE INDEX idx_audit_tenant_user_ts ON audit.audit_entries (tenant_id, user_id, timestamp DESC);
CREATE INDEX idx_audit_tenant_action_ts ON audit.audit_entries (tenant_id, action_type, timestamp DESC);
CREATE INDEX idx_audit_request_id ON audit.audit_entries (request_id);

-- Prevent UPDATE and DELETE via a trigger (append-only enforcement)
CREATE OR REPLACE FUNCTION audit.prevent_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit entries are immutable. UPDATE and DELETE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_entries_no_update
  BEFORE UPDATE ON audit.audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_mutation();

CREATE TRIGGER audit_entries_no_delete
  BEFORE DELETE ON audit.audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_mutation();
