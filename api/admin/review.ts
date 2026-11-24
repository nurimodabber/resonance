import { REVIEW_SUGGESTIONS } from '../../src/data/reviewSuggestions.js';
import { aggregateReviewStats } from '../../src/utils/reviewScoring.js';
import type { CardItem, Language } from '../../src/types/deck';
import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getReviewState,
  getStacksOrSeed,
  listAllReviewerRecords,
  REVIEW_STATE_PATH,
  writeJsonBlob,
} from '../_lib/store.js';

export async function GET(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const [stacks, cards, reviewers, reviewState] = await Promise.all([
      getStacksOrSeed(),
      getCardsOrSeed(),
      listAllReviewerRecords(),
      getReviewState(),
    ]);

    const sortedStacks = stacks.slice().sort((a, b) => a.ring - b.ring);
    const stats = aggregateReviewStats({
      suggestions: REVIEW_SUGGESTIONS,
      liveCards: cards,
      reviewers,
      promotedIds: reviewState.promotedIds,
      dismissedEditIds: reviewState.dismissedEditIds,
      preset: 'auto',
    });

    const reviewerSummaries = reviewers
      .map((r) => ({
        reviewerId: r.reviewerId,
        reviewerName: r.reviewerName,
        voteCount: Object.keys(r.votes || {}).length,
        editCount: Object.keys(r.edits || {}).length,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return jsonResponse({
      reviewerCount: reviewers.length,
      reviewers: reviewerSummaries,
      stacks: sortedStacks,
      stats,
      promotedIds: reviewState.promotedIds,
      dismissedEditIds: reviewState.dismissedEditIds,
    });
  } catch (err) {
    console.error('[api/admin/review] GET failed:', err);
    return jsonResponse({ error: 'Failed to load friend review summary.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    const [stacks, cards, reviewState] = await Promise.all([
      getStacksOrSeed(),
      getCardsOrSeed(),
      getReviewState(),
    ]);

    const validStackIds = new Set(stacks.map((s) => s.id));
    const suggestionMap = new Map(REVIEW_SUGGESTIONS.map((c) => [c.id, c]));

    if (action === 'promote') {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) {
        return jsonResponse({ error: 'Select at least one card to promote.' }, 400);
      }

      const existingIds = new Set(cards.map((c) => c.id));
      const nextCards = cards.slice();
      const promotedSet = new Set(reviewState.promotedIds);
      let addedCount = 0;

      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const source = suggestionMap.get(id);
        if (!source) continue;

        const targetStack =
          typeof entry.stackId === 'string' && validStackIds.has(entry.stackId.trim())
            ? entry.stackId.trim()
            : source.stackId;

        const deOverride =
          typeof entry.de === 'string' && entry.de.trim()
            ? entry.de.trim().slice(0, 2000)
            : source.de;
        const enOverride =
          typeof entry.en === 'string' && entry.en.trim()
            ? entry.en.trim().slice(0, 2000)
            : source.en;

        promotedSet.add(id);

        if (!existingIds.has(id)) {
          const promotedCard: CardItem = {
            ...source,
            stackId: targetStack,
            de: deOverride,
            en: enOverride,
            isCustom: true,
            archived: false,
            createdAt: new Date().toISOString(),
          };
          nextCards.unshift(promotedCard);
          existingIds.add(id);
          addedCount += 1;
        }
      }

      const nextState = {
        ...reviewState,
        promotedIds: [...promotedSet],
      };

      await Promise.all([
        writeJsonBlob(CARDS_PATH, nextCards),
        writeJsonBlob(REVIEW_STATE_PATH, nextState),
      ]);

      return jsonResponse({
        ok: true,
        addedCount,
        promotedIds: nextState.promotedIds,
      });
    }

    if (action === 'apply-edit') {
      const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
      const language: Language = body.language === 'de' ? 'de' : 'en';
      const newText = typeof body.newText === 'string' ? body.newText.trim() : '';
      const editId = typeof body.editId === 'string' ? body.editId.trim() : '';

      if (!cardId || !newText || newText.length > 2000) {
        return jsonResponse({ error: 'Valid card ID and updated text are required.' }, 400);
      }

      const dismissedSet = new Set(reviewState.dismissedEditIds);
      if (editId) dismissedSet.add(editId);

      const promotedSet = new Set(reviewState.promotedIds);
      const nextCards = cards.slice();
      const liveIdx = nextCards.findIndex((c) => c.id === cardId);

      if (liveIdx >= 0) {
        nextCards[liveIdx] = {
          ...nextCards[liveIdx],
          [language]: newText,
        };
      } else {
        const suggestion = suggestionMap.get(cardId);
        if (!suggestion) {
          return jsonResponse({ error: 'Card not found.' }, 404);
        }
        nextCards.unshift({
          ...suggestion,
          [language]: newText,
          isCustom: true,
          archived: false,
          createdAt: new Date().toISOString(),
        });
        promotedSet.add(cardId);
      }

      await Promise.all([
        writeJsonBlob(CARDS_PATH, nextCards),
        writeJsonBlob(REVIEW_STATE_PATH, {
          promotedIds: [...promotedSet],
          dismissedEditIds: [...dismissedSet],
        }),
      ]);

      return jsonResponse({ ok: true });
    }

    if (action === 'dismiss-edit') {
      const editId = typeof body.editId === 'string' ? body.editId.trim() : '';
      if (!editId) {
        return jsonResponse({ error: 'Edit ID is required.' }, 400);
      }

      const dismissedSet = new Set(reviewState.dismissedEditIds);
      dismissedSet.add(editId);

      await writeJsonBlob(REVIEW_STATE_PATH, {
        ...reviewState,
        dismissedEditIds: [...dismissedSet],
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unsupported admin review action.' }, 400);
  } catch (err) {
    console.error('[api/admin/review] POST failed:', err);
    return jsonResponse({ error: 'Failed to process review action.' }, 500);
  }
}
