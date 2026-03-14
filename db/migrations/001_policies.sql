CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('enterprise', 'org', 'team', 'user')),
  scope_id VARCHAR(255) NOT NULL,
  domain VARCHAR(20) NOT NULL CHECK (domain IN ('models', 'actions', 'integrations', 'agent-to-agent', 'features', 'data', 'audit')),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'deprecated')),
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_reason TEXT NOT NULL
);

CREATE INDEX idx_policies_scope_domain ON policies (scope, scope_id, domain, status);
CREATE INDEX idx_policies_status ON policies (status);
