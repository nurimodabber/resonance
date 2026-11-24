import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ThumbDownIcon, ThumbUpIcon } from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { STACKS, STACK_MAP } from '../data/stacks';
import {
  fetchAllRatings,
  fetchSubmissions,
  getAdminUser,
  isSupabaseConfigured,
  SEED_CARDS,
  seedSupabaseCards,
  signInAdmin,
  signOutAdmin,
  summarizeRatings,
  updateSubmissionStatus,
  upsertCard,
} from '../services/repository';
import type { CardItem, CardRating, GroupSubmission, QuoteSubdeck, RuhiChapter, StackId } from '../types/deck';

type AdminTab = 'cards' | 'insights' | 'inbox' | 'setup';

export const AdminPage: React.FC = () => {
  const { lang, cards, refreshCards, navigate } = useResonance();
  const isDe = lang === 'de';

  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [isAuthed, setIsAuthed] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<AdminTab>('cards');
  const [ratings, setRatings] = useState<CardRating[]>([]);
  const [submissions, setSubmissions] = useState<GroupSubmission[]>([]);
  const [search, setSearch] = useState('');
  const [stackFilter, setStackFilter] = useState<StackId | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const [editing, setEditing] = useState<CardItem | null>(null);
  const [promoting, setPromoting] = useState<{
    sub: GroupSubmission;
    stackId: StackId;
    de: string;
    en: string;
  } | null>(null);
  const [statusBanner, setStatusBanner] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getAdminUser().then((user) => {
      setIsAuthed(Boolean(user));
      setAuthChecked(true);
    });
  }, []);

  const loadAdminData = async () => {
    const [r, s] = await Promise.all([fetchAllRatings(), fetchSubmissions()]);
    setRatings(r);
    setSubmissions(s);
  };

  useEffect(() => {
    if (isAuthed) {
      loadAdminData();
    }
  }, [isAuthed]);

  const ratingSummary = useMemo(() => summarizeRatings(ratings), [ratings]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (!showArchived && c.archived) return false;
      if (stackFilter !== 'all' && c.stackId !== stackFilter) return false;
      if (q) {
        return (
          c.de.toLowerCase().includes(q) ||
          c.en.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.author?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [cards, showArchived, stackFilter, search]);

  const sortedByRating = useMemo(() => {
    const withScores = cards
      .filter((c) => ratingSummary[c.id]?.total > 0)
      .map((c) => ({ card: c, score: ratingSummary[c.id] }));
    const best = [...withScores].sort((a, b) => b.score.net - a.score.net || b.score.up - a.score.up);
    const worst = [...withScores].sort((a, b) => a.score.net - b.score.net || b.score.down - a.score.down);
    return { best, worst };
  }, [cards, ratingSummary]);

  const stackRatingTotals = useMemo(() => {
    return STACKS.map((stack) => {
      let up = 0;
      let down = 0;
      for (const c of cards) {
        if (c.stackId !== stack.id) continue;
        const sum = ratingSummary[c.id];
        if (sum) {
          up += sum.up;
          down += sum.down;
        }
      }
      const total = up + down;
      const pct = total > 0 ? Math.round((up / total) * 100) : null;
      return { stack, up, down, total, pct };
    });
  }, [cards, ratingSummary]);

  const pendingInbox = useMemo(
    () => submissions.filter((s) => s.status === 'pending'),
    [submissions],
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInAdmin(email, password);
      setIsAuthed(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await upsertCard(editing);
    await refreshCards();
    setEditing(null);
    setStatusBanner(isDe ? 'Karte gespeichert.' : 'Card saved.');
  };

  const handleArchiveToggle = async (card: CardItem) => {
    await upsertCard({ ...card, archived: !card.archived });
    await refreshCards();
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoting) return;
    const newCard: CardItem = {
      id: `C_${Date.now()}`,
      stackId: promoting.stackId,
      kind: promoting.stackId === 'quotes' ? 'quote' : 'question',
      de: promoting.de.trim(),
      en: promoting.en.trim(),
      isCustom: true,
      contributedBy: promoting.sub.authorName,
      createdAt: new Date().toISOString(),
    };
    await upsertCard(newCard);
    await updateSubmissionStatus(promoting.sub.id, 'promoted', promoting.stackId);
    await Promise.all([refreshCards(), loadAdminData()]);
    setPromoting(null);
    setStatusBanner(isDe ? 'Frage dauerhaft in Stapel aufgenommen.' : 'Question promoted to permanent deck.');
  };

  const handleDismissSubmission = async (id: string) => {
    await updateSubmissionStatus(id, 'dismissed');
    await loadAdminData();
  };

  const handleSeedSupabase = async () => {
    const count = await seedSupabaseCards();
    await refreshCards();
    setStatusBanner(isDe ? `${count} kuratierte Karten in Supabase synchronisiert.` : `Synced ${count} curated cards to Supabase.`);
  };

  const exportCsv = () => {
    const header = ['id', 'stack', 'up', 'down', 'net', 'text_de', 'text_en'];
    const rows = cards.map((c) => {
      const s = ratingSummary[c.id] || { up: 0, down: 0, net: 0 };
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [c.id, c.stackId, s.up, s.down, s.net, esc(c.de), esc(c.en)].join(',');
    });
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance-ratings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance-deck-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authChecked) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
        Loading…
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="max-w-md mx-auto px-4 pt-12 pb-16">
        <div className="sculpted-bezel p-1.5 rounded-[28px]">
          <form onSubmit={handleLogin} className="cardstock rounded-[22px] p-6 sm:p-7 space-y-4">
            <h1 className="font-serif-card text-2xl font-medium m-0">
              {isDe ? 'Admin-Zugang' : 'Curator Sign In'}
            </h1>
            <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
              {isDe
                ? 'Melde dich mit deinem Supabase-Admin-Konto an.'
                : 'Sign in with your Supabase admin account to curate decks and review ratings.'}
            </p>
            {authError && (
              <div className="text-xs px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {authError}
              </div>
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-full px-4 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-full px-4 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
            <button
              type="submit"
              className="w-full py-3 rounded-full text-sm font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? 'Anmelden' : 'Sign In'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
            style={{ color: 'var(--ink-muted)' }}
          >
            <ChevronLeftIcon size={14} />
            <span>{isDe ? 'Zurück' : 'Home'}</span>
          </button>
          <h1 className="font-serif-card text-2xl font-medium m-0">
            {isDe ? 'Kuration & Auswertung' : 'Curator Studio'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: isSupabaseConfigured ? 'var(--accent-soft)' : 'var(--elevated)',
              color: isSupabaseConfigured ? 'var(--accent)' : 'var(--ink-muted)',
            }}
          >
            {isSupabaseConfigured ? 'Supabase Live' : isDe ? 'Lokal-Modus' : 'Local Mode'}
          </span>
          {isSupabaseConfigured && (
            <button
              type="button"
              onClick={() => signOutAdmin().then(() => setIsAuthed(false))}
              className="px-3 py-1 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe ? 'Abmelden' : 'Sign out'}
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className="rounded-2xl px-4 py-2.5 text-xs flex items-center justify-between"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner('')} className="underline cursor-pointer">
            OK
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        className="inline-flex flex-wrap p-1 rounded-full gap-1 text-xs font-medium"
        style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
      >
        {(
          [
            ['cards', isDe ? `Karten (${cards.length})` : `Cards (${cards.length})`],
            ['insights', isDe ? `Bewertungen (${ratings.length})` : `Insights (${ratings.length})`],
            ['inbox', isDe ? `Runden-Eingang (${pendingInbox.length})` : `Group Inbox (${pendingInbox.length})`],
            ['setup', isDe ? 'Sync & Export' : 'Setup & Export'],
          ] as [AdminTab, string][]
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-full transition-colors cursor-pointer"
              style={{
                backgroundColor: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-muted)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CARDS & QUOTES */}
      {tab === 'cards' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isDe ? 'Suche nach Text, ID oder Autor…' : 'Search text, ID, or author…'}
                className="flex-1 min-w-[200px] rounded-full px-4 py-2 text-xs"
                style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              />
              <select
                value={stackFilter}
                onChange={(e) => setStackFilter(e.target.value as StackId | 'all')}
                className="rounded-full px-3.5 py-2 text-xs"
                style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                <option value="all">{isDe ? 'Alle Stapel' : 'All stacks'}</option>
                {STACKS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isDe ? s.nameDe : s.nameEn}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-muted)' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>{isDe ? 'Archivierte zeigen' : 'Show archived'}</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                setEditing({
                  id: `C_${Date.now()}`,
                  stackId: stackFilter === 'all' ? 'warmup' : stackFilter,
                  kind: stackFilter === 'quotes' ? 'quote' : 'question',
                  de: '',
                  en: '',
                  isCustom: true,
                })
              }
              className="px-4 py-2 rounded-full text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? '+ Neue Karte' : '+ New Card'}
            </button>
          </div>

          <div className="space-y-2.5">
            {filteredCards.map((card) => {
              const stack = STACK_MAP[card.stackId];
              const score = ratingSummary[card.id];
              return (
                <div
                  key={card.id}
                  className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    opacity: card.archived ? 0.55 : 1,
                  }}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stack.accent }} />
                      <span className="font-medium">{isDe ? stack.nameDe : stack.nameEn}</span>
                      <span>· {card.id}</span>
                      {card.quoteSubdeck && <span>· {card.quoteSubdeck}</span>}
                      {card.ruhiChapter && <span>· Ch. {card.ruhiChapter}</span>}
                      {card.archived && <span>· Archived</span>}
                    </div>
                    <p className="text-sm m-0" style={{ color: 'var(--ink)' }}>
                      {isDe ? card.de : card.en}
                    </p>
                    <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe ? card.en : card.de}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {score && (
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] tabular-nums"
                        style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                      >
                        +{score.up} / -{score.down}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing({ ...card })}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                      style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
                    >
                      {isDe ? 'Bearbeiten' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(card)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {card.archived ? (isDe ? 'Aktivieren' : 'Restore') : isDe ? 'Archiv' : 'Archive'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: INSIGHTS & RATINGS */}
      {tab === 'insights' && (
        <section className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stackRatingTotals.map(({ stack, up, down, pct }) => (
              <div
                key={stack.id}
                className="rounded-2xl p-4 space-y-1.5"
                style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stack.accent }} />
                  <span>{isDe ? stack.nameDe : stack.nameEn}</span>
                </div>
                <div className="font-serif-card text-2xl">
                  {pct === null ? '—' : `${pct}%`}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  +{up} / -{down}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                <ThumbUpIcon size={15} />
                <span>{isDe ? 'Beliebteste Karten' : 'Top Resonating Cards'}</span>
              </div>
              {sortedByRating.best.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  {isDe ? 'Noch keine Bewertungen vorhanden.' : 'No card ratings recorded yet.'}
                </p>
              ) : (
                sortedByRating.best.slice(0, 10).map(({ card, score }) => (
                  <div key={card.id} className="pt-2 border-t text-xs flex justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                    <span>{isDe ? card.de : card.en}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--accent)' }}>
                      +{score.up} / -{score.down}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                <ThumbDownIcon size={15} />
                <span>{isDe ? 'Kandidaten zum Überarbeiten' : 'Lowest Rated / Review'}</span>
              </div>
              {sortedByRating.worst.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  {isDe ? 'Noch keine Bewertungen vorhanden.' : 'No card ratings recorded yet.'}
                </p>
              ) : (
                sortedByRating.worst.slice(0, 10).map(({ card, score }) => (
                  <div key={card.id} className="pt-2 border-t text-xs flex justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                    <span>{isDe ? card.de : card.en}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                      +{score.up} / -{score.down}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-full text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
          >
            {isDe ? 'Bewertungen als CSV exportieren' : 'Export Ratings CSV'}
          </button>
        </section>
      )}

      {/* TAB 3: GROUP INBOX */}
      {tab === 'inbox' && (
        <section className="space-y-3">
          {pendingInbox.length === 0 ? (
            <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink-muted)' }}>
              {isDe
                ? 'Keine offenen Fragen aus QR-Runden. Eingeworfene Gästefragen erscheinen hier automatisch.'
                : 'No pending guest questions yet. Anything submitted via a QR room is saved here for review.'}
            </div>
          ) : (
            pendingInbox.map((sub) => (
              <div
                key={sub.id}
                className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="space-y-1">
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Room {sub.roomCode} · {sub.language.toUpperCase()}
                    {sub.authorName ? ` · ${sub.authorName}` : ' · Anonymous'}
                  </div>
                  <p className="text-sm m-0">{sub.text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPromoting({
                        sub,
                        stackId: 'friendship',
                        de: sub.text,
                        en: sub.text,
                      })
                    }
                    className="px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    {isDe ? 'In Stapel übernehmen' : 'Promote to deck'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismissSubmission(sub.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {isDe ? 'Verwerfen' : 'Dismiss'}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB 4: SETUP & SYNC */}
      {tab === 'setup' && (
        <section className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="font-serif-card text-xl font-medium m-0">
            {isDe ? 'Datenbank & Sicherung' : 'Sync & Export'}
          </h2>
          <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
            {isSupabaseConfigured
              ? isDe
                ? `Supabase ist verbunden. Mit einem Klick kannst du alle ${SEED_CARDS.length} kuratierten Standardkarten initial in deine Postgres-Tabelle übertragen.`
                : `Supabase is connected. Click below to seed or update all ${SEED_CARDS.length} curated baseline cards in your Postgres database.`
              : isDe
                ? 'Derzeit läuft Resonance im lokalen Modus (Browser-Speicher). Hinterlege VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY für geräteübergreifende QR-Runden und globale Bewertungs-Statistiken.'
                : 'Resonance is currently running in Local Mode. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud sync across phones and persistent analytics.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {isSupabaseConfigured && (
              <button
                type="button"
                onClick={handleSeedSupabase}
                className="px-5 py-2.5 rounded-full text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Kuratierte Karten nach Supabase hochladen' : 'Seed Supabase with Curated Deck'}
              </button>
            )}
            <button
              type="button"
              onClick={exportJson}
              className="px-5 py-2.5 rounded-full text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
            >
              {isDe ? 'Gesamtes Deck als JSON laden' : 'Export Full Deck JSON'}
            </button>
          </div>
        </section>
      )}

      {/* Edit / Create Card Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={handleSaveCard}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Karte bearbeiten' : 'Edit Card'}
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={editing.stackId}
                onChange={(e) => {
                  const sid = e.target.value as StackId;
                  setEditing({ ...editing, stackId: sid, kind: sid === 'quotes' ? 'quote' : 'question' });
                }}
                className="rounded-full px-3.5 py-2 text-xs"
                style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                {STACKS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isDe ? s.nameDe : s.nameEn}
                  </option>
                ))}
              </select>

              {editing.stackId === 'quotes' && (
                <select
                  value={editing.quoteSubdeck || 'general'}
                  onChange={(e) =>
                    setEditing({ ...editing, quoteSubdeck: e.target.value as QuoteSubdeck })
                  }
                  className="rounded-full px-3.5 py-2 text-xs"
                  style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                >
                  <option value="general">General</option>
                  <option value="ruhi">Ruhi Book 1</option>
                </select>
              )}
            </div>

            {editing.stackId === 'quotes' && editing.quoteSubdeck === 'ruhi' && (
              <select
                value={editing.ruhiChapter || 1}
                onChange={(e) =>
                  setEditing({ ...editing, ruhiChapter: Number(e.target.value) as RuhiChapter })
                }
                className="w-full rounded-full px-3.5 py-2 text-xs"
                style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                <option value={1}>Chapter 1</option>
                <option value={2}>Chapter 2</option>
                <option value={3}>Chapter 3</option>
              </select>
            )}

            <textarea
              required
              rows={3}
              value={editing.de}
              onChange={(e) => setEditing({ ...editing, de: e.target.value })}
              placeholder="Deutsch (DE)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
            <textarea
              required
              rows={3}
              value={editing.en}
              onChange={(e) => setEditing({ ...editing, en: e.target.value })}
              placeholder="English (EN)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />

            {editing.stackId === 'quotes' && (
              <>
                <input
                  type="text"
                  value={editing.author || ''}
                  onChange={(e) => setEditing({ ...editing, author: e.target.value })}
                  placeholder="Author"
                  className="w-full rounded-full px-4 py-2 text-xs"
                  style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="url"
                    value={editing.sourceUrlDe || ''}
                    onChange={(e) => setEditing({ ...editing, sourceUrlDe: e.target.value })}
                    placeholder="Source URL (DE)"
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  />
                  <input
                    type="url"
                    value={editing.sourceUrlEn || ''}
                    onChange={(e) => setEditing({ ...editing, sourceUrlEn: e.target.value })}
                    placeholder="Source URL (EN)"
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  />
                </div>
                <input
                  type="text"
                  value={editing.promptDe || ''}
                  onChange={(e) => setEditing({ ...editing, promptDe: e.target.value })}
                  placeholder="Gesprächsimpuls (DE)"
                  className="w-full rounded-full px-4 py-2 text-xs"
                  style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                />
                <input
                  type="text"
                  value={editing.promptEn || ''}
                  onChange={(e) => setEditing({ ...editing, promptEn: e.target.value })}
                  placeholder="Conversation question (EN)"
                  className="w-full rounded-full px-4 py-2 text-xs"
                  style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                />
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Speichern' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Promote Submission Modal */}
      {promoting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setPromoting(null)}
        >
          <form
            onSubmit={handlePromoteSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl p-6 space-y-3.5"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Frage in festen Stapel aufnehmen' : 'Promote to Permanent Deck'}
            </h2>
            <select
              value={promoting.stackId}
              onChange={(e) => setPromoting({ ...promoting, stackId: e.target.value as StackId })}
              className="w-full rounded-full px-3.5 py-2 text-xs"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            >
              {STACKS.map((s) => (
                <option key={s.id} value={s.id}>
                  {isDe ? s.nameDe : s.nameEn}
                </option>
              ))}
            </select>
            <textarea
              required
              rows={2}
              value={promoting.de}
              onChange={(e) => setPromoting({ ...promoting, de: e.target.value })}
              placeholder="Deutsch (DE)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
            <textarea
              required
              rows={2}
              value={promoting.en}
              onChange={(e) => setPromoting({ ...promoting, en: e.target.value })}
              placeholder="English (EN)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromoting(null)}
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Übernehmen' : 'Promote'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
