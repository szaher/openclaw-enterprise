CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority_score SMALLINT NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  status VARCHAR(20) NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'active', 'completed', 'archived', 'purged')),
  sources JSONB NOT NULL DEFAULT '[]',
  correlation_id UUID,
  correlation_confidence REAL CHECK (correlation_confidence IS NULL OR (correlation_confidence >= 0 AND correlation_confidence <= 1)),
  deadline TIMESTAMPTZ,
  urgency_signals JSONB NOT NULL DEFAULT '{}',
  classification VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  purge_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_user_status_priority ON tasks (user_id, status, priority_score DESC);
CREATE INDEX idx_tasks_purge_at ON tasks (purge_at) WHERE purge_at IS NOT NULL;
CREATE INDEX idx_tasks_correlation ON tasks (correlation_id) WHERE correlation_id IS NOT NULL;
