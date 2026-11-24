import { CURATED_QUESTIONS } from '../data/questions';
import { CURATED_QUOTES } from '../data/quotes';
import { buildStackMap, STACKS } from '../data/stacks';
import { aggregateReviewStats } from '../utils/reviewScoring';
import type {
  CardItem,
  CardRating,
  CardRatingSummary,
  GroupRoom,
  GroupSubmission,
  Language,
  ReviewCardStats,
  ReviewerRecord,
  ReviewVote,
  StackId,
  StackMeta,
} from '../types/deck';

export const SEED_STACKS: StackMeta[] = STACKS;
export const SEED_CARDS: CardItem[] = [...CURATED_QUESTIONS, ...CURATED_QUOTES];

export type BackendMode = 'vercel' | 'local';

export interface AdminAuthStatus {
  mode: BackendMode;
  configured: boolean;
  hasAdmin: boolean;
  authenticated: boolean;
  email: string | null;
}

export interface AdminInsightsData {
  stacks: StackMeta[];
  cards: CardItem[];
  ratings: CardRating[];
  submissions: GroupSubmission[];
}

export interface ReviewBundle {
  mode: BackendMode;
  stacks: StackMeta[];
  liveCards: CardItem[];
  suggestions: CardItem[];
  promotedIds: string[];
  myRecord: ReviewerRecord;
}

export interface ReviewerSummaryItem {
  reviewerId: string;
  reviewerName?: string;
  voteCount: number;
  editCount: number;
  updatedAt: string;
}

export interface AdminReviewSummary {
  reviewerCount: number;
  reviewers: ReviewerSummaryItem[];
  stacks: StackMeta[];
  stats: ReviewCardStats[];
  promotedIds: string[];
  dismissedEditIds: string[];
}

const LS_STACKS = 'resonance.localStacks.v1';
const LS_CARDS = 'resonance.localCards.v1';
const LS_DELETED_CARDS = 'resonance.localDeletedCards.v1';
const LS_RATINGS = 'resonance.localRatings.v1';
const LS_ROOMS = 'resonance.localRooms.v1';
const LS_SUBMISSIONS = 'resonance.localSubmissions.v1';
const LS_REVIEWER_ID = 'resonance.reviewerId.v1';
const LS_REVIEWER_NAME = 'resonance.reviewerName.v1';
const LS_LOCAL_REVIEW = 'resonance.localReviewRecord.v1';
const LS_LOCAL_REVIEW_STATE = 'resonance.localReviewState.v1';
const LS_SESSION_ID = 'resonance.sessionId.v1';

let detectedBackend: BackendMode | null = null;

const syncChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('resonance-sync') : null;

export function getBackendMode(): BackendMode {
  return detectedBackend ?? 'local';
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session';
  let sid = localStorage.getItem(LS_SESSION_ID);
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random()}`;
    localStorage.setItem(LS_SESSION_ID, sid);
  }
  return sid;
}

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota warnings
  }
}

async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, status: res.status, error: `Unexpected response (${res.status})` };
    }
    const payload = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: payload?.error || `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

async function ensureBackendProbed(): Promise<BackendMode> {
  if (detectedBackend) return detectedBackend;
  const res = await apiJson<{ mode?: string }>('/api/catalog');
  if (res.ok && res.data.mode === 'vercel') {
    detectedBackend = 'vercel';
  } else {
    detectedBackend = 'local';
  }
  return detectedBackend;
}

// ---------- Local storage fallbacks ----------

function readLocalStacks(includeArchived = false): StackMeta[] {
  const stored = lsRead<StackMeta[] | null>(LS_STACKS, null);
  const list = Array.isArray(stored) && stored.length > 0 ? stored : SEED_STACKS;
  const sorted = list.slice().sort((a, b) => a.ring - b.ring);
  return includeArchived ? sorted : sorted.filter((s) => !s.archived);
}

function writeLocalStacks(stacks: StackMeta[]): StackMeta[] {
  const normalized = stacks
    .slice()
    .map((s, idx) => ({ ...s, ring: idx + 1 }));
  lsWrite(LS_STACKS, normalized);
  syncChannel?.postMessage({ type: 'cards-updated' });
  return normalized;
}

function readLocalCards(includeArchived = false): CardItem[] {
  const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
  const deletedIds = new Set(lsRead<string[]>(LS_DELETED_CARDS, []));
  const mergedSeed = SEED_CARDS.filter((c) => !deletedIds.has(c.id)).map((c) =>
    overrides[c.id] ? { ...c, ...overrides[c.id] } : c,
  );
  const seedIds = new Set(SEED_CARDS.map((c) => c.id));
  const customOnly = Object.values(overrides).filter(
    (c) => !seedIds.has(c.id) && !deletedIds.has(c.id),
  );
  const all = [...customOnly, ...mergedSeed];
  return includeArchived ? all : all.filter((c) => !c.archived);
}

// ---------- Public Catalog ----------

export async function fetchCatalog(includeArchived = false): Promise<{
  mode: BackendMode;
  stacks: StackMeta[];
  cards: CardItem[];
}> {
  const query = includeArchived ? '/api/catalog?includeArchived=1' : '/api/catalog';
  const res = await apiJson<{ mode?: string; stacks?: StackMeta[]; cards?: CardItem[] }>(query);
  if (res.ok && res.data.mode === 'vercel' && Array.isArray(res.data.stacks) && Array.isArray(res.data.cards)) {
    detectedBackend = 'vercel';
    return {
      mode: 'vercel',
      stacks: res.data.stacks,
      cards: res.data.cards,
    };
  }

  if (!res.ok && (res.status === 404 || res.status === 0)) {
    detectedBackend = 'local';
  }
  return {
    mode: getBackendMode(),
    stacks: readLocalStacks(includeArchived),
    cards: readLocalCards(includeArchived),
  };
}

export async function fetchAllCards(includeArchived = false): Promise<CardItem[]> {
  const catalog = await fetchCatalog(includeArchived);
  return catalog.cards;
}

export async function fetchAllStacks(includeArchived = false): Promise<StackMeta[]> {
  const catalog = await fetchCatalog(includeArchived);
  return catalog.stacks;
}

// ---------- Admin Authentication ----------

export async function fetchAdminAuthStatus(): Promise<AdminAuthStatus> {
  const res = await apiJson<{
    configured: boolean;
    hasAdmin: boolean;
    authenticated: boolean;
    email: string | null;
  }>('/api/admin/auth');

  if (res.ok) {
    detectedBackend = 'vercel';
    return {
      mode: 'vercel',
      configured: res.data.configured,
      hasAdmin: res.data.hasAdmin,
      authenticated: res.data.authenticated,
      email: res.data.email,
    };
  }

  detectedBackend = 'local';
  return {
    mode: 'local',
    configured: false,
    hasAdmin: false,
    authenticated: true,
    email: null,
  };
}

export async function setupAdmin(email: string, password: string): Promise<{ email: string }> {
  const res = await apiJson<{ ok: boolean; email: string }>('/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'setup', email, password }),
  });
  if (!res.ok) throw new Error(res.error);
  return { email: res.data.email };
}

export async function loginAdmin(email: string, password: string): Promise<{ email: string }> {
  const res = await apiJson<{ ok: boolean; email: string }>('/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', email, password }),
  });
  if (!res.ok) throw new Error(res.error);
  return { email: res.data.email };
}

export async function logoutAdmin(): Promise<void> {
  if (getBackendMode() === 'local') return;
  await apiJson('/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'logout' }),
  });
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await apiJson<{ ok: boolean }>('/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'change-password', currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(res.error);
}

// ---------- Admin Card & Stack Curation ----------

export async function upsertCard(card: CardItem): Promise<CardItem> {
  const payload: CardItem = {
    ...card,
    createdAt: card.createdAt || new Date().toISOString(),
  };

  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ card: CardItem }>('/api/admin/cards', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert', card: payload }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.card;
  }

  const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
  overrides[payload.id] = payload;
  lsWrite(LS_CARDS, overrides);
  const deleted = lsRead<string[]>(LS_DELETED_CARDS, []).filter((id) => id !== payload.id);
  lsWrite(LS_DELETED_CARDS, deleted);
  syncChannel?.postMessage({ type: 'cards-updated' });
  return payload;
}

export async function moveCardStack(id: string, stackId: StackId): Promise<CardItem> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ card: CardItem }>('/api/admin/cards', {
      method: 'POST',
      body: JSON.stringify({ action: 'move', id, stackId }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.card;
  }

  const all = readLocalCards(true);
  const target = all.find((c) => c.id === id);
  if (!target) throw new Error('Card not found');
  return upsertCard({ ...target, stackId });
}

export async function archiveCard(id: string, archived: boolean): Promise<CardItem> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ card: CardItem }>('/api/admin/cards', {
      method: 'POST',
      body: JSON.stringify({ action: 'archive', id, archived }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.card;
  }

  const all = readLocalCards(true);
  const target = all.find((c) => c.id === id);
  if (!target) throw new Error('Card not found');
  return upsertCard({ ...target, archived });
}

export async function deleteCard(id: string): Promise<void> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ ok: boolean }>(`/api/admin/cards?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(res.error);
    return;
  }

  const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
  delete overrides[id];
  lsWrite(LS_CARDS, overrides);
  const deleted = new Set(lsRead<string[]>(LS_DELETED_CARDS, []));
  deleted.add(id);
  lsWrite(LS_DELETED_CARDS, [...deleted]);
  syncChannel?.postMessage({ type: 'cards-updated' });
}

export async function reseedMissingCards(): Promise<{ addedCount: number; total: number }> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ addedCount: number; total: number }>('/api/admin/cards', {
      method: 'POST',
      body: JSON.stringify({ action: 'reseed' }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  const before = lsRead<string[]>(LS_DELETED_CARDS, []).length;
  lsWrite(LS_DELETED_CARDS, []);
  const cards = readLocalCards(true);
  return { addedCount: before, total: cards.length };
}

export async function upsertStack(stack: StackMeta): Promise<StackMeta[]> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ stacks: StackMeta[] }>('/api/admin/stacks', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert', stack }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.stacks;
  }

  const current = readLocalStacks(true);
  const idx = current.findIndex((s) => s.id === stack.id);
  const next = current.slice();
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...stack, ring: current[idx].ring };
  } else {
    next.push({ ...stack, ring: current.length + 1 });
  }
  return writeLocalStacks(next);
}

export async function reorderStacks(orderedIds: StackId[]): Promise<StackMeta[]> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ stacks: StackMeta[] }>('/api/admin/stacks', {
      method: 'POST',
      body: JSON.stringify({ action: 'reorder', orderedIds }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.stacks;
  }

  const current = readLocalStacks(true);
  const map = buildStackMap(current);
  const ordered: StackMeta[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (map[id] && !seen.has(id)) {
      ordered.push(map[id]);
      seen.add(id);
    }
  }
  for (const s of current) {
    if (!seen.has(s.id)) ordered.push(s);
  }
  return writeLocalStacks(ordered);
}

export async function archiveStack(id: StackId, archived: boolean): Promise<StackMeta[]> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ stacks: StackMeta[] }>('/api/admin/stacks', {
      method: 'POST',
      body: JSON.stringify({ action: 'archive', id, archived }),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.stacks;
  }

  const current = readLocalStacks(true);
  if (archived && current.filter((s) => s.id !== id && !s.archived).length === 0) {
    throw new Error('At least one active stack must remain visible.');
  }
  return writeLocalStacks(current.map((s) => (s.id === id ? { ...s, archived } : s)));
}

export async function deleteStack(id: StackId, reassignTo?: StackId): Promise<StackMeta[]> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const params = new URLSearchParams({ id });
    if (reassignTo) params.set('reassignTo', reassignTo);
    const res = await apiJson<{ stacks: StackMeta[] }>(`/api/admin/stacks?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.stacks;
  }

  const current = readLocalStacks(true);
  const remaining = current.filter((s) => s.id !== id);
  if (remaining.length === 0) throw new Error('At least one stack must remain.');

  const allCards = readLocalCards(true);
  const affected = allCards.filter((c) => c.stackId === id);
  if (affected.length > 0) {
    if (!reassignTo || reassignTo === id || !remaining.some((s) => s.id === reassignTo)) {
      throw new Error('Choose another stack to receive cards before deleting.');
    }
    const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
    for (const card of affected) {
      overrides[card.id] = { ...card, stackId: reassignTo };
    }
    lsWrite(LS_CARDS, overrides);
  }

  return writeLocalStacks(remaining);
}

// ---------- Ratings & Admin Insights ----------

export async function recordCardRating(cardId: string, vote: 1 | -1): Promise<void> {
  const sessionId = getSessionId();

  if (getBackendMode() === 'vercel') {
    const res = await apiJson<{ ok: boolean }>('/api/ratings', {
      method: 'POST',
      body: JSON.stringify({ cardId, vote, sessionId }),
    });
    if (res.ok) return;
  }

  const localRatings = lsRead<CardRating[]>(LS_RATINGS, []);
  const filtered = localRatings.filter(
    (r) => !(r.cardId === cardId && r.sessionId === sessionId),
  );
  filtered.unshift({
    id: `${Date.now()}-${Math.random()}`,
    cardId,
    vote,
    sessionId,
    createdAt: new Date().toISOString(),
  });
  lsWrite(LS_RATINGS, filtered.slice(0, 5000));
}

export async function fetchAllRatings(): Promise<CardRating[]> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<AdminInsightsData>('/api/admin/insights');
    if (res.ok) return res.data.ratings;
  }
  return lsRead<CardRating[]>(LS_RATINGS, []);
}

export async function fetchAdminInsights(): Promise<AdminInsightsData> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<AdminInsightsData>('/api/admin/insights');
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  return {
    stacks: readLocalStacks(true),
    cards: readLocalCards(true),
    ratings: lsRead<CardRating[]>(LS_RATINGS, []),
    submissions: lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []),
  };
}

export function summarizeRatings(ratings: CardRating[]): Record<string, CardRatingSummary> {
  const summary: Record<string, CardRatingSummary> = {};
  for (const r of ratings) {
    if (!summary[r.cardId]) {
      summary[r.cardId] = { up: 0, down: 0, net: 0, total: 0 };
    }
    const entry = summary[r.cardId];
    if (r.vote === 1) entry.up += 1;
    else entry.down += 1;
    entry.net = entry.up - entry.down;
    entry.total += 1;
  }
  return summary;
}

// ---------- QR Group Rooms & Live Question Pile ----------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export async function createGroupRoom(
  activeStackIds: StackId[],
  timerMinutes?: number,
): Promise<GroupRoom> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ room: GroupRoom }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', activeStackIds, timerMinutes }),
    });
    if (res.ok) return res.data.room;
  }

  const code = generateRoomCode();
  const now = new Date();
  const expiresAt = timerMinutes
    ? new Date(now.getTime() + timerMinutes * 60_000).toISOString()
    : undefined;

  const room: GroupRoom = {
    code,
    createdAt: now.toISOString(),
    activeStackIds,
    timerMinutes,
    expiresAt,
  };

  const rooms = lsRead<Record<string, GroupRoom>>(LS_ROOMS, {});
  rooms[code] = room;
  lsWrite(LS_ROOMS, rooms);
  return room;
}

export async function fetchGroupRoom(code: string): Promise<GroupRoom | null> {
  const normalized = code.trim().toUpperCase();
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ room: GroupRoom }>(`/api/rooms?code=${encodeURIComponent(normalized)}`);
    if (res.ok) return res.data.room;
  }

  const rooms = lsRead<Record<string, GroupRoom>>(LS_ROOMS, {});
  return rooms[normalized] ?? null;
}

export async function submitGroupQuestion(input: {
  roomCode: string;
  text: string;
  language: Language;
  authorName?: string;
  sourceCardId?: string;
}): Promise<GroupSubmission> {
  const normalizedRoom = input.roomCode.trim().toUpperCase();
  const trimmedText = input.text.trim();
  const authorName = input.authorName?.trim() || undefined;

  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ submission: GroupSubmission }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({
        action: 'submit',
        roomCode: normalizedRoom,
        text: trimmedText,
        language: input.language,
        authorName,
        sourceCardId: input.sourceCardId,
      }),
    });
    if (res.ok) return res.data.submission;
  }

  const sub: GroupSubmission = {
    id: crypto.randomUUID ? crypto.randomUUID() : `sub-${Date.now()}-${Math.random()}`,
    roomCode: normalizedRoom,
    text: trimmedText,
    language: input.language,
    authorName,
    sourceCardId: input.sourceCardId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const list = lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []);
  list.unshift(sub);
  lsWrite(LS_SUBMISSIONS, list);
  syncChannel?.postMessage({ type: 'submission-added', roomCode: normalizedRoom, submission: sub });
  return sub;
}

export async function fetchSubmissions(roomCode?: string): Promise<GroupSubmission[]> {
  const normalized = roomCode?.trim().toUpperCase();

  if ((await ensureBackendProbed()) === 'vercel') {
    if (normalized) {
      const res = await apiJson<{ submissions: GroupSubmission[] }>(
        `/api/rooms?code=${encodeURIComponent(normalized)}`,
      );
      if (res.ok) return res.data.submissions;
    } else {
      const res = await apiJson<AdminInsightsData>('/api/admin/insights');
      if (res.ok) return res.data.submissions;
    }
  }

  const all = lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []);
  return normalized ? all.filter((s) => s.roomCode === normalized) : all;
}

export function subscribeToRoomSubmissions(
  roomCode: string,
  onSubmission: (sub: GroupSubmission) => void,
): () => void {
  const normalized = roomCode.trim().toUpperCase();
  let stopped = false;

  const onMessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'submission-added' && ev.data?.roomCode === normalized) {
      onSubmission(ev.data.submission as GroupSubmission);
    }
  };
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === LS_SUBMISSIONS) {
      const latest = lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []).filter(
        (s) => s.roomCode === normalized,
      );
      if (latest[0]) onSubmission(latest[0]);
    }
  };

  syncChannel?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);

  // Poll Vercel room endpoint every 4s while host keeps QR room open
  const pollTimer = window.setInterval(async () => {
    if (stopped || getBackendMode() !== 'vercel') return;
    const res = await apiJson<{ submissions?: GroupSubmission[] }>(
      `/api/rooms?code=${encodeURIComponent(normalized)}`,
    );
    if (!stopped && res.ok && Array.isArray(res.data.submissions)) {
      for (const sub of res.data.submissions) {
        onSubmission(sub);
      }
    }
  }, 4000);

  return () => {
    stopped = true;
    window.clearInterval(pollTimer);
    syncChannel?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

export async function updateSubmissionStatus(
  id: string,
  status: GroupSubmission['status'],
  promotedStackId?: StackId,
  promotedCard?: CardItem,
): Promise<void> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ ok: boolean }>('/api/admin/insights', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update-submission',
        id,
        status,
        promotedStackId,
        card: promotedCard,
      }),
    });
    if (!res.ok) throw new Error(res.error);
    return;
  }

  if (status === 'promoted' && promotedCard) {
    await upsertCard(promotedCard);
  }
  const list = lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []);
  const updated = list.map((item) =>
    item.id === id ? { ...item, status, promotedStackId } : item,
  );
  lsWrite(LS_SUBMISSIONS, updated);
}

// ---------- Friend Review (/review) & Admin Recommendation Studio ----------

let reviewWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueReviewWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = reviewWriteQueue.then(task, task);
  reviewWriteQueue = next.catch(() => {});
  return next;
}

export function getReviewerId(): string {
  if (typeof window === 'undefined') return 'ssr_reviewer_id';
  let existing = localStorage.getItem(LS_REVIEWER_ID) || '';
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
    return existing;
  }
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  existing = `rev_${randomPart}`.slice(0, 40);
  localStorage.setItem(LS_REVIEWER_ID, existing);
  return existing;
}

export function getReviewerName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LS_REVIEWER_NAME) || '';
}

export function setReviewerNameLocal(name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim().slice(0, 40);
  if (trimmed) {
    localStorage.setItem(LS_REVIEWER_NAME, trimmed);
  } else {
    localStorage.removeItem(LS_REVIEWER_NAME);
  }
}

function readLocalReviewerRecord(): ReviewerRecord {
  const reviewerId = getReviewerId();
  const savedName = getReviewerName() || undefined;
  const existing = lsRead<ReviewerRecord | null>(LS_LOCAL_REVIEW, null);
  if (existing && existing.reviewerId) {
    return {
      reviewerId: existing.reviewerId,
      reviewerName: existing.reviewerName || savedName,
      updatedAt: existing.updatedAt || '',
      votes: existing.votes || {},
      edits: existing.edits || {},
    };
  }
  return {
    reviewerId,
    reviewerName: savedName,
    updatedAt: '',
    votes: {},
    edits: {},
  };
}

function readLocalReviewState(): { promotedIds: string[]; dismissedEditIds: string[] } {
  const state = lsRead<{ promotedIds?: string[]; dismissedEditIds?: string[] }>(
    LS_LOCAL_REVIEW_STATE,
    {},
  );
  return {
    promotedIds: Array.isArray(state.promotedIds) ? state.promotedIds : [],
    dismissedEditIds: Array.isArray(state.dismissedEditIds) ? state.dismissedEditIds : [],
  };
}

export async function fetchReviewBundle(): Promise<ReviewBundle> {
  const reviewerId = getReviewerId();
  const res = await apiJson<ReviewBundle>(
    `/api/review?reviewerId=${encodeURIComponent(reviewerId)}`,
  );
  if (res.ok && res.data.mode === 'vercel') {
    detectedBackend = 'vercel';
    if (res.data.myRecord?.reviewerName) {
      setReviewerNameLocal(res.data.myRecord.reviewerName);
    }
    return res.data;
  }

  if (!res.ok && (res.status === 404 || res.status === 0)) {
    detectedBackend = 'local';
  }

  const { REVIEW_SUGGESTIONS } = await import('../data/reviewSuggestions');
  const stacks = readLocalStacks(false);
  const liveCards = readLocalCards(false);
  const state = readLocalReviewState();
  const liveIds = new Set(liveCards.map((c) => c.id));
  const promotedSet = new Set([...state.promotedIds, ...liveIds]);

  return {
    mode: 'local',
    stacks,
    liveCards,
    suggestions: REVIEW_SUGGESTIONS.filter((s) => !promotedSet.has(s.id)),
    promotedIds: [...promotedSet],
    myRecord: readLocalReviewerRecord(),
  };
}

export async function saveReviewVote(
  cardId: string,
  vote: ReviewVote | 0,
  reviewerName?: string,
): Promise<string> {
  const reviewerId = getReviewerId();
  return enqueueReviewWrite(async () => {
    const now = new Date().toISOString();
    const localRec = readLocalReviewerRecord();
    if (reviewerName !== undefined) {
      setReviewerNameLocal(reviewerName);
      localRec.reviewerName = reviewerName.trim().slice(0, 40) || undefined;
    }
    if (vote === 0) {
      delete localRec.votes[cardId];
    } else {
      localRec.votes[cardId] = vote;
    }
    localRec.updatedAt = now;
    lsWrite(LS_LOCAL_REVIEW, localRec);

    if ((await ensureBackendProbed()) === 'vercel') {
      const res = await apiJson<{ ok: boolean; updatedAt?: string }>('/api/review', {
        method: 'POST',
        body: JSON.stringify({
          action: 'vote',
          reviewerId,
          reviewerName: localRec.reviewerName,
          cardId,
          vote,
        }),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data.updatedAt || now;
    }
    return now;
  });
}

export async function saveReviewEditSuggestion(
  cardId: string,
  suggestedText: string,
  language: Language,
  reviewerName?: string,
): Promise<string> {
  const reviewerId = getReviewerId();
  return enqueueReviewWrite(async () => {
    const now = new Date().toISOString();
    const trimmed = suggestedText.trim();
    const localRec = readLocalReviewerRecord();
    if (reviewerName !== undefined) {
      setReviewerNameLocal(reviewerName);
      localRec.reviewerName = reviewerName.trim().slice(0, 40) || undefined;
    }
    if (!trimmed) {
      delete localRec.edits[cardId];
    } else {
      localRec.edits[cardId] = { text: trimmed, language, updatedAt: now };
    }
    localRec.updatedAt = now;
    lsWrite(LS_LOCAL_REVIEW, localRec);

    if ((await ensureBackendProbed()) === 'vercel') {
      const res = await apiJson<{ ok: boolean; updatedAt?: string }>('/api/review', {
        method: 'POST',
        body: JSON.stringify({
          action: 'suggest-edit',
          reviewerId,
          reviewerName: localRec.reviewerName,
          cardId,
          suggestedText: trimmed,
          language,
        }),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data.updatedAt || now;
    }
    return now;
  });
}

export async function saveReviewerProfile(reviewerName: string): Promise<void> {
  const reviewerId = getReviewerId();
  setReviewerNameLocal(reviewerName);
  const trimmed = reviewerName.trim().slice(0, 40) || undefined;

  return enqueueReviewWrite(async () => {
    const localRec = readLocalReviewerRecord();
    localRec.reviewerName = trimmed;
    localRec.updatedAt = new Date().toISOString();
    lsWrite(LS_LOCAL_REVIEW, localRec);

    if ((await ensureBackendProbed()) === 'vercel') {
      const res = await apiJson<{ ok: boolean }>('/api/review', {
        method: 'POST',
        body: JSON.stringify({
          action: 'profile',
          reviewerId,
          reviewerName: trimmed,
        }),
      });
      if (!res.ok) throw new Error(res.error);
    }
  });
}

export async function fetchAdminReviewSummary(): Promise<AdminReviewSummary> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<AdminReviewSummary>('/api/admin/review');
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  const { REVIEW_SUGGESTIONS } = await import('../data/reviewSuggestions');
  const stacks = readLocalStacks(true);
  const liveCards = readLocalCards(true);
  const myRec = readLocalReviewerRecord();
  const reviewers =
    Object.keys(myRec.votes).length > 0 || Object.keys(myRec.edits).length > 0 ? [myRec] : [];
  const state = readLocalReviewState();

  return {
    reviewerCount: reviewers.length,
    reviewers: reviewers.map((r) => ({
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerName,
      voteCount: Object.keys(r.votes).length,
      editCount: Object.keys(r.edits).length,
      updatedAt: r.updatedAt,
    })),
    stacks,
    stats: aggregateReviewStats({
      suggestions: REVIEW_SUGGESTIONS,
      liveCards,
      reviewers,
      promotedIds: state.promotedIds,
      dismissedEditIds: state.dismissedEditIds,
      preset: 'auto',
    }),
    promotedIds: state.promotedIds,
    dismissedEditIds: state.dismissedEditIds,
  };
}

export async function promoteReviewSuggestions(
  items: Array<{ id: string; stackId?: string; de?: string; en?: string }>,
): Promise<{ addedCount: number; promotedIds: string[] }> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ ok: boolean; addedCount: number; promotedIds: string[] }>(
      '/api/admin/review',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'promote', items }),
      },
    );
    if (!res.ok) throw new Error(res.error);
    return { addedCount: res.data.addedCount, promotedIds: res.data.promotedIds };
  }

  const { REVIEW_SUGGESTIONS } = await import('../data/reviewSuggestions');
  const byId = new Map(REVIEW_SUGGESTIONS.map((c) => [c.id, c]));
  const state = readLocalReviewState();
  const promotedSet = new Set(state.promotedIds);
  let addedCount = 0;

  for (const item of items) {
    const src = byId.get(item.id);
    if (!src) continue;
    await upsertCard({
      ...src,
      stackId: item.stackId || src.stackId,
      de: item.de?.trim() || src.de,
      en: item.en?.trim() || src.en,
      isCustom: true,
      archived: false,
      createdAt: new Date().toISOString(),
    });
    promotedSet.add(item.id);
    addedCount += 1;
  }

  const nextState = { ...state, promotedIds: [...promotedSet] };
  lsWrite(LS_LOCAL_REVIEW_STATE, nextState);
  return { addedCount, promotedIds: nextState.promotedIds };
}

export async function applyReviewEditSuggestion(input: {
  cardId: string;
  language: Language;
  newText: string;
  editId: string;
}): Promise<void> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ ok: boolean }>('/api/admin/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply-edit', ...input }),
    });
    if (!res.ok) throw new Error(res.error);
    return;
  }

  const live = readLocalCards(true);
  const existing = live.find((c) => c.id === input.cardId);
  if (existing) {
    await upsertCard({ ...existing, [input.language]: input.newText });
  } else {
    const { REVIEW_SUGGESTIONS } = await import('../data/reviewSuggestions');
    const src = REVIEW_SUGGESTIONS.find((c) => c.id === input.cardId);
    if (src) {
      await upsertCard({
        ...src,
        [input.language]: input.newText,
        isCustom: true,
        archived: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  await dismissReviewEditSuggestion(input.editId);
}

export async function dismissReviewEditSuggestion(editId: string): Promise<void> {
  if ((await ensureBackendProbed()) === 'vercel') {
    const res = await apiJson<{ ok: boolean }>('/api/admin/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'dismiss-edit', editId }),
    });
    if (!res.ok) throw new Error(res.error);
    return;
  }

  const state = readLocalReviewState();
  const next = new Set(state.dismissedEditIds);
  next.add(editId);
  lsWrite(LS_LOCAL_REVIEW_STATE, { ...state, dismissedEditIds: [...next] });
}
