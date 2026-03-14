import { readFileSync } from 'node:fs';
import type { TlsOptions } from 'node:tls';

export interface MtlsConfig {
  certPath: string;
  keyPath: string;
  caPath: string;
}

export function loadMtlsConfig(): MtlsConfig {
  return {
    certPath: process.env['MTLS_CERT_PATH'] ?? '/etc/openclaw/tls/tls.crt',
    keyPath: process.env['MTLS_KEY_PATH'] ?? '/etc/openclaw/tls/tls.key',
    caPath: process.env['MTLS_CA_PATH'] ?? '/etc/openclaw/tls/ca.crt',
  };
}

export function createTlsOptions(config: MtlsConfig): TlsOptions {
  return {
    cert: readFileSync(config.certPath),
    key: readFileSync(config.keyPath),
    ca: readFileSync(config.caPath),
    requestCert: true,
    rejectUnauthorized: true,
  };
}

export function getOpaBaseUrl(): string {
  const useTls = process.env['OPA_USE_TLS'] === 'true';
  const host = process.env['OPA_HOST'] ?? 'localhost';
  const port = process.env['OPA_PORT'] ?? '8181';
  const protocol = useTls ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}
