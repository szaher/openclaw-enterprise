CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('gmail', 'gcal', 'jira', 'github', 'gdrive')),
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  permissions VARCHAR(10) NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'write', 'admin')),
  default_classification VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (default_classification IN ('public', 'internal', 'confidential', 'restricted')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  credentials_ref VARCHAR(255) NOT NULL,
  last_sync_at TIMESTAMPTZ,
  error_details TEXT,
  config JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_connectors_tenant ON connectors (tenant_id, status);
CREATE INDEX idx_connectors_user ON connectors (user_id) WHERE user_id IS NOT NULL;
