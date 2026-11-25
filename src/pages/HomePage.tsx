import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  EmbossedNonagonPaper,
  NonagonFiligree,
  QrIcon,
  StackArtwork,
  StacksIcon,
} from '../components/Icons';
import { JourneyLengthSlider } from '../components/JourneyLengthSlider';
import { useResonance } from '../context/ResonanceContext';
import type { JourneyLength, QuoteSubdeck, StackId } from '../types/deck';

const STACK_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 26,
};

const ENTRANCE_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 28,
};

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: ENTRANCE_SPRING,
  },
};

const layer3Variants = {
  rest: { y: 0, rotate: 0, transition: STACK_SPRING },
  hover: { y: -3, rotate: -1.2, transition: STACK_SPRING },
  tap: { y: -1, rotate: -0.6, transition: STACK_SPRING },
};

const layer2Variants = {
  rest: { y: 0, rotate: 0, transition: STACK_SPRING },
  hover: { y: -2, rotate: 0.9, transition: STACK_SPRING },
  tap: { y: -1, rotate: 0.4, transition: STACK_SPRING },
};

const layer1Variants = {
  rest: { y: 0, transition: STACK_SPRING },
  hover: { y: -1, transition: STACK_SPRING },
  tap: { y: 0, transition: STACK_SPRING },
};

const frontCardVariants = {
  rest: { y: 0, scale: 1, transition: STACK_SPRING },
  hover: { y: -6, scale: 1, transition: STACK_SPRING },
  tap: { y: -2, scale: 0.985, transition: STACK_SPRING },
};

export const HomePage: React.FC = () => {
  const { lang, stacks, cards, startPlay, setQrModalOpen } = useResonance();
  const [selectedStacks, setSelectedStacks] = useState<StackId[]>([]);
  const [journeyLength, setJourneyLength] = useState<JourneyLength>(25);
  const [mixModalOpen, setMixModalOpen] = useState(false);
  const [mixQuoteSubdeck, setMixQuoteSubdeck] = useState<QuoteSubdeck | 'all'>('all');

  useEffect(() => {
    if (!mixModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMixModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mixModalOpen]);

  const visibleStacks = useMemo(
    () => stacks.filter((s) => !s.archived).slice().sort((a, b) => a.ring - b.ring),
    [stacks],
  );

  const stackCounts = useMemo(() => {
    const counts: Record<StackId, number> = {};
    for (const s of visibleStacks) {
      counts[s.id] = 0;
    }
    for (const c of cards) {
      if (!c.archived && c.kind !== 'wildcard') {
        counts[c.stackId] = (counts[c.stackId] || 0) + 1;
      }
    }
    return counts;
  }, [visibleStacks, cards]);

  const mixCardCount = useMemo(() => {
    if (selectedStacks.length === 0) return 0;
    const picked = new Set(selectedStacks);
    return cards.filter((c) => {
      if (c.archived || c.kind === 'wildcard') return false;
      if (!picked.has(c.stackId)) return false;
      if (
        c.stackId === 'quotes' &&
        mixQuoteSubdeck !== 'all' &&
        c.quoteSubdeck !== mixQuoteSubdeck
      ) {
        return false;
      }
      return true;
    }).length;
  }, [cards, selectedStacks, mixQuoteSubdeck]);

  const toggleSelect = (id: StackId, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedStacks((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleOpenStack = (id: StackId) => {
    if (selectedStacks.length > 0) {
      setSelectedStacks((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
      return;
    }
    startPlay({
      type: 'stacks',
      stackIds: [id],
      quoteSubdeck: id === 'quotes' ? 'all' : undefined,
      ruhiChapter: 'all',
    });
  };

  const handleStartMix = () => {
    if (selectedStacks.length === 0) return;
    setMixModalOpen(false);
    startPlay({
      type: 'stacks',
      stackIds: selectedStacks,
      quoteSubdeck: selectedStacks.includes('quotes') ? mixQuoteSubdeck : undefined,
      ruhiChapter: 'all',
    });
  };

  const isDe = lang === 'de';

  const journeyTotalCount = useMemo(
    () =>
      cards.filter(
        (c) =>
          !c.archived &&
          c.kind === 'question' &&
          visibleStacks.some((s) => s.id === c.stackId && s.id !== 'quotes'),
      ).length,
    [cards, visibleStacks],
  );

  return (
    <main
      className={`candlelight-halo max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-32 ${
        visibleStacks.length <= 6 ? 'md:h-[calc(100dvh-60px)]' : 'md:min-h-[calc(100dvh-60px)]'
      } md:min-h-[600px] md:py-4 lg:py-5 md:pb-5 md:flex md:flex-col md:gap-4 lg:gap-5 space-y-6 md:space-y-0`}
    >
      {/* Two Primary Modes: Progressively Deeper (Primary Hero) + Mix & Match (Companion) */}
      <motion.section
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={ENTRANCE_SPRING}
        className="shrink-0 grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-3 lg:gap-4"
      >
        {/* Mode 1: Progressively Deeper */}
        <motion.div
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.992 }}
          transition={STACK_SPRING}
          className="noble-bezel noble-bezel-hover p-1.5 rounded-[26px] cursor-pointer flex"
          onClick={() => startPlay({ type: 'journey', length: journeyLength })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              startPlay({ type: 'journey', length: journeyLength });
            }
          }}
        >
          <div
            className="noble-card relative overflow-hidden rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 w-full flex flex-col justify-between gap-3.5"
            style={{
              backgroundImage:
                'radial-gradient(circle at 92% 10%, var(--gold-soft) 0%, transparent 56%)',
            }}
          >
            <NonagonFiligree
              showCore
              className="pointer-events-none absolute -right-10 -top-14 z-0 w-44 h-44 opacity-[0.08]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2.5 z-[1] rounded-[14px] border"
              style={{ borderColor: 'var(--gold-hairline)' }}
            />

            <div className="relative z-10 min-w-0 space-y-1">
              <span
                className="block text-[10px] font-medium uppercase tracking-[0.16em]"
                style={{ color: 'var(--gold)' }}
              >
                {isDe ? 'Warm-up → Tiefe' : 'Warm-up → Depth'}
              </span>
              <h1 className="font-serif-card text-[1.32rem] sm:text-[1.5rem] font-medium tracking-[-0.015em] leading-[1.15] m-0 text-balance">
                {isDe ? 'Schrittweise tiefer' : 'Progressively Deeper'}
              </h1>
              <p
                className="text-xs sm:text-[13px] m-0 leading-snug truncate max-w-full"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe
                  ? 'Vom leichten Einstieg in ausgewogene Tiefe.'
                  : 'Easy openers to deeper prompts, sized for tonight.'}
              </p>
            </div>

            <div
              className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-3 mt-1 border-t"
              style={{ borderColor: 'var(--gold-hairline)' }}
            >
              <div className="flex-1 min-w-0">
                <JourneyLengthSlider
                  value={journeyLength}
                  onChange={setJourneyLength}
                  totalAvailable={journeyTotalCount}
                  lang={lang}
                />
              </div>

              <span
                className="min-h-[40px] sm:min-h-[42px] px-5 rounded-full text-xs sm:text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 self-end sm:self-auto"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <span>{isDe ? 'Beginnen' : 'Begin'}</span>
                <ChevronRightIcon size={13} />
              </span>
            </div>
          </div>
        </motion.div>

        {/* Mode 2: Mix & Match Companion Card */}
        <motion.div
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.992 }}
          transition={STACK_SPRING}
          onClick={() => setMixModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setMixModalOpen(true);
            }
          }}
          className="relative overflow-hidden rounded-[24px] p-4 sm:px-6 sm:py-5 cursor-pointer flex items-center justify-between gap-3.5 md:flex-col md:items-stretch transition-colors"
          style={{
            backgroundColor: 'var(--card)',
            border: `1px solid ${
              selectedStacks.length > 0 ? 'var(--accent-border)' : 'var(--border-strong)'
            }`,
            boxShadow: 'var(--shadow-stack)',
            backgroundImage:
              'radial-gradient(circle at 90% 15%, var(--gold-soft) 0%, transparent 58%)',
          }}
        >
          {/* Mobile Left Motif + Copy | Desktop Editorial Header */}
          <div className="relative z-10 flex items-center gap-3 min-w-0 md:block md:space-y-1">
            <span className="md:hidden shrink-0" style={{ color: 'var(--gold)' }}>
              <StacksIcon size={20} />
            </span>

            <div className="min-w-0 md:space-y-1">
              <span
                className="hidden md:block text-[10px] font-medium uppercase tracking-[0.16em]"
                style={{ color: 'var(--gold)' }}
              >
                {isDe ? 'Eigener Mix' : 'Custom Blend'}
              </span>
              <h2 className="font-serif-card text-[1.15rem] md:text-[1.42rem] font-medium tracking-[-0.015em] leading-[1.15] m-0">
                Mix &amp; Match
              </h2>
              <p
                className="text-xs sm:text-[13px] m-0 leading-snug truncate max-w-full"
                style={{ color: 'var(--ink-muted)' }}
              >
                {selectedStacks.length > 0
                  ? `${selectedStacks
                      .map((id) => {
                        const found = visibleStacks.find((s) => s.id === id);
                        return found ? (isDe ? found.nameDe : found.nameEn) : id;
                      })
                      .slice(0, 2)
                      .join(' · ')}${
                      selectedStacks.length > 2 ? ` +${selectedStacks.length - 2}` : ''
                    } · ${mixCardCount} ${isDe ? 'Karten' : 'cards'}`
                  : isDe
                    ? 'Eigene Stapel-Kombination mischen'
                    : 'Pick your own mix of stacks'}
              </p>
            </div>
          </div>

          {/* Mobile Action Pill | Desktop Emblem Strip + Baseline CTA */}
          <div
            className="relative z-10 shrink-0 md:flex md:items-center md:justify-between md:gap-2.5 md:pt-3 md:mt-1 md:border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="hidden md:flex items-center -space-x-2" aria-hidden="true">
              {(selectedStacks.length > 0
                ? visibleStacks.filter((s) => selectedStacks.includes(s.id)).slice(0, 3)
                : [visibleStacks[0], visibleStacks[3], visibleStacks[5]].filter(Boolean)
              ).map((s) => (
                <div
                  key={s.id}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--elevated)',
                    color: 'var(--gold)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <StackArtwork stackId={s.id} iconId={s.iconId} size={13} />
                </div>
              ))}
            </div>

            <span
              className="min-h-[36px] md:min-h-[38px] px-3.5 md:px-4 rounded-full text-xs md:text-[13px] font-medium inline-flex items-center gap-1.5 shrink-0"
              style={{
                backgroundColor:
                  selectedStacks.length > 0 ? 'var(--accent)' : 'var(--elevated)',
                color: selectedStacks.length > 0 ? 'var(--accent-ink)' : 'var(--ink)',
                border:
                  selectedStacks.length > 0
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border-strong)',
              }}
            >
              <span className="md:hidden">
                {selectedStacks.length > 0
                  ? isDe
                    ? 'Anpassen'
                    : 'Adjust'
                  : isDe
                    ? 'Wählen'
                    : 'Choose'}
              </span>
              <span className="hidden md:inline">
                {isDe ? 'Stapel wählen' : 'Choose stacks'}
              </span>
              <ChevronRightIcon size={13} />
            </span>
          </div>
        </motion.div>
      </motion.section>

      {/* Symmetrical 6-Stack Physical Deck Grid */}
      <section
        aria-label={isDe ? 'Kartenstapel' : 'Question stacks'}
        className="space-y-3 md:space-y-0 md:flex-1 md:min-h-0 md:flex md:flex-col md:gap-3"
      >
        <div className="flex items-center justify-between px-1 shrink-0">
          <h2 className="text-xs sm:text-sm font-medium m-0" style={{ color: 'var(--ink-muted)' }}>
            {isDe ? 'Oder direkt einen einzelnen Stapel öffnen' : 'Or jump straight into a single stack'}
          </h2>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={STACK_SPRING}
            onClick={() => setQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors hover:opacity-85 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <QrIcon size={13} />
            <span>{isDe ? 'QR-Runde' : 'Group QR'}</span>
          </motion.button>
        </div>

        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 pt-1 md:flex-1 md:min-h-0 ${
            visibleStacks.length <= 6 ? 'lg:grid-rows-2' : 'lg:auto-rows-[minmax(216px,1fr)]'
          }`}
        >
          {visibleStacks.map((stack) => {
            const selected = selectedStacks.includes(stack.id);
            const count = stackCounts[stack.id] || 0;

            return (
              <motion.div key={stack.id} variants={itemVariants} className="md:h-full">
                <motion.div
                  className="relative pt-3.5 pb-1.5 md:h-full md:flex md:flex-col"
                  initial="rest"
                  animate="rest"
                  whileHover="hover"
                  whileTap="tap"
                >
                  {/* 3 Physical Layered Card Edges Above */}
                  <motion.div
                    aria-hidden="true"
                    variants={layer3Variants}
                    className="pointer-events-none absolute top-0 inset-x-7 h-5 rounded-t-[16px]"
                    style={{
                      backgroundColor: 'var(--deck-edge-2)',
                      border: '1px solid var(--deck-edge-border)',
                      opacity: 0.78,
                    }}
                  />
                  <motion.div
                    aria-hidden="true"
                    variants={layer2Variants}
                    className="pointer-events-none absolute top-1.5 inset-x-4.5 h-5 rounded-t-[18px]"
                    style={{
                      backgroundColor: 'var(--deck-edge-1)',
                      border: '1px solid var(--deck-edge-border)',
                      opacity: 0.9,
                    }}
                  />
                  <motion.div
                    aria-hidden="true"
                    variants={layer1Variants}
                    className="pointer-events-none absolute top-3 inset-x-2.5 h-5 rounded-t-[20px]"
                    style={{
                      backgroundColor: 'var(--deck-bezel)',
                      border: '1px solid var(--deck-edge-border-strong)',
                      opacity: 0.98,
                    }}
                  />

                  {/* Bottom Layered Deck Thickness Hint */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 inset-x-3 h-4 rounded-b-[20px]"
                    style={{
                      backgroundColor: 'var(--deck-edge-1)',
                      border: '1px solid var(--deck-edge-border)',
                      opacity: 0.88,
                    }}
                  />

                  {/* Double-Bezel Front Deck Card */}
                  <motion.div
                    variants={frontCardVariants}
                    onClick={() => handleOpenStack(stack.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenStack(stack.id);
                      }
                    }}
                    className="relative noble-bezel p-1 rounded-[24px] cursor-pointer md:flex-1 md:flex md:flex-col"
                    style={{
                      borderColor: selected ? 'var(--accent)' : undefined,
                      boxShadow: selected
                        ? '0 0 0 1px var(--accent), var(--shadow-card)'
                        : undefined,
                    }}
                  >
                    <div
                      className="noble-card relative overflow-hidden rounded-[20px] p-5 sm:p-5 lg:p-6 min-h-[216px] md:min-h-0 md:flex-1 flex flex-col justify-between"
                    >
                      {/* Corner Mix-Selection Toggle pinned cleanly inside inset frame */}
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.88 }}
                        transition={STACK_SPRING}
                        onClick={(e) => toggleSelect(stack.id, e)}
                        aria-label={
                          selected
                            ? isDe
                              ? `${stack.nameDe} abwählen`
                              : `Deselect ${stack.nameEn}`
                            : isDe
                              ? `${stack.nameDe} zum Mischen auswählen`
                              : `Select ${stack.nameEn} to mix`
                        }
                        className="absolute top-4 right-4 z-20 w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        style={{
                          backgroundColor: selected ? 'var(--accent)' : 'var(--elevated)',
                          color: selected ? 'var(--accent-ink)' : 'var(--ink-muted)',
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
                        }}
                      >
                        {selected && <CheckIcon size={12} />}
                      </motion.button>

                      {/* Upper/Middle Icon Stage: Embossed Background Centered Around Icon Behind Hairline Frame */}
                      <div
                        className="relative flex-1 w-full flex items-center justify-center min-h-[68px]"
                        style={{ color: 'var(--gold)' }}
                      >
                        <EmbossedNonagonPaper
                          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-[216px] h-[216px] sm:w-[236px] sm:h-[236px] lg:w-[250px] lg:h-[250px]"
                        />
                        <StackArtwork
                          stackId={stack.id}
                          iconId={stack.iconId}
                          size={42}
                          className="relative z-10 w-9 h-9 lg:w-11 lg:h-11"
                        />
                      </div>

                      {/* 02 Inset Letterpress Hairline Frame above embossed relief */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-2.5 z-[1] rounded-[14px] border"
                        style={{ borderColor: 'var(--gold-hairline)' }}
                      />

                      {/* 3B Editorial Offset Footer: Left Title/Subtitle + Right Serif Count */}
                      <div className="relative z-10 w-full flex items-end justify-between gap-3 pt-1 text-left">
                        <div className="space-y-0.5 min-w-0">
                          <h3 className="font-serif-card text-[clamp(1.02rem,1.25vw,1.24rem)] font-medium leading-tight text-balance m-0">
                            {isDe ? stack.nameDe : stack.nameEn}
                          </h3>
                          <p
                            className="text-[11px] lg:text-xs m-0 leading-snug truncate"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {isDe ? stack.subtitleDe : stack.subtitleEn}
                          </p>
                        </div>
                        <span
                          className="shrink-0 font-serif-card text-lg lg:text-xl tabular-nums leading-none pb-0.5"
                          style={{ color: 'var(--gold)' }}
                        >
                          {count}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* Floating Multi-Stack Mix Action Pill */}
      <AnimatePresence>
        {!mixModalOpen && selectedStacks.length > 0 && (
          <motion.div
            key="mix-pill"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={STACK_SPRING}
            className="fixed bottom-[92px] md:bottom-6 left-1/2 -translate-x-1/2 z-30"
          >
            <div
              className="inline-flex items-center gap-2 p-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--subtle)',
                border: '1px solid var(--border-strong)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedStacks([])}
                className="px-4 py-2 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Zurücksetzen' : 'Clear'}
              </button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={STACK_SPRING}
                onClick={handleStartMix}
                className="px-5 py-2 rounded-full text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <span>
                  {isDe
                    ? `${selectedStacks.length} Stapel spielen`
                    : `Play ${selectedStacks.length} ${selectedStacks.length === 1 ? 'stack' : 'stacks'}`}
                </span>
                <ChevronRightIcon size={14} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mix & Match Stack Picker Modal */}
      <AnimatePresence>
        {mixModalOpen && (
          <motion.div
            key="mix-match-modal"
            role="dialog"
            aria-modal="true"
            aria-label={isDe ? 'Mix & Match Stapel auswählen' : 'Mix & Match stack picker'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm"
            style={{ backgroundColor: 'var(--scrim)' }}
            onClick={() => setMixModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={ENTRANCE_SPRING}
              className="w-full max-w-2xl p-1.5 rounded-[30px]"
              style={{
                backgroundColor: 'var(--subtle)',
                border: '1px solid var(--border-strong)',
                boxShadow: 'var(--shadow-card)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cardstock relative overflow-hidden rounded-[24px] p-5 sm:p-7 space-y-5 max-h-[86dvh] overflow-y-auto">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2.5 sm:inset-3 rounded-[16px]"
                  style={{ border: '1px solid var(--gold-hairline)' }}
                />

                {/* Modal Header */}
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--gold-soft)',
                        color: 'var(--gold)',
                        border: '1px solid var(--gold-hairline)',
                      }}
                    >
                      <StacksIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-serif-card text-xl sm:text-2xl font-medium m-0 leading-tight">
                        Mix &amp; Match
                      </h2>
                      <p className="text-xs sm:text-sm m-0 mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                        {isDe
                          ? 'Wähle die Stapel, die du miteinander mischen möchtest.'
                          : 'Choose the stacks you want to blend together.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedStacks(visibleStacks.map((s) => s.id))}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium hover:bg-[var(--elevated)] cursor-pointer"
                      style={{ color: 'var(--accent)' }}
                    >
                      {isDe ? 'Alle' : 'All'}
                    </button>
                    {selectedStacks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedStacks([])}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium hover:bg-[var(--elevated)] cursor-pointer"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {isDe ? 'Leeren' : 'Clear'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMixModalOpen(false)}
                      aria-label={isDe ? 'Schließen' : 'Close'}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--elevated)] cursor-pointer"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                </div>

                {/* Stack Combination Grid */}
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visibleStacks.map((stack) => {
                    const selected = selectedStacks.includes(stack.id);
                    const count = stackCounts[stack.id] || 0;
                    return (
                      <button
                        key={stack.id}
                        type="button"
                        onClick={(e) => toggleSelect(stack.id, e)}
                        className="flex items-center justify-between gap-3 rounded-2xl p-3.5 text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: selected ? 'var(--card)' : 'var(--subtle)',
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
                            style={{
                              backgroundColor: selected ? 'var(--accent-soft)' : 'var(--elevated)',
                              color: selected ? 'var(--accent)' : 'var(--gold)',
                            }}
                          >
                            <StackArtwork stackId={stack.id} iconId={stack.iconId} size={20} />
                          </div>
                          <div className="min-w-0">
                            <div
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--ink)' }}
                            >
                              {isDe ? stack.nameDe : stack.nameEn}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              {isDe ? `${count} Karten` : `${count} cards`}
                            </div>
                          </div>
                        </div>

                        <div
                          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                          style={{
                            backgroundColor: selected ? 'var(--accent)' : 'var(--elevated)',
                            color: selected ? 'var(--accent-ink)' : 'var(--ink-muted)',
                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
                          }}
                        >
                          {selected && <CheckIcon size={12} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Optional Quotes Filter when Quotes stack is included */}
                {selectedStacks.includes('quotes') && (
                  <div
                    className="relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>
                      {isDe ? 'Zitate-Auswahl im Mix:' : 'Quotes included in mix:'}
                    </span>
                    <div className="inline-flex flex-wrap items-center gap-1">
                      {(
                        [
                          ['all', isDe ? 'Alle Zitate' : 'All quotes'],
                          ['general', isDe ? 'Allgemein' : 'General'],
                          ['ruhi', isDe ? 'Ruhi Buch 1' : 'Ruhi Book 1'],
                        ] as const
                      ).map(([sub, label]) => {
                        const active = mixQuoteSubdeck === sub;
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => setMixQuoteSubdeck(sub)}
                            className="px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
                            style={{
                              backgroundColor: active ? 'var(--gold-soft)' : 'transparent',
                              color: active ? 'var(--gold)' : 'var(--ink-muted)',
                              border: active
                                ? '1px solid var(--gold-hairline)'
                                : '1px solid transparent',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Modal Footer */}
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                    {selectedStacks.length === 0
                      ? isDe
                        ? 'Wähle mindestens 1 Stapel'
                        : 'Select at least 1 stack'
                      : isDe
                        ? `${selectedStacks.length} Stapel · ${mixCardCount} Karten`
                        : `${selectedStacks.length} ${selectedStacks.length === 1 ? 'stack' : 'stacks'} · ${mixCardCount} cards`}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMixModalOpen(false)}
                      className="px-4 py-2 rounded-full text-xs sm:text-sm font-medium hover:bg-[var(--elevated)] cursor-pointer"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {isDe ? 'Abbrechen' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={selectedStacks.length === 0}
                      onClick={handleStartMix}
                      className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      <span>{isDe ? 'Mix starten' : 'Start Mix'}</span>
                      <ChevronRightIcon size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};
