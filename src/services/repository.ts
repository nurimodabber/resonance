import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { CURATED_QUESTIONS } from '../data/questions';
import { CURATED_QUOTES } from '../data/quotes';
import type {
  CardItem,
  CardRating,
  CardRatingSummary,
  GroupRoom,
  GroupSubmission,
  Language,
  StackId,
} from '../types/deck';

export const SEED_CARDS: CardItem[] = [...CURATED_QUESTIONS, ...CURATED_QUOTES];

const LS_CARDS = 'resonance.localCards.v1';
const LS_RATINGS = 'resonance.localRatings.v1';
const LS_ROOMS = 'resonance.localRooms.v1';
const LS_SUBMISSIONS = 'resonance.localSubmissions.v1';
const LS_SESSION_ID = 'resonance.sessionId.v1';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL?.trim() && SUPABASE_KEY?.trim());

const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!.trim(), SUPABASE_KEY!.trim())
  : null;

const syncChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('resonance-sync') : null;

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

// ---------- Mapping helpers between TypeScript CardItem and Postgres snake_case ----------
interface CardRow {
  id: string;
  stack_id: StackId;
  kind: 'question' | 'wildcard' | 'quote';
  de: string;
  en: string;
  dig_deeper_de?: string | null;
  dig_deeper_en?: string | null;
  quote_subdeck?: 'general' | 'ruhi' | null;
  ruhi_chapter?: 1 | 2 | 3 | null;
  author?: string | null;
  source_label_de?: string | null;
  source_label_en?: string | null;
  source_url_de?: string | null;
  source_url_en?: string | null;
  prompt_de?: string | null;
  prompt_en?: string | null;
  archived: boolean;
  is_custom: boolean;
  contributed_by?: string | null;
  created_at?: string;
}

function rowToCard(row: CardRow): CardItem {
  return {
    id: row.id,
    stackId: row.stack_id,
    kind: row.kind,
    de: row.de,
    en: row.en,
    digDeeperDe: row.dig_deeper_de ?? undefined,
    digDeeperEn: row.dig_deeper_en ?? undefined,
    quoteSubdeck: row.quote_subdeck ?? undefined,
    ruhiChapter: row.ruhi_chapter ?? undefined,
    author: row.author ?? undefined,
    sourceLabelDe: row.source_label_de ?? undefined,
    sourceLabelEn: row.source_label_en ?? undefined,
    sourceUrlDe: row.source_url_de ?? undefined,
    sourceUrlEn: row.source_url_en ?? undefined,
    promptDe: row.prompt_de ?? undefined,
    promptEn: row.prompt_en ?? undefined,
    archived: row.archived,
    isCustom: row.is_custom,
    contributedBy: row.contributed_by ?? undefined,
    createdAt: row.created_at,
  };
}

function cardToRow(card: CardItem): CardRow {
  return {
    id: card.id,
    stack_id: card.stackId,
    kind: card.kind,
    de: card.de,
    en: card.en,
    dig_deeper_de: card.digDeeperDe ?? null,
    dig_deeper_en: card.digDeeperEn ?? null,
    quote_subdeck: card.quoteSubdeck ?? null,
    ruhi_chapter: card.ruhiChapter ?? null,
    author: card.author ?? null,
    source_label_de: card.sourceLabelDe ?? null,
    source_label_en: card.sourceLabelEn ?? null,
    source_url_de: card.sourceUrlDe ?? null,
    source_url_en: card.sourceUrlEn ?? null,
    prompt_de: card.promptDe ?? null,
    prompt_en: card.promptEn ?? null,
    archived: Boolean(card.archived),
    is_custom: Boolean(card.isCustom),
    contributed_by: card.contributedBy ?? null,
  };
}

// ---------- Repository API ----------

export async function fetchAllCards(): Promise<CardItem[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data && data.length > 0) {
      return (data as CardRow[]).map(rowToCard);
    }
    return SEED_CARDS;
  }

  const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
  const merged = SEED_CARDS.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
  const seedIds = new Set(SEED_CARDS.map((c) => c.id));
  const customOnly = Object.values(overrides).filter((c) => !seedIds.has(c.id));
  return [...merged, ...customOnly];
}

export async function upsertCard(card: CardItem): Promise<CardItem> {
  const payload: CardItem = {
    ...card,
    createdAt: card.createdAt || new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('cards')
      .upsert(cardToRow(payload))
      .select()
      .single();
    if (error) throw error;
    return rowToCard(data as CardRow);
  }

  const overrides = lsRead<Record<string, CardItem>>(LS_CARDS, {});
  overrides[payload.id] = payload;
  lsWrite(LS_CARDS, overrides);
  syncChannel?.postMessage({ type: 'cards-updated' });
  return payload;
}

export async function seedSupabaseCards(): Promise<number> {
  if (!supabase) return SEED_CARDS.length;
  const rows = SEED_CARDS.map(cardToRow);
  const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return rows.length;
}

export async function recordCardRating(cardId: string, vote: 1 | -1): Promise<void> {
  const sessionId = getSessionId();

  // Group-contributed runtime cards have synthetic `grp-` IDs; map back if from catalog, skip FK failure
  if (cardId.startsWith('grp-')) {
    const localRatings = lsRead<CardRating[]>(LS_RATINGS, []);
    localRatings.push({
      id: `${Date.now()}-${Math.random()}`,
      cardId,
      vote,
      sessionId,
      createdAt: new Date().toISOString(),
    });
    lsWrite(LS_RATINGS, localRatings);
    return;
  }

  if (supabase) {
    const { error } = await supabase.from('card_ratings').insert({
      card_id: cardId,
      vote,
      session_id: sessionId,
    });
    if (!error) return;
  }

  const localRatings = lsRead<CardRating[]>(LS_RATINGS, []);
  localRatings.push({
    id: `${Date.now()}-${Math.random()}`,
    cardId,
    vote,
    sessionId,
    createdAt: new Date().toISOString(),
  });
  lsWrite(LS_RATINGS, localRatings);
}

export async function fetchAllRatings(): Promise<CardRating[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('card_ratings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (!error && data) {
      return data.map((r) => ({
        id: r.id as string,
        cardId: r.card_id as string,
        vote: r.vote as 1 | -1,
        sessionId: r.session_id as string,
        createdAt: r.created_at as string,
      }));
    }
  }
  return lsRead<CardRating[]>(LS_RATINGS, []);
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

  if (supabase) {
    const { error } = await supabase.from('group_rooms').insert({
      code,
      active_stack_ids: activeStackIds,
      timer_minutes: timerMinutes ?? null,
      expires_at: expiresAt ?? null,
    });
    if (!error) return room;
  }

  const rooms = lsRead<Record<string, GroupRoom>>(LS_ROOMS, {});
  rooms[code] = room;
  lsWrite(LS_ROOMS, rooms);
  return room;
}

export async function fetchGroupRoom(code: string): Promise<GroupRoom | null> {
  const normalized = code.trim().toUpperCase();
  if (supabase) {
    const { data, error } = await supabase
      .from('group_rooms')
      .select('*')
      .eq('code', normalized)
      .maybeSingle();
    if (!error && data) {
      return {
        code: data.code as string,
        createdAt: data.created_at as string,
        activeStackIds: (data.active_stack_ids as StackId[]) || [],
        timerMinutes: (data.timer_minutes as number | null) ?? undefined,
        expiresAt: (data.expires_at as string | null) ?? undefined,
      };
    }
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

  if (supabase) {
    // Ensure room exists for seamless ad-hoc join links
    await supabase
      .from('group_rooms')
      .upsert({ code: normalizedRoom, active_stack_ids: [] }, { onConflict: 'code' });

    const { data, error } = await supabase
      .from('group_submissions')
      .insert({
        room_code: normalizedRoom,
        text: trimmedText,
        language: input.language,
        author_name: authorName ?? null,
        source_card_id: input.sourceCardId ?? null,
      })
      .select()
      .single();

    if (!error && data) {
      return {
        id: data.id as string,
        roomCode: data.room_code as string,
        text: data.text as string,
        language: data.language as Language,
        authorName: (data.author_name as string | null) ?? undefined,
        sourceCardId: (data.source_card_id as string | null) ?? undefined,
        status: data.status as GroupSubmission['status'],
        promotedStackId: (data.promoted_stack_id as StackId | null) ?? undefined,
        createdAt: data.created_at as string,
      };
    }
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

  if (supabase) {
    let query = supabase
      .from('group_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (normalized) {
      query = query.eq('room_code', normalized);
    }
    const { data, error } = await query;
    if (!error && data) {
      return data.map((d) => ({
        id: d.id as string,
        roomCode: d.room_code as string,
        text: d.text as string,
        language: d.language as Language,
        authorName: (d.author_name as string | null) ?? undefined,
        sourceCardId: (d.source_card_id as string | null) ?? undefined,
        status: d.status as GroupSubmission['status'],
        promotedStackId: (d.promoted_stack_id as StackId | null) ?? undefined,
        createdAt: d.created_at as string,
      }));
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

  if (supabase) {
    const channel = supabase
      .channel(`room-${normalized}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_submissions',
          filter: `room_code=eq.${normalized}`,
        },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          onSubmission({
            id: d.id as string,
            roomCode: d.room_code as string,
            text: d.text as string,
            language: d.language as Language,
            authorName: (d.author_name as string | null) ?? undefined,
            sourceCardId: (d.source_card_id as string | null) ?? undefined,
            status: (d.status as GroupSubmission['status']) || 'pending',
            promotedStackId: (d.promoted_stack_id as StackId | null) ?? undefined,
            createdAt: d.created_at as string,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

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

  return () => {
    syncChannel?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

export async function updateSubmissionStatus(
  id: string,
  status: GroupSubmission['status'],
  promotedStackId?: StackId,
): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from('group_submissions')
      .update({
        status,
        promoted_stack_id: promotedStackId ?? null,
      })
      .eq('id', id);
    if (error) throw error;
    return;
  }

  const list = lsRead<GroupSubmission[]>(LS_SUBMISSIONS, []);
  const updated = list.map((item) =>
    item.id === id ? { ...item, status, promotedStackId } : item,
  );
  lsWrite(LS_SUBMISSIONS, updated);
}

// ---------- Admin Auth helpers (Supabase) ----------

export async function getAdminUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signInAdmin(email: string, password: string): Promise<User> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error || new Error('Sign in failed');
  return data.user;
}

export async function signOutAdmin(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
