import { BlobNotFoundError, get, list, put } from '@vercel/blob';
import { CURATED_QUESTIONS } from '../../src/data/questions.js';
import { CURATED_QUOTES } from '../../src/data/quotes.js';
import { STACKS, STACK_ICON_IDS } from '../../src/data/stacks.js';
import type {
  CardItem,
  CardKind,
  CardRating,
  GroupRoom,
  GroupSubmission,
  ReviewerRecord,
  StackIconId,
  StackMeta,
} from '../../src/types/deck';

export const ADMIN_AUTH_PATH = 'resonance/admin-auth.json';
export const STACKS_PATH = 'resonance/stacks.json';
export const CARDS_PATH = 'resonance/cards.json';
export const RATINGS_PATH = 'resonance/ratings.json';
export const INBOX_PATH = 'resonance/submissions-inbox.json';
export const REVIEW_PREFIX = 'resonance/reviews/';
export const REVIEW_STATE_PATH = 'resonance/review-state.json';

export function reviewerBlobPath(reviewerId: string): string {
  return `${REVIEW_PREFIX}${reviewerId}.json`;
}

export interface ReviewStateRecord {
  promotedIds: string[];
  dismissedEditIds: string[];
}

export function roomBlobPath(code: string): string {
  return `resonance/rooms/${code}.json`;
}

export const SEED_CARDS: CardItem[] = [...CURATED_QUESTIONS, ...CURATED_QUOTES];

export interface AdminAuthRecord {
  email: string;
  hash: string;
  salt: string;
  createdAt: string;
}

export interface RoomRecord {
  room: GroupRoom;
  submissions: GroupSubmission[];
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export async function readJsonBlob<T>(pathname: string): Promise<T | null> {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return null;
    }
    return (await new Response(res.stream).json()) as T;
  } catch (err) {
    if (err instanceof BlobNotFoundError) {
      return null;
    }
    if (err instanceof Error && err.name === 'BlobNotFoundError') {
      return null;
    }
    throw err;
  }
}

export async function writeJsonBlob(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export async function getStacksOrSeed(): Promise<StackMeta[]> {
  const existing = await readJsonBlob<StackMeta[]>(STACKS_PATH);
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }
  await writeJsonBlob(STACKS_PATH, STACKS);
  return STACKS;
}

export async function getCardsOrSeed(): Promise<CardItem[]> {
  const existing = await readJsonBlob<CardItem[]>(CARDS_PATH);
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }
  await writeJsonBlob(CARDS_PATH, SEED_CARDS);
  return SEED_CARDS;
}

export async function getRatings(): Promise<CardRating[]> {
  const existing = await readJsonBlob<CardRating[]>(RATINGS_PATH);
  return Array.isArray(existing) ? existing : [];
}

export async function getInboxSubmissions(): Promise<GroupSubmission[]> {
  const existing = await readJsonBlob<GroupSubmission[]>(INBOX_PATH);
  return Array.isArray(existing) ? existing : [];
}

export async function getReviewState(): Promise<ReviewStateRecord> {
  const existing = await readJsonBlob<ReviewStateRecord>(REVIEW_STATE_PATH);
  return {
    promotedIds: Array.isArray(existing?.promotedIds) ? existing.promotedIds : [],
    dismissedEditIds: Array.isArray(existing?.dismissedEditIds) ? existing.dismissedEditIds : [],
  };
}

export async function listAllReviewerRecords(): Promise<ReviewerRecord[]> {
  const pathnames: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: REVIEW_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (blob.pathname.endsWith('.json')) {
        pathnames.push(blob.pathname);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const records: ReviewerRecord[] = [];
  const batchSize = 12;
  for (let i = 0; i < pathnames.length; i += batchSize) {
    const chunk = pathnames.slice(i, i + batchSize);
    const loaded = await Promise.all(
      chunk.map((pathname) => readJsonBlob<ReviewerRecord>(pathname)),
    );
    for (const item of loaded) {
      if (item && typeof item.reviewerId === 'string') {
        records.push(item);
      }
    }
  }
  return records;
}

export function sanitizeHttpUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function validateStackInput(
  raw: unknown,
  fallbackRing: number,
): { ok: true; stack: StackMeta } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid stack payload.' };
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) {
    return {
      ok: false,
      error: 'Stack ID must be 2–40 lowercase letters, digits, or hyphens.',
    };
  }
  const nameDe = typeof obj.nameDe === 'string' ? obj.nameDe.trim() : '';
  const nameEn = typeof obj.nameEn === 'string' ? obj.nameEn.trim() : '';
  const subtitleDe = typeof obj.subtitleDe === 'string' ? obj.subtitleDe.trim() : '';
  const subtitleEn = typeof obj.subtitleEn === 'string' ? obj.subtitleEn.trim() : '';
  if (!nameDe || !nameEn) {
    return { ok: false, error: 'German and English stack names are required.' };
  }
  const iconCandidate =
    typeof obj.iconId === 'string' && (STACK_ICON_IDS as string[]).includes(obj.iconId)
      ? (obj.iconId as StackIconId)
      : (STACK_ICON_IDS as string[]).includes(id)
        ? (id as StackIconId)
        : 'reflection';

  const ring =
    typeof obj.ring === 'number' && Number.isFinite(obj.ring) && obj.ring >= 1
      ? Math.round(obj.ring)
      : fallbackRing;

  return {
    ok: true,
    stack: {
      id,
      ring,
      iconId: iconCandidate,
      nameDe: nameDe.slice(0, 80),
      nameEn: nameEn.slice(0, 80),
      subtitleDe: subtitleDe.slice(0, 120),
      subtitleEn: subtitleEn.slice(0, 120),
      accent: 'var(--accent)',
      accentSoft: 'var(--accent-soft)',
      archived: Boolean(obj.archived),
    },
  };
}

export function validateCardInput(
  raw: unknown,
  validStackIds: Set<string>,
): { ok: true; card: CardItem } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid card payload.' };
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(id)) {
    return { ok: false, error: 'Invalid card ID.' };
  }

  const stackId = typeof obj.stackId === 'string' ? obj.stackId.trim() : '';
  if (!validStackIds.has(stackId)) {
    return { ok: false, error: `Unknown stack "${stackId}".` };
  }

  const kind = obj.kind as CardKind;
  if (kind !== 'question' && kind !== 'wildcard' && kind !== 'quote') {
    return { ok: false, error: 'Invalid card kind.' };
  }

  const de = typeof obj.de === 'string' ? obj.de.trim() : '';
  const en = typeof obj.en === 'string' ? obj.en.trim() : '';
  if (!de || !en) {
    return { ok: false, error: 'Both German and English card text are required.' };
  }
  if (de.length > 2000 || en.length > 2000) {
    return { ok: false, error: 'Card text exceeds maximum length (2000 chars).' };
  }

  const cleanOpt = (val: unknown, max = 1000): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const t = val.trim();
    return t ? t.slice(0, max) : undefined;
  };

  const quoteSubdeck =
    obj.quoteSubdeck === 'general' || obj.quoteSubdeck === 'ruhi' ? obj.quoteSubdeck : undefined;
  const ruhiChapter =
    obj.ruhiChapter === 1 || obj.ruhiChapter === 2 || obj.ruhiChapter === 3
      ? obj.ruhiChapter
      : undefined;

  return {
    ok: true,
    card: {
      id,
      stackId,
      kind,
      de,
      en,
      digDeeperDe: cleanOpt(obj.digDeeperDe),
      digDeeperEn: cleanOpt(obj.digDeeperEn),
      quoteSubdeck: kind === 'quote' ? quoteSubdeck : undefined,
      ruhiChapter: kind === 'quote' && quoteSubdeck === 'ruhi' ? ruhiChapter : undefined,
      author: cleanOpt(obj.author, 200),
      sourceLabelDe: cleanOpt(obj.sourceLabelDe, 200),
      sourceLabelEn: cleanOpt(obj.sourceLabelEn, 200),
      sourceUrlDe: sanitizeHttpUrl(obj.sourceUrlDe),
      sourceUrlEn: sanitizeHttpUrl(obj.sourceUrlEn),
      promptDe: cleanOpt(obj.promptDe, 1000),
      promptEn: cleanOpt(obj.promptEn, 1000),
      archived: Boolean(obj.archived),
      isCustom: obj.isCustom === undefined ? true : Boolean(obj.isCustom),
      contributedBy: cleanOpt(obj.contributedBy, 120),
      createdAt:
        typeof obj.createdAt === 'string' && obj.createdAt
          ? obj.createdAt
          : new Date().toISOString(),
    },
  };
}
