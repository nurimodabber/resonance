import {
  buildLogoutSetCookie,
  buildSessionSetCookie,
  getSessionSecret,
  hashPassword,
  isValidEmail,
  jsonResponse,
  normalizeEmail,
  requireAdmin,
  verifyPassword,
  verifySameOrigin,
  verifySessionFromRequest,
} from '../_lib/auth';
import {
  ADMIN_AUTH_PATH,
  type AdminAuthRecord,
  isBlobConfigured,
  readJsonBlob,
  writeJsonBlob,
} from '../_lib/store';

export async function GET(request: Request): Promise<Response> {
  const configured = isBlobConfigured() && Boolean(getSessionSecret());
  if (!configured) {
    return jsonResponse({
      configured: false,
      hasAdmin: false,
      authenticated: false,
      email: null,
    });
  }

  try {
    const [adminRecord, session] = await Promise.all([
      readJsonBlob<AdminAuthRecord>(ADMIN_AUTH_PATH),
      Promise.resolve(verifySessionFromRequest(request)),
    ]);

    return jsonResponse({
      configured: true,
      hasAdmin: Boolean(adminRecord),
      authenticated: Boolean(session),
      email: session?.email ?? null,
    });
  } catch (err) {
    console.error('[api/admin/auth] GET failed:', err);
    return jsonResponse({ error: 'Failed to read admin status.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ error: 'Cross-origin request rejected.' }, 403);
  }

  const secret = getSessionSecret();
  if (!secret || !isBlobConfigured()) {
    return jsonResponse({ error: 'Server storage or auth secret is not configured.' }, 503);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'logout') {
      return jsonResponse(
        { ok: true },
        200,
        { 'Set-Cookie': buildLogoutSetCookie(request) },
      );
    }

    if (action === 'setup') {
      const existing = await readJsonBlob<AdminAuthRecord>(ADMIN_AUTH_PATH);
      if (existing) {
        return jsonResponse(
          { error: 'Admin account is already claimed. Please sign in.' },
          403,
        );
      }

      const rawEmail = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!isValidEmail(rawEmail)) {
        return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
      }
      if (password.length < 8 || password.length > 200) {
        return jsonResponse(
          { error: 'Password must be between 8 and 200 characters.' },
          400,
        );
      }

      const email = normalizeEmail(rawEmail);
      const { hash, salt } = hashPassword(password);
      await writeJsonBlob(ADMIN_AUTH_PATH, {
        email,
        hash,
        salt,
        createdAt: new Date().toISOString(),
      } satisfies AdminAuthRecord);

      return jsonResponse(
        { ok: true, email },
        201,
        { 'Set-Cookie': buildSessionSetCookie(email, request, secret) },
      );
    }

    if (action === 'login') {
      const record = await readJsonBlob<AdminAuthRecord>(ADMIN_AUTH_PATH);
      if (!record) {
        return jsonResponse(
          { error: 'Admin account has not been created yet.' },
          404,
        );
      }

      const rawEmail = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const email = normalizeEmail(rawEmail);

      if (email !== record.email || !verifyPassword(password, record.salt, record.hash)) {
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }

      return jsonResponse(
        { ok: true, email: record.email },
        200,
        { 'Set-Cookie': buildSessionSetCookie(record.email, request, secret) },
      );
    }

    if (action === 'change-password') {
      const auth = requireAdmin(request);
      if (!auth.ok) return auth.response;

      const record = await readJsonBlob<AdminAuthRecord>(ADMIN_AUTH_PATH);
      if (!record) {
        return jsonResponse({ error: 'Admin record missing.' }, 404);
      }

      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

      if (!verifyPassword(currentPassword, record.salt, record.hash)) {
        return jsonResponse({ error: 'Current password is incorrect.' }, 401);
      }
      if (newPassword.length < 8 || newPassword.length > 200) {
        return jsonResponse(
          { error: 'New password must be between 8 and 200 characters.' },
          400,
        );
      }

      const { hash, salt } = hashPassword(newPassword);
      await writeJsonBlob(ADMIN_AUTH_PATH, {
        ...record,
        hash,
        salt,
      } satisfies AdminAuthRecord);

      return jsonResponse(
        { ok: true },
        200,
        { 'Set-Cookie': buildSessionSetCookie(record.email, request, secret) },
      );
    }

    return jsonResponse({ error: 'Unsupported auth action.' }, 400);
  } catch (err) {
    console.error('[api/admin/auth] POST failed:', err);
    return jsonResponse({ error: 'Authentication request failed.' }, 500);
  }
}
