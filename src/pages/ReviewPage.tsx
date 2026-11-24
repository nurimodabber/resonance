import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon,
  ExternalLinkIcon,
  StackArtwork,
  ThumbDownIcon,
  ThumbUpIcon,
} from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { getStackMetaSafe } from '../data/stacks';
import {
  fetchReviewBundle,
  getReviewerName,
  saveReviewerProfile,
  saveReviewEditSuggestion,
  saveReviewVote,
  type BackendMode,
} from '../services/repository';
import type {
  CardItem,
  ReviewEditSuggestion,
  ReviewVote,
  StackMeta,
} from '../types/deck';

type CategoryTabId = string; // stackId or '__wildcards__'
type SourceFilter = 'suggestions' | 'live' | 'all';
type ProgressFilter = 'all' | 'unrated' | 'rated';

interface ReviewEntry {
  card: CardItem;
  source: 'suggestion' | 'live';
}

export const ReviewPage: React.FC = () => {
  const { lang } = useResonance();
  const isDe = lang === 'de';

  const [loading, setLoading] = useState(true);
  const [backendMode, setBackendMode] = useState<BackendMode>('local');
  const [stacks, setStacks] = useState<StackMeta[]>([]);
  const [suggestions, setSuggestions] = useState<CardItem[]>([]);
  const [liveCards, setLiveCards] = useState<CardItem[]>([]);

  const [reviewerName, setReviewerName] = useState<string>(() => getReviewerName());
  const [votes, setVotes] = useState<Record<string, ReviewVote>>({});
  const [edits, setEdits] = useState<Record<string, ReviewEditSuggestion>>({});

  const [categoryTab, setCategoryTab] = useState<CategoryTabId>('warmup');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  const [search, setSearch] = useState('');

  const [openEditCardId, setOpenEditCardId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingCount, setSavingCount] = useState(0);
  const [lastSavedCardId, setLastSavedCardId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [revealedOtherLangIds, setRevealedOtherLangIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetchReviewBundle()
      .then((bundle) => {
        if (!active) return;
        setBackendMode(bundle.mode);
        setStacks(bundle.stacks);
        setSuggestions(bundle.suggestions);
        setLiveCards(bundle.liveCards);
        setVotes(bundle.myRecord?.votes || {});
        setEdits(bundle.myRecord?.edits || {});
        if (bundle.myRecord?.reviewerName) {
          setReviewerName(bundle.myRecord.reviewerName);
        }
        if (bundle.stacks.length > 0 && !bundle.stacks.some((s) => s.id === 'warmup')) {
          setCategoryTab(bundle.stacks[0].id);
        }
      })
      .catch((err) => {
        if (active) {
          setSaveError(err instanceof Error ? err.message : 'Failed to load review cards.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stackMap = useMemo(() => {
    return stacks.reduce(
      (acc, s) => {
        acc[s.id] = s;
        return acc;
      },
      {} as Record<string, StackMeta>,
    );
  }, [stacks]);

  const allEntries: ReviewEntry[] = useMemo(() => {
    const out: ReviewEntry[] = [];
    for (const card of suggestions) {
      out.push({ card, source: 'suggestion' });
    }
    for (const card of liveCards) {
      out.push({ card, source: 'live' });
    }
    return out;
  }, [suggestions, liveCards]);

  const categoryProgress = useMemo(() => {
    const map: Record<string, { rated: number; total: number; suggestionsTotal: number }> = {};
    for (const s of stacks) {
      map[s.id] = { rated: 0, total: 0, suggestionsTotal: 0 };
    }
    map.__wildcards__ = { rated: 0, total: 0, suggestionsTotal: 0 };

    for (const entry of allEntries) {
      if (sourceFilter === 'suggestions' && entry.source !== 'suggestion') continue;
      if (sourceFilter === 'live' && entry.source !== 'live') continue;

      const key = entry.card.kind === 'wildcard' ? '__wildcards__' : entry.card.stackId;
      if (!map[key]) map[key] = { rated: 0, total: 0, suggestionsTotal: 0 };
      map[key].total += 1;
      if (entry.source === 'suggestion') map[key].suggestionsTotal += 1;
      if (votes[entry.card.id] !== undefined || edits[entry.card.id]) {
        map[key].rated += 1;
      }
    }
    return map;
  }, [allEntries, stacks, sourceFilter, votes, edits]);

  const overallProgress = useMemo(() => {
    let rated = 0;
    for (const entry of allEntries) {
      if (votes[entry.card.id] !== undefined || edits[entry.card.id]) {
        rated += 1;
      }
    }
    return {
      rated,
      total: allEntries.length,
      suggestionsCount: suggestions.length,
      liveCount: liveCards.length,
    };
  }, [allEntries, votes, edits, suggestions.length, liveCards.length]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter(({ card, source }) => {
      const catKey = card.kind === 'wildcard' ? '__wildcards__' : card.stackId;
      if (catKey !== categoryTab) return false;
      if (sourceFilter !== 'all' && source !== sourceFilter) return false;

      const isRated = votes[card.id] !== undefined || Boolean(edits[card.id]);
      if (progressFilter === 'unrated' && isRated) return false;
      if (progressFilter === 'rated' && !isRated) return false;

      if (q) {
        return (
          card.de.toLowerCase().includes(q) ||
          card.en.toLowerCase().includes(q) ||
          card.id.toLowerCase().includes(q) ||
          (card.author?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [allEntries, categoryTab, sourceFilter, progressFilter, votes, edits, search]);

  const handleVote = async (card: CardItem, nextVote: ReviewVote) => {
    const current = votes[card.id];
    const resolved: ReviewVote | 0 = current === nextVote ? 0 : nextVote;

    setSaveError('');
    setVotes((prev) => {
      const copy = { ...prev };
      if (resolved === 0) delete copy[card.id];
      else copy[card.id] = resolved;
      return copy;
    });

    setSavingCount((n) => n + 1);
    try {
      await saveReviewVote(card.id, resolved, reviewerName);
      setLastSavedCardId(card.id);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : isDe
            ? 'Speichern fehlgeschlagen.'
            : 'Could not save vote.',
      );
    } finally {
      setSavingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleOpenEdit = (card: CardItem) => {
    if (openEditCardId === card.id) {
      setOpenEditCardId(null);
      return;
    }
    const existing = edits[card.id];
    const initial =
      existing?.text || (lang === 'de' ? card.de : card.en);
    setEditDraft(initial);
    setOpenEditCardId(card.id);
  };

  const handleSaveEdit = async (card: CardItem, clearEdit = false) => {
    const textToSave = clearEdit ? '' : editDraft.trim();
    const editLang = edits[card.id]?.language || lang;

    setSaveError('');
    setEdits((prev) => {
      const copy = { ...prev };
      if (!textToSave) {
        delete copy[card.id];
      } else {
        copy[card.id] = {
          text: textToSave,
          language: clearEdit ? editLang : lang,
          updatedAt: new Date().toISOString(),
        };
      }
      return copy;
    });
    setOpenEditCardId(null);

    setSavingCount((n) => n + 1);
    try {
      await saveReviewEditSuggestion(
        card.id,
        textToSave,
        clearEdit ? editLang : lang,
        reviewerName,
      );
      setLastSavedCardId(card.id);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : isDe
            ? 'Änderung konnte nicht gespeichert werden.'
            : 'Could not save suggestion.',
      );
    } finally {
      setSavingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleNameBlur = async () => {
    setSavingCount((n) => n + 1);
    try {
      await saveReviewerProfile(reviewerName);
    } catch {
      // Name is stored locally regardless
    } finally {
      setSavingCount((n) => Math.max(0, n - 1));
    }
  };

  if (loading) {
    return (
      <main
        className="max-w-4xl mx-auto px-4 py-16 text-center text-sm"
        style={{ color: 'var(--ink-muted)' }}
      >
        {isDe ? 'Lade Vorschlagsliste…' : 'Loading review deck…'}
      </main>
    );
  }

  return (
    <main className="candlelight-halo max-w-5xl w-full mx-auto px-4 sm:px-6 pt-4 pb-20 space-y-5">
      {/* Intro & Live Auto-Save Status */}
      <section className="noble-bezel p-1.5 rounded-[26px]">
        <div className="noble-card relative overflow-hidden rounded-[20px] p-5 sm:p-6 space-y-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2.5 rounded-[14px] border"
            style={{ borderColor: 'var(--gold-hairline)' }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <span
                className="inline-block text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--gold)' }}
              >
                {isDe ? 'Gemeinsame Kuration' : 'Friends Curation'}
              </span>
              <h1 className="font-serif-card text-2xl sm:text-[1.75rem] font-medium m-0 leading-tight">
                {isDe
                  ? 'Neue Fragen & Zitate gemeinsam auswählen'
                  : 'Help curate new questions & quotes'}
              </h1>
              <p className="text-xs sm:text-sm m-0 max-w-2xl" style={{ color: 'var(--ink-muted)' }}>
                {isDe
                  ? 'Bewerte neue Vorschläge und bestehende Karten mit 1–2 Daumen hoch/runter oder schlage bessere Formulierungen vor. Alles wird direkt gespeichert.'
                  : 'Rate new suggestions and existing cards with single or double thumbs up/down, or suggest cleaner wording. Every tap saves automatically.'}
              </p>
            </div>

            <div className="shrink-0 flex flex-col sm:items-end gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor:
                    savingCount > 0 ? 'var(--gold-soft)' : 'var(--accent-soft)',
                  color: savingCount > 0 ? 'var(--gold)' : 'var(--accent)',
                }}
              >
                <CheckIcon size={12} />
                <span>
                  {savingCount > 0
                    ? isDe
                      ? 'Speichert…'
                      : 'Saving…'
                    : backendMode === 'vercel'
                      ? isDe
                        ? 'Live gespeichert'
                        : 'Saved to studio'
                      : isDe
                        ? 'Lokal gespeichert'
                        : 'Saved locally'}
                </span>
              </span>

              <span className="text-xs tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {overallProgress.rated} / {overallProgress.total}{' '}
                {isDe ? 'bewertet' : 'rated'}
              </span>
            </div>
          </div>

          {/* Optional Reviewer Name + Search */}
          <div className="relative z-10 flex flex-col sm:flex-row gap-2.5 pt-1">
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              onBlur={handleNameBlur}
              maxLength={40}
              placeholder={
                isDe
                  ? 'Dein Vorname (optional, hilfreich bei Änderungsvorschlägen)'
                  : 'Your name (optional — helps identify your edits)'
              }
              aria-label="Reviewer name"
              className="sm:w-72 rounded-full px-4 py-2 text-xs"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isDe
                  ? 'In dieser Kategorie suchen…'
                  : 'Search questions, quotes, or authors…'
              }
              aria-label="Search review cards"
              className="flex-1 rounded-full px-4 py-2 text-xs"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {saveError && (
            <div
              className="relative z-10 text-xs px-3.5 py-2 rounded-xl"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {saveError}
            </div>
          )}
        </div>
      </section>

      {/* Category Pills */}
      <section aria-label="Categories" className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {stacks.map((stack) => {
            const active = categoryTab === stack.id;
            const prog = categoryProgress[stack.id] || { rated: 0, total: 0 };
            return (
              <button
                key={stack.id}
                type="button"
                onClick={() => setCategoryTab(stack.id)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--card)',
                  color: active ? 'var(--accent-ink)' : 'var(--ink)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <StackArtwork
                  stackId={stack.id}
                  iconId={stack.iconId}
                  size={15}
                  className="shrink-0"
                />
                <span>{isDe ? stack.nameDe : stack.nameEn}</span>
                <span
                  className="text-[11px] tabular-nums opacity-80"
                  style={{ color: active ? 'var(--accent-ink)' : 'var(--ink-muted)' }}
                >
                  {prog.rated}/{prog.total}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCategoryTab('__wildcards__')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor:
                categoryTab === '__wildcards__' ? 'var(--accent)' : 'var(--card)',
              color:
                categoryTab === '__wildcards__' ? 'var(--accent-ink)' : 'var(--ink)',
              border: `1px solid ${
                categoryTab === '__wildcards__' ? 'var(--accent)' : 'var(--border)'
              }`,
            }}
          >
            <span>{isDe ? 'Impulse / Wildcards' : 'Moments / Wildcards'}</span>
            <span
              className="text-[11px] tabular-nums opacity-80"
              style={{
                color:
                  categoryTab === '__wildcards__'
                    ? 'var(--accent-ink)'
                    : 'var(--ink-muted)',
              }}
            >
              {(categoryProgress.__wildcards__?.rated ?? 0)}/
              {(categoryProgress.__wildcards__?.total ?? 0)}
            </span>
          </button>
        </div>

        {/* Sub-filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div
            className="inline-flex p-0.5 rounded-full text-xs"
            style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
          >
            {(
              [
                ['all', isDe ? 'Alle' : 'All'],
                ['suggestions', isDe ? 'Neue Vorschläge' : 'New Suggestions'],
                ['live', isDe ? 'Aktuell auf der Website' : 'Existing Live Cards'],
              ] as [SourceFilter, string][]
            ).map(([key, label]) => {
              const active = sourceFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSourceFilter(key)}
                  className="px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--elevated)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            className="inline-flex p-0.5 rounded-full text-xs"
            style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
          >
            {(
              [
                ['all', isDe ? 'Alle' : 'All'],
                ['unrated', isDe ? 'Noch offen' : 'Unrated'],
                ['rated', isDe ? 'Bewertet' : 'Rated'],
              ] as [ProgressFilter, string][]
            ).map(([key, label]) => {
              const active = progressFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProgressFilter(key)}
                  className="px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--elevated)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Card Feed */}
      <section className="space-y-3">
        {filteredEntries.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center text-sm"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--ink-muted)',
            }}
          >
            {isDe
              ? 'Keine Karten für diesen Filter gefunden.'
              : 'No cards match this filter right now.'}
          </div>
        ) : (
          filteredEntries.map(({ card, source }) => {
            const currentVote = votes[card.id];
            const savedEdit = edits[card.id];
            const isEditingHere = openEditCardId === card.id;
            const showAltLang = Boolean(revealedOtherLangIds[card.id]);
            const primaryText = isDe ? card.de : card.en;
            const altText = isDe ? card.en : card.de;
            const promptText = isDe ? card.promptDe : card.promptEn;
            const stackMeta = getStackMetaSafe(stackMap, card.stackId);

            return (
              <article
                key={card.id}
                className="rounded-2xl p-4 sm:p-5 space-y-3 transition-colors"
                style={{
                  backgroundColor: 'var(--card)',
                  border:
                    currentVote !== undefined
                      ? '1px solid var(--border-strong)'
                      : '1px solid var(--border)',
                }}
              >
                {/* Card Meta Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="px-2.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor:
                          source === 'suggestion' ? 'var(--gold-soft)' : 'var(--subtle)',
                        color: source === 'suggestion' ? 'var(--gold)' : 'var(--ink-muted)',
                      }}
                    >
                      {source === 'suggestion'
                        ? isDe
                          ? 'Neuer Vorschlag'
                          : 'New Suggestion'
                        : isDe
                          ? 'Bereits live'
                          : 'Existing Live'}
                    </span>

                    {card.kind === 'wildcard' && (
                      <span
                        className="px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                      >
                        {isDe ? stackMeta.nameDe : stackMeta.nameEn}
                      </span>
                    )}

                    {card.author && (
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {card.author}
                      </span>
                    )}

                    {card.ruhiChapter && (
                      <span style={{ color: 'var(--ink-muted)' }}>
                        Ruhi {isDe ? `Kap. ${card.ruhiChapter}` : `Ch. ${card.ruhiChapter}`}
                      </span>
                    )}

                    <span style={{ color: 'var(--ink-soft)' }}>· {card.id}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {lastSavedCardId === card.id && (
                      <span
                        className="text-[11px]"
                        style={{ color: 'var(--accent)' }}
                      >
                        {isDe ? 'Gespeichert' : 'Saved'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedOtherLangIds((prev) => ({
                          ...prev,
                          [card.id]: !prev[card.id],
                        }))
                      }
                      className="text-[11px] hover:underline cursor-pointer"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {showAltLang
                        ? isDe
                          ? 'EN ausblenden'
                          : 'Hide DE'
                        : isDe
                          ? 'EN zeigen'
                          : 'See DE'}
                    </button>
                  </div>
                </div>

                {/* Primary Text */}
                <div className="space-y-1.5">
                  <p
                    className="font-serif-card text-base sm:text-[17px] leading-snug m-0"
                    style={{ color: 'var(--ink)' }}
                  >
                    {card.kind === 'quote' ? `“${primaryText}”` : primaryText}
                  </p>

                  {promptText && (
                    <p
                      className="text-xs leading-relaxed m-0 pl-3 border-l-2"
                      style={{ borderColor: 'var(--gold-hairline)', color: 'var(--ink-muted)' }}
                    >
                      {promptText}
                    </p>
                  )}

                  {showAltLang && (
                    <p className="text-xs m-0 pt-1" style={{ color: 'var(--ink-muted)' }}>
                      {card.kind === 'quote' ? `“${altText}”` : altText}
                    </p>
                  )}

                  {card.kind === 'quote' &&
                    (card.sourceLabelDe ||
                      card.sourceLabelEn ||
                      card.sourceUrlDe ||
                      card.sourceUrlEn) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1.5 text-[11px]">
                        {(isDe
                          ? card.sourceLabelDe || card.sourceLabelEn
                          : card.sourceLabelEn || card.sourceLabelDe) && (
                          <span style={{ color: 'var(--ink-muted)' }}>
                            {isDe
                              ? card.sourceLabelDe || card.sourceLabelEn
                              : card.sourceLabelEn || card.sourceLabelDe}
                          </span>
                        )}
                        {(card.sourceUrlDe || card.sourceUrlEn) && (
                          <div className="inline-flex flex-wrap items-center gap-1.5">
                            {card.sourceUrlDe && (
                              <a
                                href={card.sourceUrlDe}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={
                                  card.sourceLabelDe
                                    ? `${card.sourceLabelDe} (DE)`
                                    : 'Original (DE)'
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
                                style={{
                                  border: '1px solid var(--gold-hairline)',
                                  backgroundColor: isDe ? 'var(--gold-soft)' : 'transparent',
                                  color: isDe ? 'var(--gold)' : 'var(--ink-muted)',
                                }}
                              >
                                <span>Original (DE)</span>
                                <ExternalLinkIcon size={11} />
                              </a>
                            )}
                            {card.sourceUrlEn && (
                              <a
                                href={card.sourceUrlEn}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={
                                  card.sourceLabelEn
                                    ? `${card.sourceLabelEn} (EN)`
                                    : 'Original (EN)'
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
                                style={{
                                  border: '1px solid var(--gold-hairline)',
                                  backgroundColor: !isDe ? 'var(--gold-soft)' : 'transparent',
                                  color: !isDe ? 'var(--gold)' : 'var(--ink-muted)',
                                }}
                              >
                                <span>Original (EN)</span>
                                <ExternalLinkIcon size={11} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* Saved Change Badge */}
                {savedEdit && !isEditingHere && (
                  <div
                    className="rounded-xl px-3.5 py-2 text-xs space-y-0.5"
                    style={{
                      backgroundColor: 'var(--gold-soft)',
                      border: '1px solid var(--gold-hairline)',
                    }}
                  >
                    <div className="font-medium text-[11px]" style={{ color: 'var(--gold)' }}>
                      {isDe
                        ? `Dein Änderungsvorschlag (${savedEdit.language.toUpperCase()}):`
                        : `Your suggested wording (${savedEdit.language.toUpperCase()}):`}
                    </div>
                    <div style={{ color: 'var(--ink)' }}>{savedEdit.text}</div>
                  </div>
                )}

                {/* Vote + Suggest Change Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div
                    className="inline-flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={isDe ? 'Bewertung' : 'Rating'}
                  >
                    {/* -2 Double Thumbs Down */}
                    <button
                      type="button"
                      onClick={() => handleVote(card, -2)}
                      aria-pressed={currentVote === -2}
                      aria-label={isDe ? 'Zwei Daumen runter' : 'Double thumbs down'}
                      title={isDe ? 'Passt gar nicht (2× runter)' : 'Strong no (double down)'}
                      className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          currentVote === -2 ? 'var(--danger)' : 'var(--subtle)',
                        color:
                          currentVote === -2 ? 'var(--accent-ink)' : 'var(--ink-muted)',
                        border: `1px solid ${
                          currentVote === -2 ? 'var(--danger)' : 'var(--border)'
                        }`,
                      }}
                    >
                      <ThumbDownIcon size={13} />
                      <ThumbDownIcon size={13} />
                    </button>

                    {/* -1 Single Thumbs Down */}
                    <button
                      type="button"
                      onClick={() => handleVote(card, -1)}
                      aria-pressed={currentVote === -1}
                      aria-label={isDe ? 'Daumen runter' : 'Thumbs down'}
                      title={isDe ? 'Eher nicht (1× runter)' : 'No (thumbs down)'}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          currentVote === -1 ? 'var(--danger-soft)' : 'var(--subtle)',
                        color:
                          currentVote === -1 ? 'var(--danger)' : 'var(--ink-muted)',
                        border: `1px solid ${
                          currentVote === -1 ? 'var(--danger)' : 'var(--border)'
                        }`,
                      }}
                    >
                      <ThumbDownIcon size={14} />
                    </button>

                    {/* +1 Single Thumbs Up */}
                    <button
                      type="button"
                      onClick={() => handleVote(card, 1)}
                      aria-pressed={currentVote === 1}
                      aria-label={isDe ? 'Daumen hoch' : 'Thumbs up'}
                      title={isDe ? 'Gut (1× hoch)' : 'Good (thumbs up)'}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          currentVote === 1 ? 'var(--accent-soft)' : 'var(--subtle)',
                        color:
                          currentVote === 1 ? 'var(--accent)' : 'var(--ink-muted)',
                        border: `1px solid ${
                          currentVote === 1 ? 'var(--accent)' : 'var(--border)'
                        }`,
                      }}
                    >
                      <ThumbUpIcon size={14} />
                    </button>

                    {/* +2 Double Thumbs Up */}
                    <button
                      type="button"
                      onClick={() => handleVote(card, 2)}
                      aria-pressed={currentVote === 2}
                      aria-label={isDe ? 'Zwei Daumen hoch' : 'Double thumbs up'}
                      title={isDe ? 'Unbedingt rein! (2× hoch)' : 'Love it! (double thumbs up)'}
                      className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          currentVote === 2 ? 'var(--accent)' : 'var(--subtle)',
                        color:
                          currentVote === 2 ? 'var(--accent-ink)' : 'var(--ink-muted)',
                        border: `1px solid ${
                          currentVote === 2 ? 'var(--accent)' : 'var(--border)'
                        }`,
                      }}
                    >
                      <ThumbUpIcon size={13} />
                      <ThumbUpIcon size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(card)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        isEditingHere || savedEdit ? 'var(--gold-soft)' : 'var(--subtle)',
                      color:
                        isEditingHere || savedEdit ? 'var(--gold)' : 'var(--ink-muted)',
                      border: `1px solid ${
                        isEditingHere || savedEdit ? 'var(--gold-hairline)' : 'var(--border)'
                      }`,
                    }}
                  >
                    {isEditingHere
                      ? isDe
                        ? 'Schließen'
                        : 'Close'
                      : savedEdit
                        ? isDe
                          ? 'Änderung bearbeiten'
                          : 'Edit suggestion'
                        : isDe
                          ? 'Änderung vorschlagen'
                          : 'Suggest change'}
                  </button>
                </div>

                {/* Inline Wording-Change Editor (only when toggled open) */}
                {isEditingHere && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveEdit(card, false);
                    }}
                    className="pt-2 space-y-2 border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <label className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {isDe
                        ? `Bessere Formulierung vorschlagen (${lang.toUpperCase()}):`
                        : `Suggest revised wording (${lang.toUpperCase()}):`}
                    </label>
                    <textarea
                      rows={2}
                      maxLength={1500}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="w-full rounded-2xl p-3 text-sm"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {savedEdit && (
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(card, true)}
                          className="px-3 py-1.5 rounded-full text-xs cursor-pointer"
                          style={{ color: 'var(--danger)' }}
                        >
                          {isDe ? 'Vorschlag entfernen' : 'Remove suggestion'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenEditCardId(null)}
                        className="px-3.5 py-1.5 rounded-full text-xs cursor-pointer"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {isDe ? 'Abbrechen' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                      >
                        {isDe ? 'Formulierung speichern' : 'Save wording'}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
};
