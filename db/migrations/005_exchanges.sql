CREATE TABLE IF NOT EXISTS exchanges (
  exchange_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  initiator_agent_id VARCHAR(255) NOT NULL,
  initiator_user_id VARCHAR(255) NOT NULL,
  responder_agent_id VARCHAR(255) NOT NULL,
  responder_user_id VARCHAR(255) NOT NULL,
  exchange_type VARCHAR(30) NOT NULL CHECK (exchange_type IN ('information_query', 'commitment_request', 'meeting_scheduling')),
  current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round >= 1),
  max_rounds INTEGER NOT NULL DEFAULT 3 CHECK (max_rounds >= 1),
  classification_level VARCHAR(20) NOT NULL CHECK (classification_level IN ('public', 'internal', 'confidential', 'restricted')),
  outcome VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (outcome IN ('in_progress', 'resolved', 'escalated', 'denied', 'expired')),
  escalation_reason TEXT,
  data_shared JSONB NOT NULL DEFAULT '[]',
  data_withheld JSONB NOT NULL DEFAULT '[]',
  policy_applied VARCHAR(255) NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  channel VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT check_round_limit CHECK (current_round <= max_rounds + 1)
);

CREATE INDEX idx_exchanges_initiator ON exchanges (initiator_user_id, started_at DESC);
CREATE INDEX idx_exchanges_responder ON exchanges (responder_user_id, started_at DESC);
CREATE INDEX idx_exchanges_conversation ON exchanges (conversation_id);
