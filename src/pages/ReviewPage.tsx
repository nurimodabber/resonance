import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DeckPlayIcon,
  ExternalLinkIcon,
  StackArtwork,
  StacksIcon,
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
import { triggerHaptic } from '../utils/audio';

type CategoryTabId = string; // stackId or '__wildcards__'
type SourceFilter = 'all' | 'suggestion' | 'live';
type ProgressFilter = 'all' | 'unrated' | 'rated';
type ReviewViewMode = 'focus' | 'list';

interface ReviewEntry {
  card: CardItem;
  source: 'suggestion' | 'live';
}

interface QuoteSourceBarProps {
  card: CardItem;
  isDe: boolean;
}

const QuoteSourceBar: React.FC<QuoteSourceBarProps> = ({ card, isDe }) => {
  if (
    card.kind !== 'quote' ||
    (!card.sourceLabelDe && !card.sourceLabelEn && !card.sourceUrlDe && !card.sourceUrlEn)
  ) {
    return null;
  }

  const label = isDe
    ? card.sourceLabelDe || card.sourceLabelEn
    : card.sourceLabelEn || card.sourceLabelDe;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1.5 text-[11px]">
      {label && <span style={{ color: 'var(--ink-muted)' }}>{label}</span>}
      {(card.sourceUrlDe || card.sourceUrlEn) && (
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {card.sourceUrlDe && (
            <a
              href={card.sourceUrlDe}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={card.sourceLabelDe ? `${card.sourceLabelDe} (DE)` : 'Original (DE)'}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
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
              aria-label={card.sourceLabelEn ? `${card.sourceLabelEn} (EN)` : 'Original (EN)'}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
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
  );
};

interface RatingButtonGroupProps {
  card: CardItem;
  currentVote: ReviewVote | undefined;
  layout: ReviewViewMode;
  isDe: boolean;
  onVote: (card: CardItem, nextVote: ReviewVote) => void;
}

const RatingButtonGroup: React.FC<RatingButtonGroupProps> = ({
  card,
  currentVote,
  layout,
  isDe,
  onVote,
}) => {
  const buttons: {
    value: ReviewVote;
    shortLabel: string;
    ariaLabel: string;
    title: string;
    activeBg: string;
    activeColor: string;
    activeBorder: string;
    icons: React.ReactNode;
  }[] = [
    {
      value: -2,
      shortLabel: '−2',
      ariaLabel: isDe ? 'Zwei Daumen runter' : 'Double thumbs down',
      title: isDe ? 'Passt gar nicht (2× runter)' : 'Strong no (double down)',
      activeBg: 'var(--danger)',
      activeColor: 'var(--accent-ink)',
      activeBorder: 'var(--danger)',
      icons: (
        <span className="inline-flex items-center gap-0.5">
          <ThumbDownIcon size={13} />
          <ThumbDownIcon size={13} />
        </span>
      ),
    },
    {
      value: -1,
      shortLabel: '−1',
      ariaLabel: isDe ? 'Daumen runter' : 'Thumbs down',
      title: isDe ? 'Eher nicht (1× runter)' : 'No (thumbs down)',
      activeBg: 'var(--danger-soft)',
      activeColor: 'var(--danger)',
      activeBorder: 'var(--danger)',
      icons: <ThumbDownIcon size={14} />,
    },
    {
      value: 1,
      shortLabel: '+1',
      ariaLabel: isDe ? 'Daumen hoch' : 'Thumbs up',
      title: isDe ? 'Gut (1× hoch)' : 'Good (thumbs up)',
      activeBg: 'var(--accent-soft)',
      activeColor: 'var(--accent)',
      activeBorder: 'var(--accent)',
      icons: <ThumbUpIcon size={14} />,
    },
    {
      value: 2,
      shortLabel: '+2',
      ariaLabel: isDe ? 'Zwei Daumen hoch' : 'Double thumbs up',
      title: isDe ? 'Unbedingt rein! (2× hoch)' : 'Love it! (double thumbs up)',
      activeBg: 'var(--accent)',
      activeColor: 'var(--accent-ink)',
      activeBorder: 'var(--accent)',
      icons: (
        <span className="inline-flex items-center gap-0.5">
          <ThumbUpIcon size={13} />
          <ThumbUpIcon size={13} />
        </span>
      ),
    },
  ];

  return (
    <div
      className={
        layout === 'focus'
          ? 'grid grid-cols-4 gap-2'
          : 'grid grid-cols-4 gap-1.5 w-full sm:w-auto sm:inline-flex'
      }
      role="group"
      aria-label={isDe ? 'Bewertung' : 'Rating'}
    >
      {buttons.map((b) => {
        const active = currentVote === b.value;
        return (
          <button
            key={b.value}
            type="button"
            onClick={() => onVote(card, b.value)}
            aria-pressed={active}
            aria-label={b.ariaLabel}
            title={b.title}
            className={
              layout === 'focus'
                ? 'min-h-[54px] rounded-2xl flex flex-col items-center justify-center gap-0.5 text-xs font-medium active:scale-95 transition-all cursor-pointer'
                : 'min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 rounded-xl sm:rounded-full flex items-center justify-center gap-1 text-xs font-medium active:scale-95 transition-all cursor-pointer'
            }
            style={{
              backgroundColor: active ? b.activeBg : 'var(--subtle)',
              color: active ? b.activeColor : 'var(--ink-muted)',
              border: `1px solid ${active ? b.activeBorder : 'var(--border)'}`,
            }}
          >
            {b.icons}
            <span className="text-[10px] sm:text-[11px] font-semibold tabular-nums leading-none">
              {b.shortLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
};

interface WordingEditorFormProps {
  card: CardItem;
  lang: 'de' | 'en';
  isDe: boolean;
  editDraft: string;
  savedEdit: ReviewEditSuggestion | undefined;
  onChangeDraft: (next: string) => void;
  onSave: (card: CardItem, clearEdit: boolean) => void;
  onCancel: () => void;
}

const WordingEditorForm: React.FC<WordingEditorFormProps> = ({
  card,
  lang,
  isDe,
  editDraft,
  savedEdit,
  onChangeDraft,
  onSave,
  onCancel,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSave(card, false);
    }}
    className="pt-3 space-y-2.5 border-t"
    style={{ borderColor: 'var(--border)' }}
  >
    <label className="block text-xs" style={{ color: 'var(--ink-muted)' }}>
      {isDe
        ? `Bessere Formulierung vorschlagen (${lang.toUpperCase()}):`
        : `Suggest revised wording (${lang.toUpperCase()}):`}
    </label>
    <textarea
      rows={3}
      maxLength={1500}
      value={editDraft}
      onChange={(e) => onChangeDraft(e.target.value)}
      className="w-full rounded-2xl p-3.5 text-base sm:text-sm"
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
          onClick={() => onSave(card, true)}
          className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-full text-xs cursor-pointer"
          style={{ color: 'var(--danger)' }}
        >
          {isDe ? 'Vorschlag entfernen' : 'Remove suggestion'}
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[40px] sm:min-h-[34px] px-3.5 py-1.5 rounded-full text-xs cursor-pointer"
        style={{ color: 'var(--ink-muted)' }}
      >
        {isDe ? 'Abbrechen' : 'Cancel'}
      </button>
      <button
        type="submit"
        className="min-h-[40px] sm:min-h-[34px] px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {isDe ? 'Formulierung speichern' : 'Save wording'}
      </button>
    </div>
  </form>
);

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

  const [viewMode, setViewMode] = useState<ReviewViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'focus' : 'list',
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [openEditCardId, setOpenEditCardId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingCount, setSavingCount] = useState(0);
  const [lastSavedCardId, setLastSavedCardId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [revealedOtherLangIds, setRevealedOtherLangIds] = useState<Record<string, boolean>>({});

  const advanceTimerRef = useRef<number | null>(null);
  const catButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAdvanceTimer();
  }, []);

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
      if (sourceFilter === 'suggestion' && entry.source !== 'suggestion') continue;
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
      pct: allEntries.length > 0 ? Math.round((rated / allEntries.length) * 100) : 0,
    };
  }, [allEntries, votes, edits]);

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

  // Reset Focus index cleanly on filter/category change
  useEffect(() => {
    clearAdvanceTimer();
    setFocusIndex(0);
    setOpenEditCardId(null);
  }, [categoryTab, sourceFilter, progressFilter, search]);

  // Clamp Focus index when filteredEntries shrinks (e.g., while filtering 'unrated')
  useEffect(() => {
    setFocusIndex((prev) => {
      if (filteredEntries.length === 0) return 0;
      return Math.min(prev, filteredEntries.length - 1);
    });
  }, [filteredEntries.length]);

  // Scroll selected category tab smoothly into view on horizontal mobile rail
  useEffect(() => {
    const el = catButtonRefs.current[categoryTab];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [categoryTab]);

  const categoryOrder = useMemo(
    () => [...stacks.map((s) => s.id), '__wildcards__'],
    [stacks],
  );

  const nextUnratedCategory = useMemo(() => {
    const idx = categoryOrder.indexOf(categoryTab);
    for (let offset = 1; offset <= categoryOrder.length; offset++) {
      const candidate = categoryOrder[(Math.max(0, idx) + offset) % categoryOrder.length];
      if (candidate === categoryTab) continue;
      const prog = categoryProgress[candidate];
      if (prog && prog.total > prog.rated) return candidate;
    }
    return null;
  }, [categoryOrder, categoryTab, categoryProgress]);

  const activeCategoryProgress = categoryProgress[categoryTab] || { rated: 0, total: 0 };
  const activeCatPct =
    activeCategoryProgress.total > 0
      ? Math.round((activeCategoryProgress.rated / activeCategoryProgress.total) * 100)
      : 0;

  const hasSecondaryFilters =
    search.trim().length > 0 || sourceFilter !== 'all' || progressFilter === 'rated';

  const activeEntry =
    filteredEntries.length > 0
      ? filteredEntries[Math.min(focusIndex, filteredEntries.length - 1)]
      : null;

  const stepFocus = (delta: number) => {
    clearAdvanceTimer();
    setOpenEditCardId(null);
    setFocusIndex((prev) =>
      Math.max(0, Math.min(filteredEntries.length - 1, prev + delta)),
    );
  };

  // Keyboard navigation in Focus Mode
  useEffect(() => {
    if (viewMode !== 'focus') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFocus(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFocus(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleVote = async (card: CardItem, nextVote: ReviewVote) => {
    clearAdvanceTimer();
    triggerHaptic(8);

    const prevVote = votes[card.id];
    const resolved: ReviewVote | 0 = prevVote === nextVote ? 0 : nextVote;

    setSaveError('');
    setVotes((prev) => {
      const copy = { ...prev };
      if (resolved === 0) delete copy[card.id];
      else copy[card.id] = resolved;
      return copy;
    });

    if (
      viewMode === 'focus' &&
      resolved !== 0 &&
      openEditCardId !== card.id &&
      progressFilter !== 'unrated' &&
      focusIndex < filteredEntries.length - 1
    ) {
      advanceTimerRef.current = window.setTimeout(() => {
        setFocusIndex((prev) => Math.min(prev + 1, Math.max(0, filteredEntries.length - 1)));
      }, 220);
    }

    setSavingCount((n) => n + 1);
    try {
      await saveReviewVote(card.id, resolved, reviewerName);
      setLastSavedCardId(card.id);
    } catch (err) {
      setVotes((prev) => {
        const copy = { ...prev };
        if (prevVote === undefined) delete copy[card.id];
        else copy[card.id] = prevVote;
        return copy;
      });
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
    clearAdvanceTimer();
    if (openEditCardId === card.id) {
      setOpenEditCardId(null);
      return;
    }
    const existing = edits[card.id];
    const initial = existing?.text || (lang === 'de' ? card.de : card.en);
    setEditDraft(initial);
    setOpenEditCardId(card.id);
  };

  const handleSaveEdit = async (card: CardItem, clearEdit = false) => {
    const textToSave = clearEdit ? '' : editDraft.trim();
    const prevEdit = edits[card.id];
    const editLang = prevEdit?.language || lang;

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
      setEdits((prev) => {
        const copy = { ...prev };
        if (prevEdit === undefined) delete copy[card.id];
        else copy[card.id] = prevEdit;
        return copy;
      });
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
    setSaveError('');
    setSavingCount((n) => n + 1);
    try {
      await saveReviewerProfile(reviewerName);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : isDe
            ? 'Name konnte nicht gespeichert werden.'
            : 'Could not save reviewer name.',
      );
    } finally {
      setSavingCount((n) => Math.max(0, n - 1));
    }
  };

  const toggleAltLang = (cardId: string) => {
    setRevealedOtherLangIds((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }));
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
    <main className="candlelight-halo max-w-5xl w-full mx-auto px-3 sm:px-6 pt-2 sm:pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] space-y-3 sm:space-y-4">
      {/* Compact Header Card */}
      <section className="noble-bezel p-1 rounded-[22px]">
        <div className="noble-card relative overflow-hidden rounded-[18px] px-4 py-3.5 sm:px-6 sm:py-5 space-y-2.5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 rounded-[12px] border"
            style={{ borderColor: 'var(--gold-hairline)' }}
          />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <span
                className="inline-block text-[10px] sm:text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--gold)' }}
              >
                {isDe ? 'Gemeinsame Kuration' : 'Friends Curation'}
              </span>
              <h1 className="font-serif-card text-lg sm:text-[1.6rem] font-medium m-0 leading-snug">
                {isDe ? 'Karten gemeinsam auswählen' : 'Help curate cards'}
              </h1>
              <p
                className="hidden sm:block text-xs sm:text-sm m-0 max-w-2xl pt-0.5"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe
                  ? 'Bewerte neue Vorschläge und bestehende Karten mit 1–2 Daumen hoch/runter oder schlage bessere Formulierungen vor. Alles wird direkt gespeichert.'
                  : 'Rate new suggestions and existing cards with single or double thumbs up/down, or suggest cleaner wording. Every tap saves automatically.'}
              </p>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-1">
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor:
                    savingCount > 0 ? 'var(--gold-soft)' : 'var(--accent-soft)',
                  color: savingCount > 0 ? 'var(--gold)' : 'var(--accent)',
                }}
              >
                <CheckIcon size={11} />
                <span>
                  {savingCount > 0
                    ? isDe
                      ? 'Speichert…'
                      : 'Saving…'
                    : backendMode === 'vercel'
                      ? isDe
                        ? 'Gespeichert'
                        : 'Saved'
                      : isDe
                        ? 'Lokal'
                        : 'Local'}
                </span>
              </span>

              <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {overallProgress.rated} / {overallProgress.total} {isDe ? 'bewertet' : 'rated'}
              </span>
            </div>
          </div>

          {/* Slim Overall Progress Bar */}
          <div
            className="relative z-10 h-[3px] rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--border)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${overallProgress.pct}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>

          {saveError && (
            <div
              className="relative z-10 text-xs px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {saveError}
            </div>
          )}
        </div>
      </section>

      {/* Sticky Frosted Category Rail & Control Bar */}
      <section
        aria-label="Categories and controls"
        className="sticky top-0 z-30 -mx-3 px-3 sm:mx-0 sm:px-3 py-2.5 sm:rounded-2xl backdrop-blur-md border-b sm:border space-y-2"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg) 90%, transparent)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Horizontal Swipeable Category Rail on Mobile, Wrap on Desktop */}
        <div className="flex overflow-x-auto no-scrollbar gap-1.5 snap-x pb-0.5 md:flex-wrap">
          {stacks.map((stack) => {
            const active = categoryTab === stack.id;
            const prog = categoryProgress[stack.id] || { rated: 0, total: 0 };
            return (
              <button
                key={stack.id}
                ref={(el) => {
                  catButtonRefs.current[stack.id] = el;
                }}
                type="button"
                onClick={() => setCategoryTab(stack.id)}
                className="shrink-0 snap-start whitespace-nowrap inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--card)',
                  color: active ? 'var(--accent-ink)' : 'var(--ink)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <StackArtwork
                  stackId={stack.id}
                  iconId={stack.iconId}
                  size={14}
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
            ref={(el) => {
              catButtonRefs.current.__wildcards__ = el;
            }}
            type="button"
            onClick={() => setCategoryTab('__wildcards__')}
            className="shrink-0 snap-start whitespace-nowrap inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
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
            <span>{isDe ? 'Impulse' : 'Wildcards'}</span>
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

        {/* Compact View & Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex p-0.5 rounded-full text-xs"
            style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
            role="group"
            aria-label={isDe ? 'Ansicht wechseln' : 'Switch view mode'}
          >
            {(
              [
                ['focus', isDe ? 'Karten' : 'Cards', <DeckPlayIcon size={13} key="d" />],
                ['list', isDe ? 'Liste' : 'List', <StacksIcon size={13} key="l" />],
              ] as const
            ).map(([mode, label, icon]) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    clearAdvanceTimer();
                    setViewMode(mode);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-full font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--elevated)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  }}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setProgressFilter((prev) => (prev === 'unrated' ? 'all' : 'unrated'))
              }
              aria-pressed={progressFilter === 'unrated'}
              className="min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  progressFilter === 'unrated' ? 'var(--gold-soft)' : 'var(--subtle)',
                color:
                  progressFilter === 'unrated' ? 'var(--gold)' : 'var(--ink-muted)',
                border: `1px solid ${
                  progressFilter === 'unrated' ? 'var(--gold-hairline)' : 'var(--border)'
                }`,
              }}
            >
              {isDe ? 'Nur offene' : 'Unrated only'}
            </button>

            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: filtersOpen ? 'var(--elevated)' : 'var(--subtle)',
                color:
                  filtersOpen || hasSecondaryFilters ? 'var(--ink)' : 'var(--ink-muted)',
                border: `1px solid ${
                  filtersOpen || hasSecondaryFilters
                    ? 'var(--border-strong)'
                    : 'var(--border)'
                }`,
              }}
            >
              <span>{isDe ? 'Filter & Name' : 'Filter & Name'}</span>
              {(hasSecondaryFilters || reviewerName.trim().length > 0) && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--gold)' }}
                />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Filter, Search & Optional Name Panel */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filter-drawer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-2xl p-3 sm:p-3.5 space-y-2.5 mt-1"
                style={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    onBlur={handleNameBlur}
                    maxLength={40}
                    placeholder={
                      isDe
                        ? 'Dein Vorname (optional)'
                        : 'Your name (optional)'
                    }
                    aria-label="Reviewer name"
                    className="w-full min-h-[44px] sm:min-h-[38px] rounded-2xl px-3.5 text-base sm:text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      color: 'var(--ink)',
                      border: '1px solid var(--border)',
                    }}
                  />

                  <div className="relative">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={
                        isDe
                          ? 'Frage, Zitat oder Autor suchen…'
                          : 'Search question, quote, or author…'
                      }
                      aria-label="Search review cards"
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-2xl px-3.5 pr-9 text-base sm:text-xs"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label={isDe ? 'Suche leeren' : 'Clear search'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    className="grid grid-cols-3 p-0.5 rounded-xl text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {(
                      [
                        ['all', isDe ? 'Alle' : 'All'],
                        ['suggestion', isDe ? 'Vorschläge' : 'New'],
                        ['live', isDe ? 'Live' : 'Live'],
                      ] as [SourceFilter, string][]
                    ).map(([key, label]) => {
                      const active = sourceFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSourceFilter(key)}
                          className="min-h-[34px] px-2 py-1 rounded-[10px] font-medium transition-colors cursor-pointer"
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
                    className="grid grid-cols-3 p-0.5 rounded-xl text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {(
                      [
                        ['all', isDe ? 'Alle' : 'All'],
                        ['unrated', isDe ? 'Offen' : 'Unrated'],
                        ['rated', isDe ? 'Bewertet' : 'Rated'],
                      ] as [ProgressFilter, string][]
                    ).map(([key, label]) => {
                      const active = progressFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setProgressFilter(key)}
                          className="min-h-[34px] px-2 py-1 rounded-[10px] font-medium transition-colors cursor-pointer"
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Category Progress Strip */}
        <div
          className="h-[2px] rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--border)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${activeCatPct}%`,
              backgroundColor: 'var(--gold)',
            }}
          />
        </div>
      </section>

      {/* Main Content: Focus Card Mode OR Full List Mode */}
      {filteredEntries.length === 0 ? (
        <section className="max-w-2xl mx-auto">
          <div className="noble-bezel p-1.5 rounded-[26px]">
            <div className="noble-card rounded-[20px] p-7 sm:p-9 text-center space-y-4">
              <h2 className="font-serif-card text-xl sm:text-2xl font-medium m-0">
                {progressFilter === 'unrated' && activeCategoryProgress.total > 0
                  ? isDe
                    ? 'Alle Karten dieser Kategorie bewertet'
                    : 'All cards in this category rated'
                  : isDe
                    ? 'Keine Karten gefunden'
                    : 'No matching cards'}
              </h2>
              <p className="text-xs sm:text-sm m-0" style={{ color: 'var(--ink-muted)' }}>
                {progressFilter === 'unrated' && activeCategoryProgress.total > 0
                  ? isDe
                    ? 'Du hast hier keine offenen Karten mehr. Weiter zum nächsten Stapel?'
                    : 'Nothing left unrated here. Want to jump to the next stack?'
                  : isDe
                    ? 'Passe deine Filter oder Suche an, um weitere Karten zu sehen.'
                    : 'Adjust your filters or search to view other cards.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {nextUnratedCategory && (
                  <button
                    type="button"
                    onClick={() => setCategoryTab(nextUnratedCategory)}
                    className="min-h-[42px] px-5 py-2 rounded-full text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }}
                  >
                    <span>{isDe ? 'Nächste Kategorie' : 'Next category'}</span>
                    <ChevronRightIcon size={14} />
                  </button>
                )}
                {(progressFilter !== 'all' || sourceFilter !== 'all' || search.trim() !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProgressFilter('all');
                      setSourceFilter('all');
                      setSearch('');
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-full text-xs sm:text-sm font-medium cursor-pointer"
                    style={{
                      backgroundColor: 'var(--elevated)',
                      color: 'var(--ink)',
                    }}
                  >
                    {isDe ? 'Alle anzeigen' : 'Show all cards'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : viewMode === 'focus' && activeEntry ? (
        <section className="max-w-2xl mx-auto space-y-3">
          <AnimatePresence mode="wait" initial={false}>
            {(() => {
              const { card, source } = activeEntry;
              const currentVote = votes[card.id];
              const savedEdit = edits[card.id];
              const isEditingHere = openEditCardId === card.id;
              const showAltLang = Boolean(revealedOtherLangIds[card.id]);
              const primaryText = isDe ? card.de : card.en;
              const altText = isDe ? card.en : card.de;
              const promptText = isDe ? card.promptDe : card.promptEn;
              const stackMeta = getStackMetaSafe(stackMap, card.stackId);

              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.99 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-3"
                >
                  {/* Focus Card Surface */}
                  <article className="noble-bezel p-1.5 rounded-[26px]">
                    <div className="noble-card relative overflow-hidden rounded-[20px] p-5 sm:p-7 min-h-[240px] sm:min-h-[280px] flex flex-col justify-between gap-4">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-2.5 sm:inset-3 rounded-[14px] border"
                        style={{ borderColor: 'var(--gold-hairline)' }}
                      />

                      {/* Card Top Meta Row */}
                      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="px-2.5 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor:
                                source === 'suggestion'
                                  ? 'var(--gold-soft)'
                                  : 'var(--subtle)',
                              color:
                                source === 'suggestion'
                                  ? 'var(--gold)'
                                  : 'var(--ink-muted)',
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
                              style={{
                                backgroundColor: 'var(--subtle)',
                                color: 'var(--ink-muted)',
                              }}
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
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className="tabular-nums font-medium"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {focusIndex + 1} / {filteredEntries.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleAltLang(card.id)}
                            className="min-h-[30px] px-2.5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer"
                            style={{
                              backgroundColor: showAltLang ? 'var(--elevated)' : 'var(--subtle)',
                              color: showAltLang ? 'var(--ink)' : 'var(--ink-muted)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {showAltLang
                              ? isDe
                                ? 'EN aus'
                                : 'Hide DE'
                              : isDe
                                ? 'EN'
                                : 'DE'}
                          </button>
                        </div>
                      </div>

                      {/* Main Card Body */}
                      <div className="relative z-10 space-y-2.5 my-auto py-1">
                        <p
                          className="font-serif-card text-[1.18rem] sm:text-[1.42rem] leading-[1.42] m-0"
                          style={{ color: 'var(--ink)' }}
                        >
                          {card.kind === 'quote' ? `“${primaryText}”` : primaryText}
                        </p>

                        {promptText && (
                          <p
                            className="text-xs sm:text-sm leading-relaxed m-0 pl-3 border-l-2"
                            style={{
                              borderColor: 'var(--gold-hairline)',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            {promptText}
                          </p>
                        )}

                        {showAltLang && (
                          <p
                            className="text-xs sm:text-sm m-0 pt-1"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {card.kind === 'quote' ? `“${altText}”` : altText}
                          </p>
                        )}

                        <QuoteSourceBar card={card} isDe={isDe} />

                        {savedEdit && !isEditingHere && (
                          <div
                            className="rounded-xl px-3.5 py-2 text-xs space-y-0.5"
                            style={{
                              backgroundColor: 'var(--gold-soft)',
                              border: '1px solid var(--gold-hairline)',
                            }}
                          >
                            <div
                              className="font-medium text-[11px]"
                              style={{ color: 'var(--gold)' }}
                            >
                              {isDe
                                ? `Dein Änderungsvorschlag (${savedEdit.language.toUpperCase()}):`
                                : `Your suggested wording (${savedEdit.language.toUpperCase()}):`}
                            </div>
                            <div style={{ color: 'var(--ink)' }}>{savedEdit.text}</div>
                          </div>
                        )}
                      </div>

                      {/* Subtle Saved Feedback Footer Inside Card */}
                      <div className="relative z-10 flex items-center justify-between text-[11px]">
                        <span style={{ color: 'var(--ink-soft)' }}>{card.id}</span>
                        {lastSavedCardId === card.id && (
                          <span style={{ color: 'var(--accent)' }}>
                            {isDe ? 'Gespeichert' : 'Saved'}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>

                  {/* Thumb-Zone 4-Column Rating Bar */}
                  <RatingButtonGroup
                    card={card}
                    currentVote={currentVote}
                    layout="focus"
                    isDe={isDe}
                    onVote={handleVote}
                  />

                  {/* Secondary Navigation + Suggest Wording Bar */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <button
                      type="button"
                      disabled={focusIndex <= 0}
                      onClick={() => stepFocus(-1)}
                      className="min-h-[44px] px-3.5 rounded-2xl text-xs font-medium inline-flex items-center justify-start gap-1.5 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <ChevronLeftIcon size={14} />
                      <span>{isDe ? 'Zurück' : 'Prev'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(card)}
                      className="min-h-[44px] px-4 rounded-2xl text-xs font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          isEditingHere || savedEdit ? 'var(--gold-soft)' : 'var(--card)',
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
                            ? 'Vorschlag ändern'
                            : 'Edit wording'
                          : isDe
                            ? 'Formulierung'
                            : 'Suggest wording'}
                    </button>

                    <button
                      type="button"
                      disabled={focusIndex >= filteredEntries.length - 1}
                      onClick={() => stepFocus(1)}
                      className="min-h-[44px] px-3.5 rounded-2xl text-xs font-medium inline-flex items-center justify-end gap-1.5 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <span>{isDe ? 'Weiter' : 'Next'}</span>
                      <ChevronRightIcon size={14} />
                    </button>
                  </div>

                  {/* Inline Editor (if open for this focus card) */}
                  {isEditingHere && (
                    <div
                      className="rounded-[20px] p-4"
                      style={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <WordingEditorForm
                        card={card}
                        lang={lang}
                        isDe={isDe}
                        editDraft={editDraft}
                        savedEdit={savedEdit}
                        onChangeDraft={setEditDraft}
                        onSave={handleSaveEdit}
                        onCancel={() => setOpenEditCardId(null)}
                      />
                    </div>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </section>
      ) : (
        <section className="space-y-3">
          {filteredEntries.map(({ card, source }) => {
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
                className="rounded-[20px] p-4 sm:p-5 space-y-3.5 transition-colors"
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

                    <span className="hidden sm:inline" style={{ color: 'var(--ink-soft)' }}>
                      · {card.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {lastSavedCardId === card.id && (
                      <span className="text-[11px]" style={{ color: 'var(--accent)' }}>
                        {isDe ? 'Gespeichert' : 'Saved'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleAltLang(card.id)}
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

                  <QuoteSourceBar card={card} isDe={isDe} />
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <RatingButtonGroup
                    card={card}
                    currentVote={currentVote}
                    layout="list"
                    isDe={isDe}
                    onVote={handleVote}
                  />

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(card)}
                    className="w-full sm:w-auto min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl sm:rounded-full text-xs font-medium transition-colors cursor-pointer"
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

                {/* Inline Wording-Change Editor */}
                {isEditingHere && (
                  <WordingEditorForm
                    card={card}
                    lang={lang}
                    isDe={isDe}
                    editDraft={editDraft}
                    savedEdit={savedEdit}
                    onChangeDraft={setEditDraft}
                    onSave={handleSaveEdit}
                    onCancel={() => setOpenEditCardId(null)}
                  />
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
};
