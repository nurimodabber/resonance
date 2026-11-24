import { describe, expect, it } from 'vitest';
import { CURATED_QUESTIONS } from '../../data/questions';
import { STACKS } from '../../data/stacks';
import type { CardItem, StackMeta } from '../../types/deck';
import { buildSessionDeck } from '../deckEngine';

describe('deckEngine with dynamic stacks', () => {
  const customStack: StackMeta = {
    id: 'evening-rituals',
    ring: 7,
    iconId: 'spirituality',
    nameDe: 'Abend-Rituale',
    nameEn: 'Evening Rituals',
    subtitleDe: 'Ruhige Fragen zum Ausklang',
    subtitleEn: 'Calm prompts to close the day',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  };

  const customCard: CardItem = {
    id: 'C_RITUAL_1',
    stackId: 'evening-rituals',
    kind: 'question',
    de: 'Wofür warst du heute still dankbar?',
    en: 'What were you quietly grateful for today?',
  };

  it('includes active custom stacks in Guided Journey phase 3', () => {
    const deck = buildSessionDeck(
      [...CURATED_QUESTIONS, customCard],
      { type: 'journey' },
      () => 0.42,
      [...STACKS, customStack],
    );
    expect(deck.some((c) => c.id === 'C_RITUAL_1')).toBe(true);
  });

  it('excludes cards belonging to archived stacks', () => {
    const archivedStack: StackMeta = { ...customStack, archived: true };
    const deck = buildSessionDeck(
      [...CURATED_QUESTIONS, customCard],
      { type: 'journey' },
      () => 0.42,
      [...STACKS, archivedStack],
    );
    expect(deck.some((c) => c.id === 'C_RITUAL_1')).toBe(false);
  });

  it('plays a single custom stack when selected directly', () => {
    const deck = buildSessionDeck(
      [...CURATED_QUESTIONS, customCard],
      { type: 'stacks', stackIds: ['evening-rituals'] },
      () => 0.1,
      [...STACKS, customStack],
    );
    expect(deck.map((c) => c.id)).toEqual(['C_RITUAL_1']);
  });
});
