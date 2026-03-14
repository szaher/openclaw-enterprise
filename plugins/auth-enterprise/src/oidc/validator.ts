// ============================================================================
// OpenClaw Enterprise — OIDC Token Validator (T046)
// ============================================================================

/**
 * Claims extracted from a validated OIDC JWT token.
 */
export interface OIDCClaims {
  /** Subject identifier */
  sub: string;
  /** User email address */
  email: string;
  /** User display name */
  name: string;
  /** Group memberships from the IdP */
  groups: string[];
  /** Organizational unit */
  org_unit: string;
  /** Roles assigned by the IdP */
  roles: string[];
  /** Token issuer URL */
  iss: string;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
  /** Issued-at timestamp (seconds since epoch) */
  iat: number;
}

/**
 * Configuration for the OIDC validator.
 */
export interface OIDCValidatorConfig {
  /** OIDC issuer URL (e.g. https://idp.example.com/realms/enterprise) */
  issuerUrl: string;
  /** JWKS endpoint for public key retrieval */
  jwksEndpoint: string;
  /** Expected audience claim */
  audience: string;
  /** Clock skew tolerance in seconds (default: 30) */
  clockSkewSeconds?: number;
}

/**
 * Represents a JSON Web Key from the JWKS endpoint.
 */
interface JWK {
  kty: string;
  kid: string;
  use?: string;
  n?: string;
  e?: string;
  alg?: string;
}

interface JWKSResponse {
  keys: JWK[];
}

/** Cache for fetched JWKS keys */
let jwksCache: JWKSResponse | null = null;
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 3600_000; // 1 hour

/**
 * Fetches the JWKS from the configured endpoint, with caching.
 */
async function fetchJWKS(jwksEndpoint: string): Promise<JWKSResponse> {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache;
  }

  const response = await fetch(jwksEndpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksEndpoint}: ${response.status}`);
  }

  jwksCache = (await response.json()) as JWKSResponse;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
  return jwksCache;
}

/**
 * Decodes a base64url-encoded string.
 */
function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddedFull = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return atob(paddedFull);
}

/**
 * Parses the JWT header without verification.
 */
function parseJwtHeader(token: string): { alg: string; kid?: string; typ?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts');
  }
  const headerJson = base64UrlDecode(parts[0]!);
  return JSON.parse(headerJson) as { alg: string; kid?: string; typ?: string };
}

/**
 * Parses the JWT payload without verification.
 */
function parseJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts');
  }
  const payloadJson = base64UrlDecode(parts[1]!);
  return JSON.parse(payloadJson) as Record<string, unknown>;
}

/**
 * Imports a JWK as a CryptoKey for signature verification.
 */
async function importJWK(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Verifies the JWT signature using the JWKS-sourced public key.
 */
async function verifySignature(token: string, jwksEndpoint: string): Promise<void> {
  const header = parseJwtHeader(token);
  const jwks = await fetchJWKS(jwksEndpoint);

  const matchingKey = jwks.keys.find((k) => k.kid === header.kid);
  if (!matchingKey) {
    throw new Error(`No matching JWK found for kid: ${header.kid}`);
  }

  const key = await importJWK(matchingKey);
  const parts = token.split('.');
  const encoder = new TextEncoder();
  const data = encoder.encode(`${parts[0]!}.${parts[1]!}`);
  const signatureRaw = base64UrlDecode(parts[2]!);
  const signatureBytes = Uint8Array.from(signatureRaw, (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, data);
  if (!valid) {
    throw new Error('Invalid JWT signature');
  }
}

/**
 * Validates an OIDC JWT token: verifies signature, expiry, and issuer.
 *
 * @param token - The raw JWT string (without "Bearer " prefix)
 * @param config - OIDC validator configuration
 * @returns Parsed and validated OIDC claims
 * @throws Error if the token is invalid, expired, or from an untrusted issuer
 */
export async function validateToken(
  token: string,
  config: OIDCValidatorConfig,
): Promise<OIDCClaims> {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is required');
  }

  // 1. Verify signature against JWKS
  await verifySignature(token, config.jwksEndpoint);

  // 2. Parse payload
  const payload = parseJwtPayload(token);

  // 3. Validate issuer
  if (payload['iss'] !== config.issuerUrl) {
    throw new Error(
      `Invalid issuer: expected ${config.issuerUrl}, got ${String(payload['iss'])}`,
    );
  }

  // 4. Validate expiry
  const now = Math.floor(Date.now() / 1000);
  const clockSkew = config.clockSkewSeconds ?? 30;
  const exp = payload['exp'] as number | undefined;
  if (!exp || now > exp + clockSkew) {
    throw new Error('Token has expired');
  }

  // 5. Validate issued-at is not in the future
  const iat = payload['iat'] as number | undefined;
  if (iat && iat > now + clockSkew) {
    throw new Error('Token issued in the future');
  }

  // 6. Build claims
  const claims: OIDCClaims = {
    sub: String(payload['sub'] ?? ''),
    email: String(payload['email'] ?? ''),
    name: String(payload['name'] ?? ''),
    groups: Array.isArray(payload['groups']) ? (payload['groups'] as string[]) : [],
    org_unit: String(payload['org_unit'] ?? ''),
    roles: Array.isArray(payload['roles']) ? (payload['roles'] as string[]) : [],
    iss: String(payload['iss'] ?? ''),
    exp: Number(payload['exp'] ?? 0),
    iat: Number(payload['iat'] ?? 0),
  };

  return claims;
}

/**
 * Clears the cached JWKS (useful for testing).
 */
export function clearJWKSCache(): void {
  jwksCache = null;
  jwksCacheExpiry = 0;
}
