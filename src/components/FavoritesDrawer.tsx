import React from 'react';
import { motion } from 'motion/react';
import { useResonance } from '../context/ResonanceContext';
import { getStackMetaSafe } from '../data/stacks';
import { BookmarkIcon, CloseIcon } from './Icons';

export const FavoritesDrawer: React.FC = () => {
  const {
    lang,
    favorites,
    stackMap,
    cards,
    toggleFavorite,
    openCardDirectly,
    setFavoritesOpen,
  } = useResonance();

  const savedCards = favorites
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const isDe = lang === 'de';

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={isDe ? 'Gespeicherte Karten' : 'Saved cards'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'var(--scrim)' }}
      onClick={() => setFavoritesOpen(false)}
    >
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className="w-full max-w-md h-full flex flex-col p-5 sm:p-6 overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg)',
          borderLeft: '1px solid var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Gespeicherte Karten' : 'Saved cards'}
            </h2>
            <p className="text-xs m-0 mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              {savedCards.length}{' '}
              {savedCards.length === 1
                ? isDe
                  ? 'Eintrag'
                  : 'card'
                : isDe
                  ? 'Einträge'
                  : 'cards'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFavoritesOpen(false)}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--elevated)] cursor-pointer"
            style={{ color: 'var(--ink-muted)' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex-1 py-4 space-y-3">
          {savedCards.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              {isDe
                ? 'Noch keine Karten gespeichert. Tippe beim Spielen auf das Lesezeichen-Symbol.'
                : 'No saved cards yet. Tap the bookmark icon while playing to keep favorites here.'}
            </div>
          ) : (
            savedCards.map((card) => {
              const stack = getStackMetaSafe(stackMap, card.stackId);
              return (
                <div
                  key={card.id}
                  className="noble-bezel p-1 rounded-2xl"
                >
                  <div className="noble-card rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stack.accent }}
                        />
                        {isDe ? stack.nameDe : stack.nameEn}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(card.id)}
                        aria-label="Remove saved card"
                        className="p-1 rounded-full hover:bg-[var(--elevated)] cursor-pointer"
                        style={{ color: 'var(--gold)' }}
                      >
                        <BookmarkIcon size={14} filled />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openCardDirectly(card.id)}
                      className="text-left w-full font-serif-card text-base leading-snug hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--ink)' }}
                    >
                      {isDe ? card.de : card.en}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
};
