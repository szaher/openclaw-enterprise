CREATE TABLE IF NOT EXISTS data_classifications (
  data_ref VARCHAR(500) PRIMARY KEY,
  level VARCHAR(20) NOT NULL CHECK (level IN ('public', 'internal', 'confidential', 'restricted')),
  assigned_by VARCHAR(30) NOT NULL CHECK (assigned_by IN ('connector_default', 'ai_reclassification', 'admin_override')),
  original_level VARCHAR(20) CHECK (original_level IN ('public', 'internal', 'confidential', 'restricted')),
  override_by VARCHAR(255),
  override_reason TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classifications_level ON data_classifications (level);
