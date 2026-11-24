import React from 'react';
import { motion } from 'motion/react';
import { useResonance } from '../context/ResonanceContext';
import { BookmarkIcon, DeckPlayIcon, QrIcon, StacksIcon } from './Icons';

const LENS_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
};

type MobileTabId = 'stacks' | 'play' | 'saved' | 'group';

export const MobileGlassBar: React.FC = () => {
  const {
    lang,
    route,
    navigate,
    favorites,
    favoritesOpen,
    setFavoritesOpen,
    qrModalOpen,
    setQrModalOpen,
    activeRoom,
    incomingSubmissions,
  } = useResonance();

  // Hide bottom tab bar on guest QR submission, friend review, and internal admin views
  if (route.startsWith('/join') || route.startsWith('/admin') || route.startsWith('/review')) {
    return null;
  }

  const isDe = lang === 'de';

  const activeTab: MobileTabId = favoritesOpen
    ? 'saved'
    : qrModalOpen
      ? 'group'
      : route === '/play'
        ? 'play'
        : 'stacks';

  const tabs: {
    id: MobileTabId;
    label: string;
    icon: (isActive: boolean) => React.ReactNode;
    onPress: () => void;
    badge?: React.ReactNode;
    color?: string;
  }[] = [
    {
      id: 'stacks',
      label: isDe ? 'Stapel' : 'Stacks',
      icon: () => <StacksIcon size={18} />,
      onPress: () => {
        setFavoritesOpen(false);
        setQrModalOpen(false);
        navigate('/');
      },
    },
    {
      id: 'play',
      label: isDe ? 'Spielen' : 'Play',
      icon: () => <DeckPlayIcon size={18} />,
      onPress: () => {
        setFavoritesOpen(false);
        setQrModalOpen(false);
        navigate('/play');
      },
    },
    {
      id: 'saved',
      label: isDe ? 'Gemerkt' : 'Saved',
      icon: (isActive) => (
        <BookmarkIcon size={18} filled={isActive || favorites.length > 0} />
      ),
      color:
        activeTab === 'saved' || favorites.length > 0 ? 'var(--gold)' : undefined,
      badge:
        favorites.length > 0 ? (
          <span
            className="absolute top-1.5 right-1/2 translate-x-3.5 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--gold)' }}
          />
        ) : null,
      onPress: () => {
        setQrModalOpen(false);
        setFavoritesOpen(!favoritesOpen);
      },
    },
    {
      id: 'group',
      label: isDe ? 'Runde' : 'Group',
      icon: () => <QrIcon size={18} />,
      color: activeTab === 'group' || activeRoom ? 'var(--accent)' : undefined,
      badge:
        incomingSubmissions.length > 0 ? (
          <span
            className="absolute top-1 right-1/2 translate-x-4 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-semibold flex items-center justify-center tabular-nums"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {incomingSubmissions.length}
          </span>
        ) : activeRoom ? (
          <span
            className="absolute top-1.5 right-1/2 translate-x-3.5 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        ) : null,
      onPress: () => {
        setFavoritesOpen(false);
        setQrModalOpen(!qrModalOpen);
      },
    },
  ];

  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[min(94vw,420px)] md:hidden">
      <nav
        aria-label={isDe ? 'Hauptnavigation' : 'Mobile navigation'}
        className="liquid-glass rounded-full p-1.5 grid grid-cols-4 gap-1"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const activeColor = tab.color ?? (isActive ? 'var(--accent)' : 'var(--ink-muted)');

          return (
            <motion.button
              key={tab.id}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={tab.onPress}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-1 py-2 rounded-full transition-colors cursor-pointer"
              style={{ color: isActive ? tab.color ?? 'var(--ink)' : activeColor }}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-glass-active"
                  transition={LENS_SPRING}
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor:
                      activeTab === 'saved' ? 'var(--gold-soft)' : 'var(--glass-pill)',
                  }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center">
                {tab.icon(isActive)}
              </span>
              {tab.badge}
              <span className="relative z-10 text-[10.5px] font-medium leading-none tracking-tight">
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
};
