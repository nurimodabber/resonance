import { jsonResponse } from './_lib/auth';
import { getRatings, isBlobConfigured, RATINGS_PATH, writeJsonBlob } from './_lib/store';
import type { CardRating } from '../src/types/deck';

export async function POST(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }

  try {
    const body = (await request.json()) as {
      cardId?: unknown;
      vote?: unknown;
      sessionId?: unknown;
    };
    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const vote = body.vote === 1 ? 1 : body.vote === -1 ? -1 : null;

    if (!cardId || cardId.length > 80 || !sessionId || sessionId.length > 100 || vote === null) {
      return jsonResponse({ error: 'Invalid rating payload.' }, 400);
    }

    const existing = await getRatings();
    const now = new Date().toISOString();
    const nextEntry: CardRating = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cardId,
      vote,
      sessionId,
      createdAt: now,
    };

    const filtered = existing.filter(
      (r) => !(r.cardId === cardId && r.sessionId === sessionId),
    );
    const updated = [nextEntry, ...filtered].slice(0, 5000);
    await writeJsonBlob(RATINGS_PATH, updated);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('[api/ratings] POST failed:', err);
    return jsonResponse({ error: 'Failed to record rating.' }, 500);
  }
}
