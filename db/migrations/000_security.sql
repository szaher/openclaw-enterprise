-- OpenClaw Enterprise: Database Security Configuration
-- Ensures TLS connections and documents encryption requirements

-- Enforce SSL connections
-- Note: actual SSL cert configuration is done at PostgreSQL server level
-- This migration documents the requirements

COMMENT ON DATABASE current_database() IS
  'OpenClaw Enterprise database. Requires sslmode=verify-full for all connections. Data at rest encrypted with AES-256.';

-- Create separate schema for audit (logical separation within same database,
-- or separate database in production)
CREATE SCHEMA IF NOT EXISTS audit;
