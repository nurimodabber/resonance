export type StackIconId =
  | 'warmup'
  | 'reflection'
  | 'vulnerability'
  | 'friendship'
  | 'spirituality'
  | 'quotes';

export type StackId = string;

export type QuoteSubdeck = 'general' | 'ruhi';
export type RuhiChapter = 1 | 2 | 3;
export type CardKind = 'question' | 'wildcard' | 'quote';
export type Language = 'de' | 'en';
export type ThemeMode = 'dark' | 'light';

export interface StackMeta {
  id: StackId;
  ring: number; // 1 = outer ring, 5 = core, 6 = wisdom companion, 7+ = custom
  iconId?: StackIconId;
  nameDe: string;
  nameEn: string;
  subtitleDe: string;
  subtitleEn: string;
  accent: string;
  accentSoft: string;
  archived?: boolean;
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

export type JourneyLength = number | 'all';

export type PlayMode =
  | { type: 'journey'; length?: JourneyLength }
  | {
      type: 'stacks';
      stackIds: StackId[];
      quoteSubdeck?: QuoteSubdeck | 'all';
      ruhiChapter?: RuhiChapter | 'all';
    };

export type ReviewVote = -2 | -1 | 1 | 2;

export interface ReviewEditSuggestion {
  text: string;
  language: Language;
  updatedAt: string;
}

export interface ReviewerRecord {
  reviewerId: string;
  reviewerName?: string;
  updatedAt: string;
  votes: Record<string, ReviewVote>;
  edits: Record<string, ReviewEditSuggestion>;
}

export interface AggregatedEditSuggestion {
  id: string;
  cardId: string;
  reviewerId: string;
  reviewerName?: string;
  suggestedText: string;
  language: Language;
  updatedAt: string;
  dismissed: boolean;
}

export interface ReviewCardStats {
  cardId: string;
  source: 'suggestion' | 'live';
  card: CardItem;
  up2: number;
  up1: number;
  down1: number;
  down2: number;
  voteCount: number;
  weightedScore: number;
  averageScore: number;
  positiveRatio: number;
  edits: AggregatedEditSuggestion[];
  promoted: boolean;
  recommended: boolean;
}

export type RecommendationPreset = 'auto' | 'top33' | 'top50' | 'top67';
