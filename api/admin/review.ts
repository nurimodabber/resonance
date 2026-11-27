import { REVIEW_SUGGESTIONS } from '../../src/data/reviewSuggestions.js';
import { aggregateReviewStats } from '../../src/utils/reviewScoring.js';
import type { CardItem, CardKind, Language } from '../../src/types/deck';
import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getReviewState,
  getStacksOrSeed,
  listAllReviewerRecords,
  mergeSuggestionWithOverride,
  REVIEW_STATE_PATH,
  sanitizeHttpUrl,
  writeJsonBlob,
} from '../_lib/store.js';

function cleanOptField(val: unknown, max: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function extractSuggestionFields(
  entry: Record<string, unknown>,
  base: CardItem,
  resolveStackId: (candidate: unknown, fallback: string) => string,
): CardItem {
  const kindCandidate = entry.kind as CardKind;
  const kind: CardKind =
    kindCandidate === 'question' || kindCandidate === 'wildcard' || kindCandidate === 'quote'
      ? kindCandidate
      : base.kind;

  const stackId = resolveStackId(entry.stackId, base.stackId);

  const de =
    typeof entry.de === 'string' && entry.de.trim() ? entry.de.trim().slice(0, 2000) : base.de;
  const en =
    typeof entry.en === 'string' && entry.en.trim() ? entry.en.trim().slice(0, 2000) : base.en;

  const hasOpt = (key: string) => Object.prototype.hasOwnProperty.call(entry, key);

  const quoteSubdeck = hasOpt('quoteSubdeck')
    ? entry.quoteSubdeck === 'general' || entry.quoteSubdeck === 'ruhi'
      ? entry.quoteSubdeck
      : undefined
    : base.quoteSubdeck;

  const ruhiChapter = hasOpt('ruhiChapter')
    ? entry.ruhiChapter === 1 || entry.ruhiChapter === 2 || entry.ruhiChapter === 3
      ? entry.ruhiChapter
      : undefined
    : base.ruhiChapter;

  return {
    ...base,
    id: base.id,
    stackId,
    kind,
    de,
    en,
    digDeeperDe: hasOpt('digDeeperDe') ? cleanOptField(entry.digDeeperDe, 1000) : base.digDeeperDe,
    digDeeperEn: hasOpt('digDeeperEn') ? cleanOptField(entry.digDeeperEn, 1000) : base.digDeeperEn,
    quoteSubdeck: kind === 'quote' ? quoteSubdeck : undefined,
    ruhiChapter: kind === 'quote' && quoteSubdeck === 'ruhi' ? ruhiChapter : undefined,
    author: hasOpt('author') ? cleanOptField(entry.author, 200) : base.author,
    sourceLabelDe: hasOpt('sourceLabelDe')
      ? cleanOptField(entry.sourceLabelDe, 200)
      : base.sourceLabelDe,
    sourceLabelEn: hasOpt('sourceLabelEn')
      ? cleanOptField(entry.sourceLabelEn, 200)
      : base.sourceLabelEn,
    sourceUrlDe: hasOpt('sourceUrlDe') ? sanitizeHttpUrl(entry.sourceUrlDe) : base.sourceUrlDe,
    sourceUrlEn: hasOpt('sourceUrlEn') ? sanitizeHttpUrl(entry.sourceUrlEn) : base.sourceUrlEn,
    promptDe: hasOpt('promptDe') ? cleanOptField(entry.promptDe, 1000) : base.promptDe,
    promptEn: hasOpt('promptEn') ? cleanOptField(entry.promptEn, 1000) : base.promptEn,
  };
}

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
    const activeReviewers = reviewers.filter(
      (r) => Object.keys(r.votes || {}).length > 0 || Object.keys(r.edits || {}).length > 0,
    );
    const mergedSuggestions = REVIEW_SUGGESTIONS.map((s) =>
      mergeSuggestionWithOverride(s, reviewState.suggestionOverrides?.[s.id]),
    );
    const stats = aggregateReviewStats({
      suggestions: mergedSuggestions,
      liveCards: cards,
      reviewers: activeReviewers,
      promotedIds: reviewState.promotedIds,
      dismissedEditIds: reviewState.dismissedEditIds,
      preset: 'auto',
    });

    const reviewerSummaries = activeReviewers
      .map((r) => ({
        reviewerId: r.reviewerId,
        reviewerName: r.reviewerName,
        voteCount: Object.keys(r.votes || {}).length,
        editCount: Object.keys(r.edits || {}).length,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return jsonResponse({
      reviewerCount: activeReviewers.length,
      reviewers: reviewerSummaries,
      stacks: sortedStacks,
      stats,
      promotedIds: reviewState.promotedIds,
      dismissedEditIds: reviewState.dismissedEditIds,
      editedSuggestionIds: Object.keys(reviewState.suggestionOverrides || {}),
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
    const fallbackStackId = stacks.find((s) => !s.archived)?.id ?? stacks[0]?.id ?? 'warmup';
    const resolveStackId = (candidate: unknown, fallback: string): string => {
      if (typeof candidate === 'string' && validStackIds.has(candidate.trim())) {
        return candidate.trim();
      }
      return validStackIds.has(fallback) ? fallback : fallbackStackId;
    };
    const suggestionMap = new Map(REVIEW_SUGGESTIONS.map((c) => [c.id, c]));

    if (action === 'save-suggestion-draft') {
      const rawCard =
        body.card && typeof body.card === 'object'
          ? (body.card as Record<string, unknown>)
          : body;
      const id = typeof rawCard.id === 'string' ? rawCard.id.trim() : '';
      const source = suggestionMap.get(id);
      if (!source) {
        return jsonResponse({ error: 'Suggestion not found.' }, 404);
      }

      const rawDe = typeof rawCard.de === 'string' ? rawCard.de.trim() : '';
      const rawEn = typeof rawCard.en === 'string' ? rawCard.en.trim() : '';
      if (!rawDe || !rawEn) {
        return jsonResponse({ error: 'Both German and English card text are required.' }, 400);
      }

      const base = mergeSuggestionWithOverride(source, reviewState.suggestionOverrides?.[id]);
      const merged = extractSuggestionFields(rawCard, base, resolveStackId);

      const nextOverrides = {
        ...(reviewState.suggestionOverrides || {}),
        [id]: merged,
      };

      await writeJsonBlob(REVIEW_STATE_PATH, {
        ...reviewState,
        suggestionOverrides: nextOverrides,
      });

      return jsonResponse({ ok: true, card: merged });
    }

    if (action === 'promote') {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) {
        return jsonResponse({ error: 'Select at least one card to promote.' }, 400);
      }

      const nextCards = cards.slice();
      const promotedSet = new Set(reviewState.promotedIds);
      const dismissedSet = new Set(reviewState.dismissedEditIds);
      const nextOverrides = { ...(reviewState.suggestionOverrides || {}) };
      if (Array.isArray(body.dismissEditIds)) {
        for (const editId of body.dismissEditIds) {
          if (typeof editId === 'string' && editId.trim()) {
            dismissedSet.add(editId.trim());
          }
        }
      }
      let addedCount = 0;

      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const source = suggestionMap.get(id);
        if (!source) continue;

        const base = mergeSuggestionWithOverride(source, nextOverrides[id]);
        const resolved = extractSuggestionFields(entry, base, resolveStackId);

        promotedSet.add(id);
        delete nextOverrides[id];

        const existingIdx = nextCards.findIndex((c) => c.id === id);
        if (existingIdx < 0) {
          const promotedCard: CardItem = {
            ...resolved,
            isCustom: true,
            archived: false,
            createdAt: new Date().toISOString(),
          };
          nextCards.unshift(promotedCard);
          addedCount += 1;
        } else if (nextCards[existingIdx].archived) {
          nextCards[existingIdx] = {
            ...nextCards[existingIdx],
            ...resolved,
            archived: false,
          };
          addedCount += 1;
        }
      }

      const nextState = {
        ...reviewState,
        promotedIds: [...promotedSet],
        dismissedEditIds: [...dismissedSet],
        suggestionOverrides: nextOverrides,
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
      const nextOverrides = { ...(reviewState.suggestionOverrides || {}) };
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
        const base = mergeSuggestionWithOverride(suggestion, nextOverrides[cardId]);
        nextCards.unshift({
          ...base,
          stackId: resolveStackId(undefined, base.stackId),
          [language]: newText,
          isCustom: true,
          archived: false,
          createdAt: new Date().toISOString(),
        });
        promotedSet.add(cardId);
        delete nextOverrides[cardId];
      }

      await Promise.all([
        writeJsonBlob(CARDS_PATH, nextCards),
        writeJsonBlob(REVIEW_STATE_PATH, {
          promotedIds: [...promotedSet],
          dismissedEditIds: [...dismissedSet],
          suggestionOverrides: nextOverrides,
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
