export type StackId =
  | 'warmup'
  | 'reflection'
  | 'vulnerability'
  | 'friendship'
  | 'spirituality'
  | 'quotes';

export type QuoteSubdeck = 'general' | 'ruhi';
export type RuhiChapter = 1 | 2 | 3;
export type CardKind = 'question' | 'wildcard' | 'quote';
export type Language = 'de' | 'en';
export type ThemeMode = 'dark' | 'light';

export interface StackMeta {
  id: StackId;
  ring: number; // 1 = outer ring, 5 = core, 6 = wisdom companion
  nameDe: string;
  nameEn: string;
  subtitleDe: string;
  subtitleEn: string;
  accent: string;
  accentSoft: string;
}

export interface CardItem {
  id: string;
  stackId: StackId;
  kind: CardKind;
  de: string;
  en: string;
  digDeeperDe?: string;
  digDeeperEn?: string;
  // Quote-specific metadata
  quoteSubdeck?: QuoteSubdeck;
  ruhiChapter?: RuhiChapter;
  author?: string;
  sourceLabelDe?: string;
  sourceLabelEn?: string;
  sourceUrlDe?: string;
  sourceUrlEn?: string;
  promptDe?: string;
  promptEn?: string;
  // Curation & group origin
  archived?: boolean;
  isCustom?: boolean;
  contributedBy?: string;
  fromGroup?: boolean;
  createdAt?: string;
}

export interface CardRating {
  id: string;
  cardId: string;
  vote: 1 | -1;
  sessionId: string;
  createdAt: string;
}

export interface CardRatingSummary {
  up: number;
  down: number;
  net: number;
  total: number;
}

export interface GroupRoom {
  code: string;
  createdAt: string;
  activeStackIds: StackId[];
  timerMinutes?: number;
  expiresAt?: string;
}

export interface GroupSubmission {
  id: string;
  roomCode: string;
  text: string;
  language: Language;
  authorName?: string;
  sourceCardId?: string;
  status: 'pending' | 'promoted' | 'dismissed';
  promotedStackId?: StackId;
  createdAt: string;
}

export type PlayMode =
  | { type: 'journey' }
  | {
      type: 'stacks';
      stackIds: StackId[];
      quoteSubdeck?: QuoteSubdeck | 'all';
      ruhiChapter?: RuhiChapter | 'all';
    };
