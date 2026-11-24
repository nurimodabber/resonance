import { STACKS } from '../data/stacks';
import type { CardItem, GroupSubmission, JourneyLength, PlayMode, StackMeta } from '../types/deck';

export function shuffleCards<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const JOURNEY_QUOTAS: Record<Exclude<JourneyLength, 'all'>, { p1: number; p2: number; p3: number }> = {
  15: { p1: 3, p2: 4, p3: 8 },
  25: { p1: 5, p2: 7, p3: 13 },
  40: { p1: 8, p2: 11, p3: 21 },
};

/**
 * Builds the active deck queue from available cards + play mode.
 * - Progressively Deeper moves gently from outer ring (Warm-up) -> Reflection -> balanced sampling across deeper stacks (including active custom stacks), scaled to the chosen approximate session length.
 * - Standard / Mix & Match stack mode shuffles chosen stacks cleanly without repeats.
 * - Natural wildcards are interleaved softly every ~8 cards when playing question decks.
 */
export function buildSessionDeck(
  allCards: CardItem[],
  mode: PlayMode,
  rng: () => number = Math.random,
  stacks: StackMeta[] = STACKS,
): CardItem[] {
  const activeStacks = stacks.filter((s) => !s.archived);
  const activeStackIds = new Set(activeStacks.map((s) => s.id));
  const active = allCards.filter((c) => !c.archived && (c.kind === 'wildcard' || activeStackIds.has(c.stackId)));
  const wildcards = shuffleCards(
    active.filter((c) => c.kind === 'wildcard'),
    rng,
  );

  let ordered: CardItem[] = [];

  if (mode.type === 'journey') {
    const length: JourneyLength = mode.length ?? 25;
    const journeyStacks = activeStacks
      .filter((s) => s.id !== 'quotes')
      .sort((a, b) => a.ring - b.ring);
    const phase1Ids = new Set(journeyStacks.filter((s) => s.ring <= 1).map((s) => s.id));
    const phase2Ids = new Set(journeyStacks.filter((s) => s.ring === 2).map((s) => s.id));
    const phase3Stacks = journeyStacks.filter((s) => s.ring >= 3);

    const phase1Pool = shuffleCards(
      active.filter((c) => c.kind === 'question' && phase1Ids.has(c.stackId)),
      rng,
    );
    const phase2Pool = shuffleCards(
      active.filter((c) => c.kind === 'question' && phase2Ids.has(c.stackId)),
      rng,
    );
    const phase3Buckets = phase3Stacks
      .map((s) =>
        shuffleCards(
          active.filter((c) => c.kind === 'question' && c.stackId === s.id),
          rng,
        ),
      )
      .filter((b) => b.length > 0);

    if (length === 'all') {
      const phase3 = shuffleCards(phase3Buckets.flat(), rng);
      ordered = [...phase1Pool, ...phase2Pool, ...phase3];
    } else {
      const quota = JOURNEY_QUOTAS[length] ?? JOURNEY_QUOTAS[25];
      const phase1 = phase1Pool.slice(0, quota.p1);
      const phase2 = phase2Pool.slice(0, quota.p2);
      const shortfall =
        Math.max(0, quota.p1 - phase1.length) + Math.max(0, quota.p2 - phase2.length);
      const phase3Target = quota.p3 + shortfall;

      const orderedBuckets = shuffleCards(phase3Buckets, rng);
      const cursors = orderedBuckets.map(() => 0);
      const pickedPhase3: CardItem[] = [];

      while (pickedPhase3.length < phase3Target) {
        let madeProgress = false;
        for (let b = 0; b < orderedBuckets.length && pickedPhase3.length < phase3Target; b++) {
          if (cursors[b] < orderedBuckets[b].length) {
            pickedPhase3.push(orderedBuckets[b][cursors[b]]);
            cursors[b] += 1;
            madeProgress = true;
          }
        }
        if (!madeProgress) break;
      }

      const phase3 = shuffleCards(pickedPhase3, rng);
      ordered = [...phase1, ...phase2, ...phase3];
    }
  } else {
    const selectedIds = new Set(mode.stackIds);
    const pool = active.filter((c) => {
      if (c.kind === 'wildcard') return false;
      if (!selectedIds.has(c.stackId)) return false;
      if (c.stackId === 'quotes') {
        if (mode.quoteSubdeck && mode.quoteSubdeck !== 'all' && c.quoteSubdeck !== mode.quoteSubdeck) {
          return false;
        }
        if (
          mode.quoteSubdeck === 'ruhi' &&
          mode.ruhiChapter &&
          mode.ruhiChapter !== 'all' &&
          c.ruhiChapter !== mode.ruhiChapter
        ) {
          return false;
        }
      }
      return true;
    });
    ordered = shuffleCards(pool, rng);
  }

  // Weave natural wildcards gently when the session contains non-quote questions
  const hasQuestionStacks =
    mode.type === 'journey' || mode.stackIds.some((id) => id !== 'quotes');

  if (!hasQuestionStacks || wildcards.length === 0 || ordered.length < 6) {
    return ordered;
  }

  const withWildcards: CardItem[] = [];
  let wcIdx = 0;
  for (let i = 0; i < ordered.length; i++) {
    withWildcards.push(ordered[i]);
    if ((i + 1) % 8 === 0 && wcIdx < wildcards.length && i < ordered.length - 1) {
      withWildcards.push(wildcards[wcIdx]);
      wcIdx++;
    }
  }

  return withWildcards;
}

/**
 * Converts a live guest QR submission into a playable CardItem so it mixes naturally into the pile.
 */
export function submissionToPlayCard(sub: GroupSubmission, catalog: CardItem[]): CardItem {
  if (sub.sourceCardId) {
    const existing = catalog.find((c) => c.id === sub.sourceCardId);
    if (existing) {
      return {
        ...existing,
        id: `grp-${sub.id}`,
        fromGroup: true,
        contributedBy: sub.authorName,
      };
    }
  }

  return {
    id: `grp-${sub.id}`,
    stackId: sub.promotedStackId || 'friendship',
    kind: 'question',
    de: sub.text,
    en: sub.text,
    fromGroup: true,
    contributedBy: sub.authorName,
    createdAt: sub.createdAt,
  };
}

/**
 * Mixes newly arrived QR group questions ahead of the current card index (with gentle randomness
 * within the next 1..4 cards so guests see their questions appear smoothly).
 */
export function mixSubmissionsIntoQueue(
  queue: CardItem[],
  currentIndex: number,
  incoming: GroupSubmission[],
  catalog: CardItem[],
  rng: () => number = Math.random,
): CardItem[] {
  const existingIds = new Set(queue.map((c) => c.id));
  const fresh = incoming.filter((s) => !existingIds.has(`grp-${s.id}`));
  if (fresh.length === 0) return queue;

  const nextQueue = [...queue];
  for (const sub of fresh) {
    const card = submissionToPlayCard(sub, catalog);
    const minPos = Math.min(currentIndex + 1, nextQueue.length);
    const maxPos = Math.min(currentIndex + 4, nextQueue.length);
    const insertAt = minPos + Math.floor(rng() * (maxPos - minPos + 1));
    nextQueue.splice(insertAt, 0, card);
  }
  return nextQueue;
}
