import { REVIEW_SUGGESTION_EXTRAS } from './reviewSuggestionsExtras.js';
import { REVIEW_SUGGESTION_QUESTIONS } from './reviewSuggestionsQuestions.js';
import type { CardItem } from '../types/deck';

export const REVIEW_SUGGESTIONS: CardItem[] = [
  ...REVIEW_SUGGESTION_QUESTIONS,
  ...REVIEW_SUGGESTION_EXTRAS,
];
