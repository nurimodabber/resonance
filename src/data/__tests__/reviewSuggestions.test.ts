import { describe, expect, it } from 'vitest';
import { CURATED_QUESTIONS } from '../questions';
import { CURATED_QUOTES } from '../quotes';
import { REVIEW_SUGGESTIONS } from '../reviewSuggestions';

describe('Friend Review Suggestions Integrity', () => {
  it('provides at least 50 new questions in every one of the 5 question categories', () => {
    const counts: Record<string, number> = {};
    for (const card of REVIEW_SUGGESTIONS) {
      if (card.kind === 'question') {
        counts[card.stackId] = (counts[card.stackId] || 0) + 1;
      }
    }

    expect(counts.warmup).toBeGreaterThanOrEqual(50);
    expect(counts.reflection).toBeGreaterThanOrEqual(50);
    expect(counts.vulnerability).toBeGreaterThanOrEqual(50);
    expect(counts.friendship).toBeGreaterThanOrEqual(50);
    expect(counts.spirituality).toBeGreaterThanOrEqual(50);
  });

  it('includes 50 quote suggestions with authors and prompts plus new wildcards', () => {
    const quotes = REVIEW_SUGGESTIONS.filter((c) => c.kind === 'quote');
    const wildcards = REVIEW_SUGGESTIONS.filter((c) => c.kind === 'wildcard');

    expect(quotes.length).toBeGreaterThanOrEqual(50);
    expect(wildcards.length).toBeGreaterThanOrEqual(10);

    for (const quote of quotes) {
      expect(quote.stackId).toBe('quotes');
      expect(quote.author?.trim().length).toBeGreaterThan(1);
      expect(quote.promptDe?.trim().length).toBeGreaterThan(5);
      expect(quote.promptEn?.trim().length).toBeGreaterThan(5);
    }
  });

  it('has unique IDs and zero duplicate EN or DE texts against existing live cards', () => {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const live = [...CURATED_QUESTIONS, ...CURATED_QUOTES];

    const seenIds = new Set(live.map((c) => c.id));
    const seenEn = new Set(live.map((c) => normalize(c.en)));
    const seenDe = new Set(live.map((c) => normalize(c.de)));

    for (const item of REVIEW_SUGGESTIONS) {
      expect(item.de.trim().length).toBeGreaterThan(5);
      expect(item.en.trim().length).toBeGreaterThan(5);

      expect(seenIds.has(item.id)).toBe(false);
      seenIds.add(item.id);

      expect(seenEn.has(normalize(item.en))).toBe(false);
      seenEn.add(normalize(item.en));

      expect(seenDe.has(normalize(item.de))).toBe(false);
      seenDe.add(normalize(item.de));
    }
  });
});
