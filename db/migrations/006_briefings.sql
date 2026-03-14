CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tasks JSONB NOT NULL DEFAULT '[]',
  time_blocks JSONB NOT NULL DEFAULT '[]',
  auto_response_summary JSONB NOT NULL DEFAULT '{}',
  org_news_items JSONB NOT NULL DEFAULT '[]',
  doc_change_alerts JSONB NOT NULL DEFAULT '[]',
  alerts JSONB NOT NULL DEFAULT '[]',
  connector_status JSONB NOT NULL DEFAULT '{}',
  delivery_channel VARCHAR(20) NOT NULL DEFAULT 'slack' CHECK (delivery_channel IN ('slack', 'email', 'web_ui')),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_briefings_user ON briefings (user_id, generated_at DESC);
CREATE INDEX idx_briefings_tenant ON briefings (tenant_id, generated_at DESC);
