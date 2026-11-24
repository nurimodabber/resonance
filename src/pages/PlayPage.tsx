import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CardDeck, type CardTransitionMeta } from '../components/CardDeck';
import { ChevronLeftIcon, EmbossedNonagonPaper } from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { recordCardRating } from '../services/repository';
import type { CardItem, QuoteSubdeck, RuhiChapter } from '../types/deck';
import { triggerHaptic } from '../utils/audio';
import { buildSessionDeck, mixSubmissionsIntoQueue } from '../utils/deckEngine';

export const PlayPage: React.FC = () => {
  const {
    lang,
    toggleLang,
    stacks,
    stackMap,
    cards,
    playMode,
    startPlay,
    focusCardId,
    clearFocusCard,
    isFavorite,
    toggleFavorite,
    incomingSubmissions,
    navigate,
  } = useResonance();

  const [sessionSeed, setSessionSeed] = useState(0);
  const [transitionMeta, setTransitionMeta] = useState<CardTransitionMeta>({
    vote: 0,
    dir: 'advance',
  });
  const [queue, setQueue] = useState<CardItem[]>([]);
  const [index, setIndex] = useState(0);

  // Build deck whenever mode, catalog, or reshuffle changes
  useEffect(() => {
    const built = buildSessionDeck(cards, playMode, Math.random, stacks);

    if (focusCardId) {
      const target = cards.find((c) => c.id === focusCardId);
      if (target) {
        const without = built.filter((c) => c.id !== target.id);
        setQueue([target, ...without]);
        setIndex(0);
        clearFocusCard();
        return;
      }
    }

    setQueue(built);
    setIndex(0);
  }, [cards, stacks, playMode, sessionSeed, focusCardId, clearFocusCard]);

  // Mix incoming QR group questions seamlessly ahead of the current card
  useEffect(() => {
    if (incomingSubmissions.length === 0) return;
    setQueue((prev) => mixSubmissionsIntoQueue(prev, index, incomingSubmissions, cards));
  }, [incomingSubmissions, cards, index]);

  const activeCard = queue[index] ?? null;
  const remainingCount = Math.max(0, queue.length - index);

  const isQuoteFocus = useMemo(() => {
    return (
      playMode.type === 'stacks' &&
      playMode.stackIds.length === 1 &&
      playMode.stackIds[0] === 'quotes'
    );
  }, [playMode]);

  const activeSubdeck: QuoteSubdeck | 'all' =
    playMode.type === 'stacks' && playMode.quoteSubdeck ? playMode.quoteSubdeck : 'all';
  const activeChapter: RuhiChapter | 'all' =
    playMode.type === 'stacks' && playMode.ruhiChapter ? playMode.ruhiChapter : 'all';

  const handleAdvance = (vote: -1 | 0 | 1) => {
    if (!activeCard) return;
    if (vote !== 0) {
      recordCardRating(activeCard.id, vote).catch(() => {});
    }
    triggerHaptic(10);
    setTransitionMeta({ vote, dir: 'advance' });
    setIndex((prev) => prev + 1);
  };

  const handleUndo = () => {
    if (index <= 0) return;
    triggerHaptic(6);
    setTransitionMeta({ vote: 0, dir: 'undo' });
    setIndex((prev) => Math.max(0, prev - 1));
  };

  // Keyboard ergonomics on desktop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (activeCard) handleAdvance(0);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'l') {
        toggleLang();
      } else if (e.key.toLowerCase() === 'f' && activeCard) {
        toggleFavorite(activeCard.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const setQuoteFilter = (subdeck: QuoteSubdeck | 'all', chapter: RuhiChapter | 'all' = 'all') => {
    startPlay({
      type: 'stacks',
      stackIds: ['quotes'],
      quoteSubdeck: subdeck,
      ruhiChapter: subdeck === 'ruhi' ? chapter : 'all',
    });
  };

  const isDe = lang === 'de';

  return (
    <main className="candlelight-halo min-h-[calc(100dvh-60px)] md:h-[calc(100dvh-60px)] w-full px-3 sm:px-6 lg:px-10 pt-2 pb-[96px] md:pt-2 md:pb-4 flex flex-col justify-between gap-2">
      {/* Quiet Sub-Header */}
      <div className="w-full max-w-[min(95vw,1040px)] mx-auto flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-[var(--elevated)] cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          <ChevronLeftIcon size={14} />
          <span>{isDe ? 'Alle Stapel' : 'All stacks'}</span>
        </button>

        {/* Quotes Subfolder Switcher (only visible inside the Quotes stack) */}
        {isQuoteFocus && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex p-0.5 rounded-full text-xs"
              style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
            >
              {(
                [
                  ['all', isDe ? 'Alle' : 'All'],
                  ['general', isDe ? 'Allgemein' : 'General'],
                  ['ruhi', isDe ? 'Ruhi Buch 1' : 'Ruhi Book 1'],
                ] as const
              ).map(([key, label]) => {
                const active = activeSubdeck === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setQuoteFilter(key, 'all')}
                    className="relative px-3 py-1 rounded-full font-medium transition-colors cursor-pointer"
                    style={{
                      color: active ? 'var(--accent-ink)' : 'var(--ink-muted)',
                    }}
                  >
                    {active && (
                      <motion.span
                        layoutId="quotes-subdeck-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {activeSubdeck === 'ruhi' && (
                <motion.div
                  key="ruhi-chapters"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex p-0.5 rounded-full text-[11px]"
                  style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
                >
                  {(['all', 1, 2, 3] as const).map((ch) => {
                    const active = activeChapter === ch;
                    return (
                      <button
                        key={String(ch)}
                        type="button"
                        onClick={() => setQuoteFilter('ruhi', ch)}
                        className="relative px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
                        style={{
                          color: active ? 'var(--accent-ink)' : 'var(--ink-muted)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="quotes-chapter-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-full"
                            style={{ backgroundColor: 'var(--accent)' }}
                          />
                        )}
                        <span className="relative z-10">
                          {ch === 'all'
                            ? isDe
                              ? 'Kap. 1–3'
                              : 'Ch. 1–3'
                            : isDe
                              ? `Kap. ${ch}`
                              : `Ch. ${ch}`}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Main Stack Stage */}
      <div className="flex-1 min-h-0 flex flex-col justify-center w-full">
        {activeCard ? (
          <CardDeck
            card={activeCard}
            nextCard={queue[index + 1] ?? null}
            remainingCount={remainingCount}
            lang={lang}
            canUndo={index > 0}
            isFavorite={isFavorite(activeCard.id)}
            transitionMeta={transitionMeta}
            stackMap={stackMap}
            onAdvance={handleAdvance}
            onUndo={handleUndo}
            onToggleFavorite={() => toggleFavorite(activeCard.id)}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="max-w-[min(94vw,640px)] mx-auto"
          >
            <div
              className="noble-bezel p-1.5 rounded-[28px]"
              style={{ borderColor: 'var(--deck-edge-border-strong)' }}
            >
              <div className="noble-card relative overflow-hidden rounded-[22px] p-8 sm:p-10 text-center space-y-4">
                <EmbossedNonagonPaper
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-[360px] h-[360px]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-3 sm:inset-3.5 z-[1] rounded-[15px] border"
                  style={{ borderColor: 'var(--gold-hairline)' }}
                />
                <h2 className="relative z-10 font-serif-card text-2xl font-medium m-0">
                  {isDe ? 'Dieser Stapel ist durchgespielt' : 'End of this deck'}
                </h2>
                <p className="relative z-10 text-sm m-0" style={{ color: 'var(--ink-muted)' }}>
                  {isDe
                    ? 'Möchtet ihr die Karten neu mischen oder einen anderen Stapel öffnen?'
                    : 'Would you like to shuffle again or pick another stack?'}
                </p>
                <div className="relative z-10 pt-2 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
                  >
                    {isDe ? 'Zu den Stapeln' : 'Back to stacks'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionSeed((s) => s + 1)}
                    className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    {isDe ? 'Neu mischen' : 'Shuffle again'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
};
