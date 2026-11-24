import type { StackId, StackMeta } from '../types/deck';

export const STACKS: StackMeta[] = [
  {
    id: 'warmup',
    ring: 1,
    nameDe: 'Warm-up',
    nameEn: 'Warm-up',
    subtitleDe: 'Leichter Einstieg für erste Geschichten',
    subtitleEn: 'Easy openers to settle in together',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'reflection',
    ring: 2,
    nameDe: 'Reflexion & Lebensweg',
    nameEn: 'Reflection & Path',
    subtitleDe: 'Was dich geprägt hat und wohin du gehst',
    subtitleEn: 'What shaped you and where you are headed',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'vulnerability',
    ring: 3,
    nameDe: 'Verletzlichkeit',
    nameEn: 'Vulnerability',
    subtitleDe: 'Ehrliche Fragen für ruhige Augenblicke',
    subtitleEn: 'Honest prompts for slower moments',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'friendship',
    ring: 4,
    nameDe: 'Tiefe Freundschaft & Verbindung',
    nameEn: 'Deep Friendship & Connection',
    subtitleDe: 'Was euch verbindet und im Alltag trägt',
    subtitleEn: 'What holds close people together',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'spirituality',
    ring: 5,
    nameDe: 'Spiritualität & Sinn',
    nameEn: 'Spirituality & Meaning',
    subtitleDe: 'Sinn, Staunen und was über uns hinausweist',
    subtitleEn: 'Purpose, wonder, and what reaches beyond',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'quotes',
    ring: 6,
    nameDe: 'Zitate',
    nameEn: 'Quotes',
    subtitleDe: 'Allgemein & Ruhi Buch 1 · mit Impuls',
    subtitleEn: 'General & Ruhi Book 1 · with prompts',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
];

export const STACK_MAP: Record<StackId, StackMeta> = STACKS.reduce(
  (acc, stack) => {
    acc[stack.id] = stack;
    return acc;
  },
  {} as Record<StackId, StackMeta>,
);

export const WILDCARD_ACCENT = 'var(--gold)';
