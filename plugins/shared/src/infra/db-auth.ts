export interface DatabaseConfig {
  connectionString: string;
  ssl: {
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export function loadDatabaseConfig(): DatabaseConfig {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sslMode = process.env['DATABASE_SSL_MODE'] ?? 'verify-full';

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: sslMode === 'verify-full',
      ca: process.env['DATABASE_CA_PATH'],
      cert: process.env['DATABASE_CERT_PATH'],
      key: process.env['DATABASE_KEY_PATH'],
    },
  };
}

export interface AuditDatabaseConfig extends DatabaseConfig {}

export function loadAuditDatabaseConfig(): AuditDatabaseConfig {
  const connectionString = process.env['AUDIT_DATABASE_URL'];
  if (!connectionString) {
    throw new Error('AUDIT_DATABASE_URL environment variable is required');
  }

  const sslMode = process.env['DATABASE_SSL_MODE'] ?? 'verify-full';

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: sslMode === 'verify-full',
      ca: process.env['DATABASE_CA_PATH'],
      cert: process.env['DATABASE_CERT_PATH'],
      key: process.env['DATABASE_KEY_PATH'],
    },
  };
}

export interface RedisConfig {
  url: string;
  tls: boolean;
}

export function loadRedisConfig(): RedisConfig {
  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('REDIS_URL environment variable is required');
  }

  return {
    url,
    tls: process.env['REDIS_TLS'] !== 'false',
  };
}
