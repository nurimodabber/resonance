import type { StackIconId, StackId, StackMeta } from '../types/deck';

export const STACK_ICON_IDS: StackIconId[] = [
  'warmup',
  'reflection',
  'vulnerability',
  'friendship',
  'spirituality',
  'quotes',
];

export const STACKS: StackMeta[] = [
  {
    id: 'warmup',
    ring: 1,
    iconId: 'warmup',
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
    iconId: 'reflection',
    nameDe: 'Reflexion',
    nameEn: 'Reflection',
    subtitleDe: 'Was dich geprägt hat und wohin du gehst',
    subtitleEn: 'What shaped you and where you are headed',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'vulnerability',
    ring: 3,
    iconId: 'vulnerability',
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
    iconId: 'friendship',
    nameDe: 'Verbindung',
    nameEn: 'Connection',
    subtitleDe: 'Was euch verbindet und im Alltag trägt',
    subtitleEn: 'What holds close people together',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'spirituality',
    ring: 5,
    iconId: 'spirituality',
    nameDe: 'Spiritualität',
    nameEn: 'Spirituality',
    subtitleDe: 'Sinn, Staunen und was über uns hinausweist',
    subtitleEn: 'Purpose, wonder, and what reaches beyond',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
  {
    id: 'quotes',
    ring: 6,
    iconId: 'quotes',
    nameDe: 'Zitate',
    nameEn: 'Quotes',
    subtitleDe: 'Allgemein & Ruhi Buch 1 · mit Impuls',
    subtitleEn: 'General & Ruhi Book 1 · with prompts',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
  },
];

export function buildStackMap(stacks: StackMeta[]): Record<StackId, StackMeta> {
  return stacks.reduce(
    (acc, stack) => {
      acc[stack.id] = stack;
      return acc;
    },
    {} as Record<StackId, StackMeta>,
  );
}

export const STACK_MAP: Record<StackId, StackMeta> = buildStackMap(STACKS);

export function resolveStackIconId(
  stack?: Pick<StackMeta, 'id' | 'iconId'> | null,
  fallbackId?: string,
): StackIconId {
  const candidate = stack?.iconId ?? stack?.id ?? fallbackId;
  if (candidate && (STACK_ICON_IDS as string[]).includes(candidate)) {
    return candidate as StackIconId;
  }
  return 'reflection';
}

export function getStackMetaSafe(
  stackMap: Record<StackId, StackMeta>,
  stackId: StackId,
): StackMeta {
  return (
    stackMap[stackId] ??
    STACK_MAP[stackId] ?? {
      id: stackId,
      ring: 99,
      iconId: 'reflection',
      nameDe: stackId,
      nameEn: stackId,
      subtitleDe: '',
      subtitleEn: '',
      accent: 'var(--accent)',
      accentSoft: 'var(--accent-soft)',
    }
  );
}

export const WILDCARD_ACCENT = 'var(--gold)';
