import { describe, expect, it } from 'vitest';
import type { CardItem, ReviewerRecord } from '../../types/deck';
import {
  aggregateReviewStats,
  selectRecommendedIdsForCategory,
  sortReviewStats,
} from '../reviewScoring';

function makeCard(id: string, stackId = 'warmup'): CardItem {
  return {
    id,
    stackId,
    kind: 'question',
    de: `Frage ${id} auf Deutsch`,
    en: `Question ${id} in English`,
  };
}

describe('reviewScoring & 1/3–2/3 recommendation engine', () => {
  it('computes -2/-1/+1/+2 weighted scores, preserves wording edits, and tracks promoted status', () => {
    const s1 = makeCard('RW_1');
    const s2 = makeCard('RW_2');
    const live1 = makeCard('L_1');

    const reviewers: ReviewerRecord[] = [
      {
        reviewerId: 'rev_a',
        reviewerName: 'Alice',
        updatedAt: '2026-11-24T10:00:00Z',
        votes: { RW_1: 2, RW_2: -1, L_1: 1 },
        edits: {
          L_1: {
            text: 'Sharper live question wording?',
            language: 'en',
            updatedAt: '2026-11-24T10:05:00Z',
          },
        },
      },
      {
        reviewerId: 'rev_b',
        reviewerName: 'Bob',
        updatedAt: '2026-11-24T11:00:00Z',
        votes: { RW_1: 1, RW_2: -2 },
        edits: {},
      },
    ];

    const stats = aggregateReviewStats({
      suggestions: [s1, s2],
      liveCards: [live1],
      reviewers,
      promotedIds: [],
      dismissedEditIds: [],
    });

    const sorted = sortReviewStats(stats);
    expect(sorted[0].cardId).toBe('RW_1');
    expect(sorted[0].weightedScore).toBe(3); // +2 + +1
    expect(sorted[0].up2).toBe(1);
    expect(sorted[0].up1).toBe(1);
    expect(sorted[0].averageScore).toBe(1.5);

    const liveStat = sorted.find((s) => s.cardId === 'L_1')!;
    expect(liveStat.source).toBe('live');
    expect(liveStat.edits).toHaveLength(1);
    expect(liveStat.edits[0].suggestedText).toBe('Sharper live question wording?');
    expect(liveStat.edits[0].dismissed).toBe(false);

    const lowStat = sorted.find((s) => s.cardId === 'RW_2')!;
    expect(lowStat.weightedScore).toBe(-3);
    expect(lowStat.recommended).toBe(false);
  });

  it('auto-selects the sharpest score cliff inside the 1/3 to 2/3 band', () => {
    // 9 rated warmup suggestions: top 4 clearly stand out (+2, +2, +1.8, +1.7),
    // then steep drop to +0.5 for ranks 5..7 and negative below.
    // Band for n=9 is [ceil(9/3)=3 .. floor(18/3)=6], cliff is at k=4 (inside [3..6]).
    const suggestions = Array.from({ length: 9 }, (_, i) => makeCard(`RW_${i + 1}`));
    const scores = [6, 6, 5, 5, 1, 1, 1, -2, -4];

    const fakeStats = suggestions.map((card, i) => ({
      cardId: card.id,
      source: 'suggestion' as const,
      card,
      up2: scores[i] >= 5 ? 2 : 0,
      up1: scores[i] > 0 && scores[i] < 5 ? 1 : 0,
      down1: scores[i] < 0 ? 1 : 0,
      down2: scores[i] <= -4 ? 1 : 0,
      voteCount: 3,
      weightedScore: scores[i],
      averageScore: scores[i] / 3,
      positiveRatio: scores[i] > 0 ? 1 : 0,
      edits: [],
      promoted: false,
      recommended: false,
    }));

    const auto = selectRecommendedIdsForCategory(fakeStats, 'auto');
    expect([...auto]).toEqual(['RW_1', 'RW_2', 'RW_3', 'RW_4']);
    expect(auto.size).toBeGreaterThanOrEqual(3); // >= 1/3
    expect(auto.size).toBeLessThanOrEqual(6); // <= 2/3

    const top33 = selectRecommendedIdsForCategory(fakeStats, 'top33');
    expect(top33.size).toBe(3);

    const top67 = selectRecommendedIdsForCategory(fakeStats, 'top67');
    expect(top67.size).toBe(6);
  });

  it('places negatively rated cards before completely unrated cards when sorting', () => {
    const cards = [makeCard('UNRATED'), makeCard('DOWNVOTED'), makeCard('UPVOTED')];
    const reviewers: ReviewerRecord[] = [
      {
        reviewerId: 'r1',
        updatedAt: '2026-11-24T12:00:00Z',
        votes: { DOWNVOTED: -2, UPVOTED: 2 },
        edits: {},
      },
    ];
    const sorted = sortReviewStats(
      aggregateReviewStats({
        suggestions: [],
        liveCards: cards,
        reviewers,
        promotedIds: [],
        dismissedEditIds: [],
      }),
    );
    expect(sorted.map((s) => s.cardId)).toEqual(['UPVOTED', 'DOWNVOTED', 'UNRATED']);
  });
});
