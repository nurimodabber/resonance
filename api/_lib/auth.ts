import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'resonance_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export interface SessionPayload {
  email: string;
  iat: number;
  exp: number;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const trimmed = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) && trimmed.length <= 200;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return { hash: derived.toString('hex'), salt };
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHashHex: string,
): boolean {
  if (!password || !salt || !expectedHashHex) return false;
  try {
    const derived = scryptSync(password, salt, 64, SCRYPT_PARAMS);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signSessionToken(
  email: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = SESSION_TTL_MS,
): string {
  const payload: SessionPayload = {
    email: normalizeEmail(email),
    iat: nowMs,
    exp: nowMs + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): SessionPayload | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    if (
      typeof parsed.email !== 'string' ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= nowMs) return null;
    return { email: parsed.email, iat: parsed.iat, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET?.trim() || '';
}

export function verifySessionFromRequest(request: Request): SessionPayload | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token, secret);
}

function shouldUseSecureCookie(request: Request): boolean {
  if (process.env.VERCEL === '1') return true;
  if (request.headers.get('x-forwarded-proto') === 'https') return true;
  return request.url.startsWith('https://');
}

export function buildSessionSetCookie(
  email: string,
  request: Request,
  secret: string = getSessionSecret(),
): string {
  const token = signSessionToken(email, secret);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = shouldUseSecureCookie(request) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildLogoutSetCookie(request: Request): string {
  const secure = shouldUseSecureCookie(request) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function verifySameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite.toLowerCase() === 'cross-site') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const forwardedHost = request.headers.get('x-forwarded-host');
    const hostHeader = request.headers.get('host');
    const urlHost = new URL(request.url).host;
    const expectedHost = (forwardedHost || hostHeader || urlHost).toLowerCase();
    return originHost === expectedHost;
  } catch {
    return false;
  }
}

export function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

export function requireAdmin(
  request: Request,
): { ok: true; email: string } | { ok: false; response: Response } {
  const secret = getSessionSecret();
  if (!secret || !process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Server storage or auth secret is not configured.' }, 503),
    };
  }

  if (request.method !== 'GET' && !verifySameOrigin(request)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Cross-origin request rejected.' }, 403),
    };
  }

  const session = verifySessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Authentication required.' }, 401),
    };
  }

  return { ok: true, email: session.email };
}
