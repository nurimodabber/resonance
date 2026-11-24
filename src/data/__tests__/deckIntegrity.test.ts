import { describe, expect, it } from 'vitest';
import { CURATED_QUESTIONS } from '../questions';
import { CURATED_QUOTES } from '../quotes';
import { STACKS } from '../stacks';
import {
  buildSessionDeck,
  mixSubmissionsIntoQueue,
} from '../../utils/deckEngine';
import type { GroupSubmission } from '../../types/deck';

describe('Resonance Curated Deck Integrity', () => {
  it('has exact question counts across the 5 question stacks plus 4 wildcards', () => {
    const questions = CURATED_QUESTIONS.filter((c) => c.kind === 'question');
    const wildcards = CURATED_QUESTIONS.filter((c) => c.kind === 'wildcard');

    const counts: Record<string, number> = {};
    for (const q of questions) {
      counts[q.stackId] = (counts[q.stackId] || 0) + 1;
    }

    expect(counts.warmup).toBe(25);
    expect(counts.reflection).toBe(25);
    expect(counts.vulnerability).toBe(22);
    expect(counts.friendship).toBe(31);
    expect(counts.spirituality).toBe(31);
    expect(questions).toHaveLength(134);
    expect(wildcards).toHaveLength(4);
  });

  it('excludes all cards the user explicitly removed and applies requested edits', () => {
    const all = [...CURATED_QUESTIONS, ...CURATED_QUOTES];
    const ids = new Set(all.map((c) => c.id));

    for (const removedId of [
      'FB6',
      'FB7',
      'FB15',
      'SB9',
      'Q6',
      'Q9',
      'Q19',
      'RQ18',
      'RB4',
      'R7',
      'VB3',
      'VB10',
      'V1',
    ]) {
      expect(ids.has(removedId)).toBe(false);
    }

    // Specific user wording edits
    const w3 = CURATED_QUESTIONS.find((c) => c.id === 'W3')!;
    expect(w3.de).toContain('aufgeben');
    expect(w3.de).not.toContain('missen');

    const r16 = CURATED_QUESTIONS.find((c) => c.id === 'R16')!;
    expect(r16.de).toBe('Wie möchtest du eines Tages in Erinnerung bleiben?');

    const vb2 = CURATED_QUESTIONS.find((c) => c.id === 'VB2')!;
    expect(vb2.de).toContain('gelehrt und vorangebracht');

    const vb5 = CURATED_QUESTIONS.find((c) => c.id === 'VB5')!;
    expect(vb5.de).toContain('davon losgelöst zu sein');

    const f2 = CURATED_QUESTIONS.find((c) => c.id === 'F2')!;
    expect(f2.de).toContain('Freundschaft');
    expect(f2.en).toContain('friendship');

    const sb12 = CURATED_QUESTIONS.find((c) => c.id === 'SB12')!;
    expect(sb12.de).not.toContain('Schriften');
    expect(sb12.de).toContain('Lebensfrage');

    const sb14 = CURATED_QUESTIONS.find((c) => c.id === 'SB14')!;
    expect(sb14.de).toContain('Diener Gottes');
    expect(sb14.en).toContain('servant of God');

    const s3 = CURATED_QUESTIONS.find((c) => c.id === 'S3')!;
    expect(s3.de).toContain('Reflexion');
    expect(s3.de).not.toContain('Einkehr');

    const sb1 = CURATED_QUESTIONS.find((c) => c.id === 'SB1')!;
    expect(sb1.de).toContain('jemandem wirklich zu verzeihen');
    expect(sb1.de).not.toContain('wem hast du vergeben');

    const vb1 = CURATED_QUESTIONS.find((c) => c.id === 'VB1')!;
    expect(vb1.de).toContain('leichter werden');

    const v15 = CURATED_QUESTIONS.find((c) => c.id === 'V15')!;
    expect(v15.de).toContain('früher zu bemerken');

    const fb13 = CURATED_QUESTIONS.find((c) => c.id === 'FB13')!;
    expect(fb13.de).toContain('engsten Freundschaften');

    const fb17 = CURATED_QUESTIONS.find((c) => c.id === 'FB17')!;
    expect(fb17.de).toContain('Woran wächst eine Freundschaft');

    const fb2 = CURATED_QUESTIONS.find((c) => c.id === 'FB2')!;
    expect(fb2.de).toContain('Woran merkst du');

    const b9 = CURATED_QUOTES.find((c) => c.id === 'B9')!;
    expect(b9.author).toBe('‘Abdu’l-Bahá');

    const q25 = CURATED_QUOTES.find((c) => c.id === 'Q25')!;
    expect(q25.author).toBe('Werner Heisenberg');
  });

  it('keeps Ruhi subfolder strictly to Ruhi Book 1 Chapters 1, 2, and 3 including Hidden Words Persian 5', () => {
    const ruhiQuotes = CURATED_QUOTES.filter((q) => q.quoteSubdeck === 'ruhi');
    expect(ruhiQuotes.length).toBeGreaterThanOrEqual(20);

    const chapters = new Set(ruhiQuotes.map((q) => q.ruhiChapter));
    expect(chapters.has(1)).toBe(true);
    expect(chapters.has(2)).toBe(true);
    expect(chapters.has(3)).toBe(true);
    for (const q of ruhiQuotes) {
      expect([1, 2, 3]).toContain(q.ruhiChapter);
    }

    expect(ruhiQuotes.some((q) => q.de.includes('Lasst Taten, nicht Worte'))).toBe(true);
    expect(ruhiQuotes.some((q) => q.de.includes('Ein reines Herz ist wie ein Spiegel'))).toBe(false);
  });

  it('ensures every card has non-empty DE/EN, every quote has a conversation question, and authoritative Bahá’í quotes link to official libraries', () => {
    const all = [...CURATED_QUESTIONS, ...CURATED_QUOTES];
    const idSet = new Set<string>();

    for (const card of all) {
      expect(idSet.has(card.id)).toBe(false);
      idSet.add(card.id);
      expect(card.de.trim().length).toBeGreaterThan(5);
      expect(card.en.trim().length).toBeGreaterThan(5);
    }

    for (const quote of CURATED_QUOTES) {
      expect(quote.stackId).toBe('quotes');
      expect(quote.promptDe?.trim().length).toBeGreaterThan(5);
      expect(quote.promptEn?.trim().length).toBeGreaterThan(5);

      const isBahaiAuthor =
        quote.author?.includes('Bahá') ||
        quote.author?.includes('Universal House of Justice');

      if (isBahaiAuthor) {
        const allowHomepageDe = new Set(['R1_C2_1', 'B9', 'B10']);
        if (allowHomepageDe.has(quote.id)) {
          expect(quote.sourceUrlDe?.startsWith('https://bibliothek.bahai.de/')).toBe(true);
        } else {
          expect(quote.sourceUrlDe?.startsWith('https://bibliothek.bahai.de/pubReader.php?')).toBe(
            true,
          );
        }

        if (quote.id === 'B9') {
          expect(quote.sourceUrlEn).toBe('https://www.bahai.org/library');
        } else {
          const isDeepEn =
            quote.sourceUrlEn?.startsWith('https://www.bahai.org/library/') ||
            quote.sourceUrlEn?.startsWith('https://www.bahai.org/beliefs/');
          expect(isDeepEn).toBe(true);
        }
      }
    }

    expect(STACKS).toHaveLength(6);
  });
});

describe('Deck Engine & QR Mixing', () => {
  const catalog = [...CURATED_QUESTIONS, ...CURATED_QUOTES];

  it('builds a no-repeat Guided Journey from Warm-up outward inward and weaves wildcards naturally', () => {
    const deck = buildSessionDeck(catalog, { type: 'journey' }, () => 0.42);
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // First 6 cards come from Warm-up
    expect(deck.slice(0, 6).every((c) => c.stackId === 'warmup')).toBe(true);
    // Contains at least 1 naturally interleaved wildcard
    expect(deck.some((c) => c.kind === 'wildcard')).toBe(true);
  });

  it('filters Quotes by subdeck and Ruhi Book 1 chapter cleanly', () => {
    const ch2 = buildSessionDeck(catalog, {
      type: 'stacks',
      stackIds: ['quotes'],
      quoteSubdeck: 'ruhi',
      ruhiChapter: 2,
    });
    expect(ch2.length).toBe(4);
    expect(ch2.every((c) => c.quoteSubdeck === 'ruhi' && c.ruhiChapter === 2)).toBe(true);
  });

  it('mixes incoming QR submissions directly ahead of the current card without duplicates', () => {
    const base = buildSessionDeck(catalog, { type: 'stacks', stackIds: ['warmup'] });
    const incoming: GroupSubmission[] = [
      {
        id: 's1',
        roomCode: 'ABCD',
        text: 'What are you grateful for tonight?',
        language: 'en',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: 's2',
        roomCode: 'ABCD',
        text: 'Selected from deck',
        language: 'de',
        sourceCardId: 'WB1',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ];

    const mixedOnce = mixSubmissionsIntoQueue(base, 0, incoming, catalog, () => 0.5);
    expect(mixedOnce.length).toBe(base.length + 2);
    expect(mixedOnce.some((c) => c.id === 'grp-s1' && c.fromGroup)).toBe(true);
    expect(mixedOnce.some((c) => c.id === 'grp-s2' && c.de.includes('am nächsten stehen'))).toBe(true);

    // Calling again with same submissions must not duplicate them
    const mixedTwice = mixSubmissionsIntoQueue(mixedOnce, 0, incoming, catalog, () => 0.5);
    expect(mixedTwice.length).toBe(mixedOnce.length);
  });
});
