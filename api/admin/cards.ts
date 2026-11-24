import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getStacksOrSeed,
  SEED_CARDS,
  validateCardInput,
  writeJsonBlob,
} from '../_lib/store.js';
import type { CardItem } from '../../src/types/deck';

export async function POST(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'upsert';
    const [stacks, cards] = await Promise.all([getStacksOrSeed(), getCardsOrSeed()]);
    const validStackIds = new Set(stacks.map((s) => s.id));

    if (action === 'reseed') {
      const existingIds = new Set(cards.map((c) => c.id));
      const missing = SEED_CARDS.filter((c) => !existingIds.has(c.id));
      if (missing.length > 0) {
        await writeJsonBlob(CARDS_PATH, [...cards, ...missing]);
      }
      return jsonResponse({
        addedCount: missing.length,
        total: cards.length + missing.length,
      });
    }

    if (action === 'move') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const stackId = typeof body.stackId === 'string' ? body.stackId.trim() : '';
      if (!id || !validStackIds.has(stackId)) {
        return jsonResponse({ error: 'Valid card ID and stack ID are required.' }, 400);
      }

      const idx = cards.findIndex((c) => c.id === id);
      if (idx === -1) {
        return jsonResponse({ error: 'Card not found.' }, 404);
      }

      const updatedCard: CardItem = { ...cards[idx], stackId };
      const nextCards = cards.slice();
      nextCards[idx] = updatedCard;
      await writeJsonBlob(CARDS_PATH, nextCards);
      return jsonResponse({ card: updatedCard });
    }

    if (action === 'archive') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const archived = Boolean(body.archived);
      const idx = cards.findIndex((c) => c.id === id);
      if (idx === -1) {
        return jsonResponse({ error: 'Card not found.' }, 404);
      }

      const updatedCard: CardItem = { ...cards[idx], archived };
      const nextCards = cards.slice();
      nextCards[idx] = updatedCard;
      await writeJsonBlob(CARDS_PATH, nextCards);
      return jsonResponse({ card: updatedCard });
    }

    const parsed = validateCardInput(body.card ?? body, validStackIds);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const existingIdx = cards.findIndex((c) => c.id === parsed.card.id);
    const nextCards = cards.slice();
    if (existingIdx >= 0) {
      nextCards[existingIdx] = {
        ...nextCards[existingIdx],
        ...parsed.card,
        createdAt: nextCards[existingIdx].createdAt || parsed.card.createdAt,
      };
    } else {
      nextCards.unshift(parsed.card);
    }

    await writeJsonBlob(CARDS_PATH, nextCards);
    return jsonResponse({
      card: existingIdx >= 0 ? nextCards[existingIdx] : parsed.card,
    });
  } catch (err) {
    console.error('[api/admin/cards] POST failed:', err);
    return jsonResponse({ error: 'Failed to save card.' }, 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim() || '';
    if (!id) {
      return jsonResponse({ error: 'Card ID is required.' }, 400);
    }

    const cards = await getCardsOrSeed();
    const nextCards = cards.filter((c) => c.id !== id);
    if (nextCards.length === cards.length) {
      return jsonResponse({ error: 'Card not found.' }, 404);
    }

    await writeJsonBlob(CARDS_PATH, nextCards);
    return jsonResponse({ ok: true, deletedId: id });
  } catch (err) {
    console.error('[api/admin/cards] DELETE failed:', err);
    return jsonResponse({ error: 'Failed to delete card.' }, 500);
  }
}
