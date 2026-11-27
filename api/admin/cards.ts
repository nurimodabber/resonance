import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getReviewState,
  getStacksOrSeed,
  REVIEW_STATE_PATH,
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
      const seedById = new Map(SEED_CARDS.map((c) => [c.id, c]));
      const staleUrls = new Set([
        'https://bibliothek.bahai.de/',
        'https://www.bahai.org/library',
        'https://www.bahai.org/library/',
        'https://www.bahai.org/library/authoritative-texts/compilations/importance-prayer-meditation-devotional-attitude/3',
        'https://bibliothek.bahai.de/pubReader.php?parLangUri=sho-adj-de-42',
        'https://bibliothek.bahai.de/pubReader.php?parLangUri=sho-adj-de-45',
        'https://bibliothek.bahai.de/pubReader.php?parLangUri=bah-gwb-de-136:1',
        'https://www.bahai.org/library/authoritative-texts/abdul-baha/selections-writings-abdul-baha/10',
        'https://bibliothek.bahai.de/pubReader.php?parLangUri=abd-swa-de-15:1',
        'https://www.bahai.org/library/authoritative-texts/the-universal-house-of-justice/messages/20100421_001/1',
      ]);
      const verifiedWordingSyncIds = new Set(['R1_C1_12', 'Q18', 'NB3', 'NB4']);

      let updatedCount = 0;
      const nextCards = cards.map((existing) => {
        const seed = seedById.get(existing.id);
        if (!seed || seed.kind !== 'quote') return existing;

        const metadataDiffers =
          existing.author !== seed.author ||
          existing.sourceLabelDe !== seed.sourceLabelDe ||
          existing.sourceLabelEn !== seed.sourceLabelEn ||
          existing.sourceUrlDe !== seed.sourceUrlDe ||
          existing.sourceUrlEn !== seed.sourceUrlEn;

        const hadUnverifiedUrl =
          (existing.sourceUrlDe && staleUrls.has(existing.sourceUrlDe)) ||
          (existing.sourceUrlEn && staleUrls.has(existing.sourceUrlEn));

        const syncVerbatimWording =
          verifiedWordingSyncIds.has(existing.id) && existing.de !== seed.de;

        if (!metadataDiffers && !hadUnverifiedUrl && !syncVerbatimWording) {
          return existing;
        }

        updatedCount += 1;
        return {
          ...existing,
          ...(hadUnverifiedUrl || syncVerbatimWording ? { de: seed.de, en: seed.en } : {}),
          author: seed.author,
          sourceLabelDe: seed.sourceLabelDe,
          sourceLabelEn: seed.sourceLabelEn,
          sourceUrlDe: seed.sourceUrlDe,
          sourceUrlEn: seed.sourceUrlEn,
        };
      });

      const existingIds = new Set(cards.map((c) => c.id));
      const missing = SEED_CARDS.filter((c) => !existingIds.has(c.id));
      const finalCards = missing.length > 0 ? [...nextCards, ...missing] : nextCards;

      if (missing.length > 0 || updatedCount > 0) {
        await writeJsonBlob(CARDS_PATH, finalCards);
      }
      return jsonResponse({
        addedCount: missing.length,
        updatedCount,
        total: finalCards.length,
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

    const [cards, reviewState] = await Promise.all([getCardsOrSeed(), getReviewState()]);
    const nextCards = cards.filter((c) => c.id !== id);
    if (nextCards.length === cards.length) {
      return jsonResponse({ error: 'Card not found.' }, 404);
    }

    const writes: Promise<void>[] = [writeJsonBlob(CARDS_PATH, nextCards)];
    if (reviewState.promotedIds.includes(id)) {
      writes.push(
        writeJsonBlob(REVIEW_STATE_PATH, {
          ...reviewState,
          promotedIds: reviewState.promotedIds.filter((pid) => pid !== id),
        }),
      );
    }
    await Promise.all(writes);
    return jsonResponse({ ok: true, deletedId: id });
  } catch (err) {
    console.error('[api/admin/cards] DELETE failed:', err);
    return jsonResponse({ error: 'Failed to delete card.' }, 500);
  }
}
