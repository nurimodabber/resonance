import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckIcon,
  ChevronRightIcon,
  ConcentricLogo,
  EmbossedNonagonPaper,
  NonagonFiligree,
  QrIcon,
  StackArtwork,
} from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { STACKS } from '../data/stacks';
import type { StackId } from '../types/deck';

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
  const { lang, cards, startPlay, setQrModalOpen } = useResonance();
  const [selectedStacks, setSelectedStacks] = useState<StackId[]>([]);

  const stackCounts = useMemo(() => {
    const counts: Record<StackId, number> = {
      warmup: 0,
      reflection: 0,
      vulnerability: 0,
      friendship: 0,
      spirituality: 0,
      quotes: 0,
    };
    for (const c of cards) {
      if (!c.archived && c.kind !== 'wildcard') {
        counts[c.stackId] = (counts[c.stackId] || 0) + 1;
      }
    }
    return counts;
  }, [cards]);

  const toggleSelect = (id: StackId, e: React.MouseEvent) => {
    e.stopPropagation();
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
    startPlay({
      type: 'stacks',
      stackIds: selectedStacks,
      quoteSubdeck: selectedStacks.includes('quotes') ? 'all' : undefined,
      ruhiChapter: 'all',
    });
  };

  const isDe = lang === 'de';

  return (
    <main className="candlelight-halo max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-32 md:h-[calc(100dvh-60px)] md:min-h-[600px] md:py-4 lg:py-5 md:pb-5 md:flex md:flex-col md:gap-4 lg:gap-5 space-y-6 md:space-y-0">
      {/* Guided Journey Feature Card (Double-Bezel + Architectural 9-Gon Filigree) */}
      <motion.section
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={ENTRANCE_SPRING}
        className="shrink-0"
      >
        <motion.div
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.992 }}
          transition={STACK_SPRING}
          className="noble-bezel noble-bezel-hover p-1.5 rounded-[26px] cursor-pointer"
          onClick={() => startPlay({ type: 'journey' })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startPlay({ type: 'journey' });
            }
          }}
        >
          <div
            className="noble-card relative overflow-hidden rounded-[20px] px-5 py-4 sm:px-7 sm:py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            {/* Architectural 9-Gon Concentric Watermark behind the inset hairline outline */}
            <NonagonFiligree
              showCore
              className="pointer-events-none absolute -right-10 -top-14 z-0 w-52 h-52 opacity-[0.09]"
            />
            {/* 02 Inset Letterpress Hairline Frame */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 sm:inset-2.5 z-[1] rounded-[14px] border"
              style={{ borderColor: 'var(--gold-hairline)' }}
            />

            <div className="relative z-10 flex items-center gap-4 min-w-0">
              <ConcentricLogo size={40} className="shrink-0 w-9 h-9 sm:w-10 sm:h-10" />
              <div className="min-w-0">
                <h1 className="font-serif-card text-[clamp(1.22rem,1.9vw,1.65rem)] font-medium m-0 leading-tight text-balance">
                  {isDe ? 'Abend-Reise' : 'Guided Journey'}
                </h1>
                <p
                  className="text-xs sm:text-[13px] lg:text-sm m-0 mt-1 truncate max-w-full"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {isDe
                    ? 'Vom leichten Einstieg behutsam tiefer – für Abende, die im Gespräch wachsen.'
                    : 'Moves gently from easy openers into questions you remember the next day.'}
                </p>
              </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 self-start sm:self-center">
              <span
                className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <span>{isDe ? 'Beginnen' : 'Begin'}</span>
                <ChevronRightIcon size={14} />
              </span>
            </div>
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
            {isDe ? 'Stapel wählen oder mehrere mischen' : 'Choose a stack or mix several'}
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 pt-1 md:flex-1 md:min-h-0 lg:grid-rows-2"
        >
          {STACKS.map((stack) => {
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
        {selectedStacks.length > 0 && (
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
    </main>
  );
};
