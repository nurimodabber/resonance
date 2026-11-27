import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_SUGGESTIONS } from '../../src/data/reviewSuggestions';
import { STACKS } from '../../src/data/stacks';
import { SESSION_COOKIE_NAME, signSessionToken } from '../_lib/auth';
import { CARDS_PATH, REVIEW_STATE_PATH, reviewerBlobPath, STACKS_PATH } from '../_lib/store';

const blobStore = new Map<string, string>();

vi.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {
    constructor(message = 'Blob not found') {
      super(message);
      this.name = 'BlobNotFoundError';
    }
  }

  return {
    BlobNotFoundError,
    async get(pathname: string) {
      const value = blobStore.get(pathname);
      if (value === undefined) {
        throw new BlobNotFoundError(`Not found: ${pathname}`);
      }
      const bytes = new TextEncoder().encode(value);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return { statusCode: 200, stream };
    },
    async put(pathname: string, body: string) {
      blobStore.set(pathname, String(body));
      return { pathname, url: `https://blob.example/${pathname}` };
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const blobs = [...blobStore.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((pathname) => ({ pathname }));
      return { blobs, hasMore: false, cursor: undefined };
    },
  };
});

import { GET as getAdminReview, POST as postAdminReview } from '../admin/review';
import { DELETE as deleteAdminCard } from '../admin/cards';
import { GET as getPublicReview, POST as postPublicReview } from '../review';

const TEST_SECRET = 'test-admin-secret-at-least-32-chars-long';
const ORIGIN = 'https://resonance.example';

function makeRequest(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    origin?: string;
    adminEmail?: string;
  } = {},
): Request {
  const headers = new Headers();
  headers.set('host', 'resonance.example');
  if (init.origin !== undefined) {
    headers.set('origin', init.origin);
  } else if (init.method && init.method !== 'GET') {
    headers.set('origin', ORIGIN);
  }
  if (init.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (init.adminEmail) {
    const token = signSessionToken(init.adminEmail, TEST_SECRET);
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  }

  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('review backend endpoints', () => {
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalOidcToken = process.env.VERCEL_OIDC_TOKEN;
  const originalAdminSecret = process.env.ADMIN_SESSION_SECRET;

  beforeEach(() => {
    blobStore.clear();
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    if (originalOidcToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = originalOidcToken;
    if (originalAdminSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalAdminSecret;
  });

  it('GET /api/review excludes suggestions in archived stacks and returns reviewer record', async () => {
    const stacksWithArchivedWarmup = STACKS.map((s) =>
      s.id === 'warmup' ? { ...s, archived: true } : s,
    );
    blobStore.set(STACKS_PATH, JSON.stringify(stacksWithArchivedWarmup));

    const res = await getPublicReview(makeRequest('/api/review?reviewerId=rev_friend_01'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      mode: string;
      stacks: Array<{ id: string }>;
      suggestions: Array<{ id: string; stackId: string; kind: string }>;
      myRecord: { reviewerId: string };
    };

    expect(data.mode).toBe('vercel');
    expect(data.stacks.some((s) => s.id === 'warmup')).toBe(false);
    expect(
      data.suggestions.some((s) => s.kind !== 'wildcard' && s.stackId === 'warmup'),
    ).toBe(false);
    expect(data.suggestions.some((s) => s.kind === 'wildcard')).toBe(true);
    expect(data.myRecord.reviewerId).toBe('rev_friend_01');
  });

  it('POST /api/review saves/clears votes, edits, and reviewerName while enforcing origin & cardId validation', async () => {
    const crossOrigin = await postPublicReview(
      makeRequest('/api/review', {
        method: 'POST',
        origin: 'https://evil.example',
        body: { action: 'vote', reviewerId: 'rev_friend_01', cardId: 'RW_W01', vote: 2 },
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const protoCard = await postPublicReview(
      makeRequest('/api/review', {
        method: 'POST',
        body: { action: 'vote', reviewerId: 'rev_friend_01', cardId: '__proto__', vote: 2 },
      }),
    );
    expect(protoCard.status).toBe(400);

    const voteRes = await postPublicReview(
      makeRequest('/api/review', {
        method: 'POST',
        body: {
          action: 'vote',
          reviewerId: 'rev_friend_01',
          reviewerName: 'Elena',
          cardId: 'RW_W01',
          vote: 2,
        },
      }),
    );
    expect(voteRes.status).toBe(200);
    const voteData = (await voteRes.json()) as {
      ok: boolean;
      myRecord: { reviewerName?: string; votes: Record<string, number> };
    };
    expect(voteData.myRecord.reviewerName).toBe('Elena');
    expect(voteData.myRecord.votes.RW_W01).toBe(2);

    const editRes = await postPublicReview(
      makeRequest('/api/review', {
        method: 'POST',
        body: {
          action: 'suggest-edit',
          reviewerId: 'rev_friend_01',
          cardId: 'RW_W01',
          suggestedText: 'Cleaner question wording?',
          language: 'en',
        },
      }),
    );
    expect(editRes.status).toBe(200);

    // Explicitly clearing reviewerName with empty string clears it in stored blob
    const clearNameRes = await postPublicReview(
      makeRequest('/api/review', {
        method: 'POST',
        body: {
          action: 'vote',
          reviewerId: 'rev_friend_01',
          reviewerName: '',
          cardId: 'RW_W01',
          vote: 0,
        },
      }),
    );
    expect(clearNameRes.status).toBe(200);
    const clearedData = (await clearNameRes.json()) as {
      myRecord: { reviewerName?: string; votes: Record<string, number>; edits: Record<string, unknown> };
    };
    expect(clearedData.myRecord.reviewerName).toBeUndefined();
    expect(clearedData.myRecord.votes.RW_W01).toBeUndefined();
    expect(clearedData.myRecord.edits.RW_W01).toBeDefined();
  });

  it('GET /api/admin/review supports VERCEL_OIDC_TOKEN, ignores empty profiles, and survives corrupt reviewer blobs', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = 'oidc_token_test';

    blobStore.set(
      reviewerBlobPath('rev_active_1'),
      JSON.stringify({
        reviewerId: 'rev_active_1',
        reviewerName: 'Maya',
        updatedAt: '2026-11-26T10:00:00Z',
        votes: { RW_W01: 2 },
        edits: {},
      }),
    );
    blobStore.set(
      reviewerBlobPath('rev_empty_profile'),
      JSON.stringify({
        reviewerId: 'rev_empty_profile',
        reviewerName: 'Lurker',
        updatedAt: '2026-11-26T11:00:00Z',
        votes: {},
        edits: {},
      }),
    );
    blobStore.set(reviewerBlobPath('rev_corrupt'), '{not valid json');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await getAdminReview(
      makeRequest('/api/admin/review', { adminEmail: 'curator@example.com' }),
    );
    errorSpy.mockRestore();

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      reviewerCount: number;
      reviewers: Array<{ reviewerId: string }>;
      stats: Array<{ cardId: string; weightedScore: number }>;
    };
    expect(data.reviewerCount).toBe(1);
    expect(data.reviewers.map((r) => r.reviewerId)).toEqual(['rev_active_1']);
    const rw1 = data.stats.find((s) => s.cardId === 'RW_W01');
    expect(rw1?.weightedScore).toBe(2);
  });

  it('POST /api/admin/review promotes, unarchives on re-promote, applies edits, and DELETE /api/admin/cards cleans promotedIds', async () => {
    const sample = REVIEW_SUGGESTIONS[0];
    expect(sample).toBeDefined();

    // Pre-populate cards with sample archived
    blobStore.set(
      CARDS_PATH,
      JSON.stringify([
        {
          ...sample,
          archived: true,
        },
      ]),
    );

    const promoteRes = await postAdminReview(
      makeRequest('/api/admin/review', {
        method: 'POST',
        adminEmail: 'curator@example.com',
        body: {
          action: 'promote',
          items: [{ id: sample.id, en: 'Restored & refined English wording' }],
        },
      }),
    );
    expect(promoteRes.status).toBe(200);
    const promoteData = (await promoteRes.json()) as {
      ok: boolean;
      addedCount: number;
      promotedIds: string[];
    };
    expect(promoteData.addedCount).toBe(1);
    expect(promoteData.promotedIds).toContain(sample.id);

    const storedCards = JSON.parse(blobStore.get(CARDS_PATH) || '[]') as Array<{
      id: string;
      archived?: boolean;
      en: string;
    }>;
    const restored = storedCards.find((c) => c.id === sample.id);
    expect(restored?.archived).toBe(false);
    expect(restored?.en).toBe('Restored & refined English wording');

    // Apply an edit to a suggestion that is not yet in CARDS_PATH
    const secondSuggestion = REVIEW_SUGGESTIONS[1];
    const applyRes = await postAdminReview(
      makeRequest('/api/admin/review', {
        method: 'POST',
        adminEmail: 'curator@example.com',
        body: {
          action: 'apply-edit',
          cardId: secondSuggestion.id,
          language: 'de',
          newText: 'Bessere deutsche Formulierung?',
          editId: `rev_active_1::${secondSuggestion.id}::2026-11-26T10:00:00Z`,
        },
      }),
    );
    expect(applyRes.status).toBe(200);

    const stateAfterApply = JSON.parse(blobStore.get(REVIEW_STATE_PATH) || '{}') as {
      promotedIds: string[];
      dismissedEditIds: string[];
    };
    expect(stateAfterApply.promotedIds).toContain(secondSuggestion.id);
    expect(stateAfterApply.dismissedEditIds).toContain(
      `rev_active_1::${secondSuggestion.id}::2026-11-26T10:00:00Z`,
    );

    // Deleting the promoted card also removes it from promotedIds so it returns to reviewable suggestions
    const delRes = await deleteAdminCard(
      makeRequest(`/api/admin/cards?id=${encodeURIComponent(sample.id)}`, {
        method: 'DELETE',
        adminEmail: 'curator@example.com',
      }),
    );
    expect(delRes.status).toBe(200);
    const stateAfterDelete = JSON.parse(blobStore.get(REVIEW_STATE_PATH) || '{}') as {
      promotedIds: string[];
    };
    expect(stateAfterDelete.promotedIds).not.toContain(sample.id);
  });
});
