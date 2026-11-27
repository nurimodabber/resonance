import type {
  AggregatedEditSuggestion,
  CardItem,
  RecommendationPreset,
  ReviewCardStats,
  ReviewerRecord,
} from '../types/deck';

export interface AggregateReviewInput {
  suggestions: CardItem[];
  liveCards: CardItem[];
  reviewers: ReviewerRecord[];
  promotedIds: string[];
  dismissedEditIds: string[];
  preset?: RecommendationPreset;
}

export function sortReviewStats(items: ReviewCardStats[]): ReviewCardStats[] {
  return items.slice().sort((a, b) => {
    const aRated = a.voteCount > 0;
    const bRated = b.voteCount > 0;
    if (aRated !== bRated) return bRated ? 1 : -1;
    if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    if (b.up2 !== a.up2) return b.up2 - a.up2;
    if (a.down2 !== b.down2) return a.down2 - b.down2;
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return a.cardId.localeCompare(b.cardId);
  });
}

/**
 * Selects the clearest top tier inside [ceil(n/3), floor(2n/3)] for one category's
 * unpromoted new suggestions, scanning for the sharpest drop in average/weighted score.
 */
export function selectRecommendedIdsForCategory(
  categoryItems: ReviewCardStats[],
  preset: RecommendationPreset = 'auto',
): Set<string> {
  const rated = sortReviewStats(
    categoryItems.filter(
      (item) => item.source === 'suggestion' && !item.promoted && item.voteCount > 0,
    ),
  );
  if (rated.length === 0) return new Set();

  const eligible = rated.filter(
    (item) => item.weightedScore > 0 && item.averageScore >= 0.25 && item.down2 <= item.up2,
  );
  if (eligible.length === 0) return new Set();

  const minBand = Math.max(1, Math.ceil(rated.length / 3));
  const maxBand = Math.max(minBand, Math.floor((rated.length * 2) / 3));
  const kMin = Math.min(eligible.length, minBand);
  const kMax = Math.min(eligible.length, maxBand);

  let targetCount = kMin;

  if (preset === 'top33') {
    targetCount = kMin;
  } else if (preset === 'top67') {
    targetCount = kMax;
  } else if (preset === 'top50') {
    const mid = Math.max(minBand, Math.min(maxBand, Math.round(rated.length * 0.5)));
    targetCount = Math.min(eligible.length, mid);
  } else {
    // 'auto': scan [kMin .. kMax] for sharpest score cliff
    let bestK = Math.round((kMin + kMax) / 2);
    let bestCliff = 0;

    for (let k = kMin; k <= kMax; k++) {
      if (k >= eligible.length) {
        // Boundary between eligible and non-eligible rated items
        const lastElig = eligible[k - 1];
        const nextRated = rated[k];
        const avgDrop = nextRated ? lastElig.averageScore - nextRated.averageScore : 0.5;
        const scoreDrop = nextRated ? lastElig.weightedScore - nextRated.weightedScore : 1;
        const cliff = avgDrop * 10 + scoreDrop * 0.5;
        if (cliff > bestCliff) {
          bestCliff = cliff;
          bestK = k;
        }
        continue;
      }

      const above = eligible[k - 1];
      const below = eligible[k];
      const avgDrop = above.averageScore - below.averageScore;
      const scoreDrop = above.weightedScore - below.weightedScore;
      const cliff = avgDrop * 10 + scoreDrop * 0.5;
      if (cliff > bestCliff) {
        bestCliff = cliff;
        bestK = k;
      }
    }

    targetCount = bestK;
  }

  return new Set(eligible.slice(0, targetCount).map((item) => item.cardId));
}

export function reviewCategoryKey(card: Pick<CardItem, 'kind' | 'stackId'>): string {
  return card.kind === 'wildcard' ? '__wildcards__' : card.stackId;
}

export function computeRecommendedIdSet(
  stats: ReviewCardStats[],
  preset: RecommendationPreset = 'auto',
): Set<string> {
  const byCategory = new Map<string, ReviewCardStats[]>();
  for (const item of stats) {
    if (item.source !== 'suggestion' || item.promoted) continue;
    const key = reviewCategoryKey(item.card);
    const list = byCategory.get(key) || [];
    list.push(item);
    byCategory.set(key, list);
  }

  const out = new Set<string>();
  for (const group of byCategory.values()) {
    for (const id of selectRecommendedIdsForCategory(group, preset)) {
      out.add(id);
    }
  }
  return out;
}

export function aggregateReviewStats({
  suggestions,
  liveCards,
  reviewers,
  promotedIds,
  dismissedEditIds,
  preset = 'auto',
}: AggregateReviewInput): ReviewCardStats[] {
  const liveById = new Map(liveCards.map((c) => [c.id, c]));
  const promotedSet = new Set(promotedIds);
  const dismissedSet = new Set(dismissedEditIds);

  const items: Array<{ card: CardItem; source: 'suggestion' | 'live'; promoted: boolean }> = [];
  const suggestionIds = new Set<string>();

  for (const s of suggestions) {
    suggestionIds.add(s.id);
    const liveMatch = liveById.get(s.id);
    items.push({
      card: liveMatch ?? s,
      source: 'suggestion',
      promoted: Boolean(liveMatch) || promotedSet.has(s.id),
    });
  }

  for (const live of liveCards) {
    if (suggestionIds.has(live.id)) continue;
    items.push({
      card: live,
      source: 'live',
      promoted: true,
    });
  }

  const stats: ReviewCardStats[] = items.map(({ card, source, promoted }) => {
    let up2 = 0;
    let up1 = 0;
    let down1 = 0;
    let down2 = 0;
    const edits: AggregatedEditSuggestion[] = [];

    for (const rev of reviewers) {
      const vote = rev.votes?.[card.id];
      if (vote === 2) up2 += 1;
      else if (vote === 1) up1 += 1;
      else if (vote === -1) down1 += 1;
      else if (vote === -2) down2 += 1;

      const edit = rev.edits?.[card.id];
      if (edit && edit.text.trim()) {
        const editId = edit.updatedAt
          ? `${rev.reviewerId}::${card.id}::${edit.updatedAt}`
          : `${rev.reviewerId}::${card.id}`;
        edits.push({
          id: editId,
          cardId: card.id,
          reviewerId: rev.reviewerId,
          reviewerName: rev.reviewerName,
          suggestedText: edit.text.trim(),
          language: edit.language,
          updatedAt: edit.updatedAt,
          dismissed: dismissedSet.has(editId),
        });
      }
    }

    edits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const voteCount = up2 + up1 + down1 + down2;
    const weightedScore = 2 * up2 + up1 - down1 - 2 * down2;
    const averageScore = voteCount > 0 ? weightedScore / voteCount : 0;
    const positiveRatio = voteCount > 0 ? (up2 + up1) / voteCount : 0;

    return {
      cardId: card.id,
      source,
      card,
      up2,
      up1,
      down1,
      down2,
      voteCount,
      weightedScore,
      averageScore,
      positiveRatio,
      edits,
      promoted,
      recommended: false,
    };
  });

  const recSet = computeRecommendedIdSet(stats, preset);
  return stats.map((entry) => ({
    ...entry,
    recommended: recSet.has(entry.cardId),
  }));
}
