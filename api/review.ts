import { REVIEW_SUGGESTIONS } from '../src/data/reviewSuggestions.js';
import type { Language, ReviewerRecord, ReviewVote } from '../src/types/deck';
import { jsonResponse, verifySameOrigin } from './_lib/auth.js';
import {
  getCardsOrSeed,
  getReviewState,
  getStacksOrSeed,
  isBlobConfigured,
  mergeSuggestionWithOverride,
  readJsonBlob,
  reviewerBlobPath,
  writeJsonBlob,
} from './_lib/store.js';

function isValidReviewerId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id.trim());
}

function isValidCardId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return (
    /^[a-zA-Z0-9_-]{2,80}$/.test(trimmed) &&
    trimmed !== '__proto__' &&
    trimmed !== 'constructor' &&
    trimmed !== 'prototype'
  );
}

function cleanReviewerName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim().slice(0, 40);
  return trimmed || undefined;
}

export async function GET(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }

  try {
    const url = new URL(request.url);
    const rawReviewerId = url.searchParams.get('reviewerId')?.trim() || '';
    const reviewerId = isValidReviewerId(rawReviewerId) ? rawReviewerId : null;

    const [stacks, cards, reviewState, myRecord] = await Promise.all([
      getStacksOrSeed(),
      getCardsOrSeed(),
      getReviewState(),
      reviewerId
        ? readJsonBlob<ReviewerRecord>(reviewerBlobPath(reviewerId))
        : Promise.resolve(null),
    ]);

    const visibleStacks = stacks
      .filter((s) => !s.archived)
      .slice()
      .sort((a, b) => a.ring - b.ring);
    const activeStackIds = new Set(visibleStacks.map((s) => s.id));
    const visibleLiveCards = cards.filter(
      (c) => !c.archived && (c.kind === 'wildcard' || activeStackIds.has(c.stackId)),
    );
    const liveIds = new Set(visibleLiveCards.map((c) => c.id));
    const promotedSet = new Set([...reviewState.promotedIds, ...liveIds]);

    const visibleSuggestions = REVIEW_SUGGESTIONS.map((s) =>
      mergeSuggestionWithOverride(s, reviewState.suggestionOverrides?.[s.id]),
    ).filter(
      (s) => !promotedSet.has(s.id) && (s.kind === 'wildcard' || activeStackIds.has(s.stackId)),
    );

    return jsonResponse({
      mode: 'vercel',
      stacks: visibleStacks,
      liveCards: visibleLiveCards,
      suggestions: visibleSuggestions,
      promotedIds: [...promotedSet],
      myRecord: myRecord ?? {
        reviewerId: reviewerId || '',
        updatedAt: '',
        votes: {},
        edits: {},
      },
    });
  } catch (err) {
    console.error('[api/review] GET failed:', err);
    return jsonResponse({ error: 'Failed to load review catalog.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }
  if (!verifySameOrigin(request)) {
    return jsonResponse({ error: 'Cross-origin request rejected.' }, 403);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawReviewerId = typeof body.reviewerId === 'string' ? body.reviewerId.trim() : '';
    if (!isValidReviewerId(rawReviewerId)) {
      return jsonResponse({ error: 'Invalid reviewer ID.' }, 400);
    }

    const action = typeof body.action === 'string' ? body.action : '';
    const hasReviewerName = typeof body.reviewerName === 'string';
    const reviewerName = cleanReviewerName(body.reviewerName);
    const blobPath = reviewerBlobPath(rawReviewerId);
    const now = new Date().toISOString();

    const existing = await readJsonBlob<ReviewerRecord>(blobPath);
    const record: ReviewerRecord = existing
      ? {
          reviewerId: rawReviewerId,
          reviewerName: hasReviewerName ? reviewerName : existing.reviewerName,
          updatedAt: now,
          votes: { ...(existing.votes || {}) },
          edits: { ...(existing.edits || {}) },
        }
      : {
          reviewerId: rawReviewerId,
          reviewerName,
          updatedAt: now,
          votes: {},
          edits: {},
        };

    if (action === 'profile') {
      record.reviewerName = reviewerName;
      await writeJsonBlob(blobPath, record);
      return jsonResponse({ ok: true, updatedAt: now, myRecord: record });
    }

    const rawCardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    if (!isValidCardId(rawCardId)) {
      return jsonResponse({ error: 'Invalid card ID.' }, 400);
    }
    const cardId = rawCardId;

    if (action === 'vote') {
      const v = body.vote;
      if (v !== -2 && v !== -1 && v !== 0 && v !== 1 && v !== 2) {
        return jsonResponse({ error: 'Vote must be -2, -1, 0, 1, or 2.' }, 400);
      }

      if (v === 0) {
        delete record.votes[cardId];
      } else {
        record.votes[cardId] = v as ReviewVote;
      }

      await writeJsonBlob(blobPath, record);
      return jsonResponse({ ok: true, updatedAt: now, myRecord: record });
    }

    if (action === 'suggest-edit') {
      const text = typeof body.suggestedText === 'string' ? body.suggestedText.trim() : '';
      const language: Language = body.language === 'de' ? 'de' : 'en';

      if (text.length > 1500) {
        return jsonResponse({ error: 'Suggested wording is too long (max 1500 chars).' }, 400);
      }

      if (!text) {
        delete record.edits[cardId];
      } else {
        record.edits[cardId] = {
          text,
          language,
          updatedAt: now,
        };
      }

      await writeJsonBlob(blobPath, record);
      return jsonResponse({ ok: true, updatedAt: now, myRecord: record });
    }

    return jsonResponse({ error: 'Unsupported review action.' }, 400);
  } catch (err) {
    console.error('[api/review] POST failed:', err);
    return jsonResponse({ error: 'Failed to save review feedback.' }, 500);
  }
}
