import React from 'react';
import { motion } from 'motion/react';
import { useResonance } from '../context/ResonanceContext';
import {
  BookmarkIcon,
  ConcentricLogo,
  DeckPlayIcon,
  MoonIcon,
  QrIcon,
  StacksIcon,
  SunIcon,
} from './Icons';

const NAV_PILL_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
};

export const IslandNav: React.FC = () => {
  const {
    lang,
    toggleLang,
    theme,
    toggleTheme,
    favorites,
    setFavoritesOpen,
    setQrModalOpen,
    activeRoom,
    incomingSubmissions,
    route,
    navigate,
  } = useResonance();

  const isJoin = route.startsWith('/join');
  const isAdmin = route.startsWith('/admin');
  const isDe = lang === 'de';

  const navRoutes = [
    {
      path: '/',
      label: isDe ? 'Stapel' : 'Stacks',
      icon: <StacksIcon size={14} />,
      active: route === '/',
    },
    {
      path: '/play',
      label: isDe ? 'Spielen' : 'Play',
      icon: <DeckPlayIcon size={14} />,
      active: route === '/play',
    },
  ];

  const renderBrand = (logoSize: number) => (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="flex items-center gap-2.5 pl-0.5 pr-2 py-0.5 rounded-full hover:opacity-85 transition-opacity cursor-pointer"
      style={{ color: 'var(--ink)' }}
    >
      <ConcentricLogo size={logoSize} />
      <span className="text-sm sm:text-[15px] font-semibold tracking-tight">Resonance</span>
    </button>
  );

  const renderUtilityButtons = (includeDrawers: boolean) => (
    <div className="flex items-center gap-1">
      {includeDrawers && !isJoin && (
        <>
          <button
            type="button"
            onClick={() => setFavoritesOpen(true)}
            aria-label={isDe ? 'Gespeicherte Karten' : 'Saved cards'}
            title={isDe ? 'Gespeicherte Karten' : 'Saved cards'}
            className="relative w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--elevated)] cursor-pointer"
            style={{ color: favorites.length > 0 ? 'var(--gold)' : 'var(--ink-muted)' }}
          >
            <BookmarkIcon size={15} filled={favorites.length > 0} />
            {favorites.length > 0 && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--gold)' }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            aria-label={isDe ? 'QR-Runde' : 'QR Group Pile'}
            title={isDe ? 'QR-Runde öffnen' : 'Open QR group pile'}
            className="relative w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
            style={{
              backgroundColor: activeRoom ? 'var(--accent-soft)' : 'transparent',
              color: activeRoom ? 'var(--accent)' : 'var(--ink-muted)',
            }}
          >
            <QrIcon size={15} />
            {incomingSubmissions.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-semibold flex items-center justify-center tabular-nums"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {incomingSubmissions.length}
              </span>
            )}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Warm Cotton Light' : 'Evening Sanctuary Dark'}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--elevated)] cursor-pointer"
        style={{ color: 'var(--ink-muted)' }}
      >
        {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
      </button>

      {/* Singular Language Toggle Button */}
      <button
        type="button"
        onClick={toggleLang}
        aria-label={isDe ? 'Switch to English' : 'Auf Deutsch wechseln'}
        title={isDe ? 'Switch to English' : 'Auf Deutsch wechseln'}
        className="h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-wide transition-opacity hover:opacity-85 cursor-pointer"
        style={{
          backgroundColor: 'var(--elevated)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
        }}
      >
        {lang.toUpperCase()}
      </button>
    </div>
  );

  return (
    <header className="w-full pt-2.5 sm:pt-3 px-4 sm:px-6 lg:px-10">
      {/* Desktop: Quiet Frosted Navigation Bar */}
      <nav
        aria-label="Primary"
        className="hidden md:flex max-w-7xl mx-auto px-5 py-2 rounded-full items-center justify-between gap-4 liquid-glass transition-colors"
      >
        <div className="flex items-center gap-5">
          {renderBrand(28)}

          {!isJoin && !isAdmin && (
            <div className="inline-flex items-center gap-1 text-xs">
              {navRoutes.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  aria-current={item.active ? 'page' : undefined}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer"
                  style={{ color: item.active ? 'var(--accent)' : 'var(--ink-muted)' }}
                >
                  {item.active && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      transition={NAV_PILL_SPRING}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: 'var(--glass-pill)' }}
                    />
                  )}
                  <span className="relative z-10 flex items-center">{item.icon}</span>
                  <span className="relative z-10">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {renderUtilityButtons(true)}
      </nav>

      {/* Mobile: Clean, Quiet Top Header (Primary Tabs Live in MobileGlassBar) */}
      <div className="flex md:hidden items-center justify-between px-1 py-1">
        {renderBrand(26)}
        {renderUtilityButtons(false)}
      </div>
    </header>
  );
};
