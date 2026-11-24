import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySameOrigin,
  verifySessionToken,
} from '../auth';

describe('admin auth cryptography helpers', () => {
  const secret = 'test-secret-key-at-least-32-bytes-long-for-hmac';

  it('hashes and verifies passwords cleanly with per-user salts', () => {
    const first = hashPassword('Evening-Pine-2026!');
    const second = hashPassword('Evening-Pine-2026!');
    expect(first.salt).not.toEqual(second.salt);
    expect(first.hash).not.toEqual(second.hash);

    expect(verifyPassword('Evening-Pine-2026!', first.salt, first.hash)).toBe(true);
    expect(verifyPassword('Wrong-Password', first.salt, first.hash)).toBe(false);
    expect(verifyPassword('', first.salt, first.hash)).toBe(false);
  });

  it('roundtrips signed session tokens and rejects tampered or expired tokens', () => {
    const now = 1_700_000_000_000;
    const token = signSessionToken('Milan.Modabber@gmail.com', secret, now, 60_000);

    const verified = verifySessionToken(token, secret, now + 10_000);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe('milan.modabber@gmail.com');

    // Wrong secret fails
    expect(verifySessionToken(token, 'other-secret', now + 10_000)).toBeNull();

    // Tampered payload fails
    const [payload, sig] = token.split('.');
    const tampered = `${payload}x.${sig}`;
    expect(verifySessionToken(tampered, secret, now + 10_000)).toBeNull();

    // Expired token fails
    expect(verifySessionToken(token, secret, now + 60_001)).toBeNull();
  });

  it('rejects cross-origin state-changing requests while accepting same-origin', () => {
    const sameOriginReq = new Request('https://resonance.vercel.app/api/admin/cards', {
      method: 'POST',
      headers: {
        host: 'resonance.vercel.app',
        origin: 'https://resonance.vercel.app',
      },
    });
    expect(verifySameOrigin(sameOriginReq)).toBe(true);

    const evilOriginReq = new Request('https://resonance.vercel.app/api/admin/cards', {
      method: 'POST',
      headers: {
        host: 'resonance.vercel.app',
        origin: 'https://evil.example',
      },
    });
    expect(verifySameOrigin(evilOriginReq)).toBe(false);
  });
});
