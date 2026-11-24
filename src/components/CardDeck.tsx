import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'motion/react';
import { pickDigDeeper } from '../data/digDeeper';
import { getStackMetaSafe, STACK_MAP, WILDCARD_ACCENT } from '../data/stacks';
import type { CardItem, Language, StackId, StackMeta } from '../types/deck';
import {
  BookmarkIcon,
  ChevronRightIcon,
  EmbossedNonagonPaper,
  ExternalLinkIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  UndoIcon,
} from './Icons';

export interface CardTransitionMeta {
  vote: -1 | 0 | 1;
  dir: 'advance' | 'undo';
}

interface CardDeckProps {
  card: CardItem;
  nextCard: CardItem | null;
  remainingCount: number;
  lang: Language;
  canUndo: boolean;
  isFavorite: boolean;
  transitionMeta: CardTransitionMeta;
  stackMap?: Record<StackId, StackMeta>;
  onAdvance: (vote: -1 | 0 | 1) => void;
  onUndo: () => void;
  onToggleFavorite: () => void;
}

const SWIPE_THRESHOLD = 75;
const VELOCITY_THRESHOLD = 360;
const SOFT_EASE = [0.22, 1, 0.36, 1] as const;

const CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 28,
  mass: 0.88,
};

const BUTTON_SPRING = {
  type: 'spring' as const,
  stiffness: 440,
  damping: 26,
};

interface BacksideEmbossPreset {
  positionClass: string;
  opacityClass: string;
  rotate: number;
  driftX: number;
  driftY: number;
}

const BACKSIDE_EMBOSS_PRESETS: readonly BacksideEmbossPreset[] = [
  {
    positionClass: '-left-24 -top-24 sm:-left-28 sm:-top-28 w-[min(74vw,330px)] h-[min(74vw,330px)]',
    opacityClass: 'opacity-[0.72]',
    rotate: -8,
    driftX: 8,
    driftY: 6,
  },
  {
    positionClass:
      '-right-24 -bottom-24 sm:-right-28 sm:-bottom-28 w-[min(78vw,360px)] h-[min(78vw,360px)]',
    opacityClass: 'opacity-[0.70]',
    rotate: 12,
    driftX: -8,
    driftY: -6,
  },
  {
    positionClass: '-right-20 -top-28 sm:-right-24 sm:-top-32 w-[min(68vw,300px)] h-[min(68vw,300px)]',
    opacityClass: 'opacity-[0.68]',
    rotate: 20,
    driftX: -7,
    driftY: 7,
  },
  {
    positionClass:
      '-left-20 -bottom-28 sm:-left-24 sm:-bottom-32 w-[min(82vw,390px)] h-[min(82vw,390px)]',
    opacityClass: 'opacity-[0.66]',
    rotate: -16,
    driftX: 7,
    driftY: -7,
  },
  {
    positionClass: '-bottom-44 left-1/2 -translate-x-1/2 w-[min(90vw,420px)] h-[min(90vw,420px)]',
    opacityClass: 'opacity-[0.62]',
    rotate: 4,
    driftX: 6,
    driftY: -5,
  },
  {
    positionClass: '-right-32 top-1/2 -translate-y-1/2 w-[min(72vw,320px)] h-[min(72vw,320px)]',
    opacityClass: 'opacity-[0.68]',
    rotate: -10,
    driftX: -6,
    driftY: 6,
  },
];

function getBacksideEmbossPreset(cardId: string): BacksideEmbossPreset {
  let hash = 0;
  for (let i = 0; i < cardId.length; i += 1) {
    hash = (hash * 31 + cardId.charCodeAt(i)) >>> 0;
  }
  return BACKSIDE_EMBOSS_PRESETS[hash % BACKSIDE_EMBOSS_PRESETS.length];
}

const cardVariants = {
  enter: (meta?: CardTransitionMeta) =>
    meta?.dir === 'undo'
      ? { opacity: 0, y: -24, scale: 0.985, x: 0 }
      : { opacity: 0, y: 12, scale: 0.962, x: 0 },
  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    x: 0,
    transition: CARD_SPRING,
  },
  exit: (meta?: CardTransitionMeta) => {
    if (meta?.dir === 'undo') {
      return {
        opacity: 0,
        y: 26,
        scale: 0.96,
        transition: { duration: 0.2, ease: SOFT_EASE },
      };
    }
    if (meta?.vote === -1) {
      return {
        x: -460,
        rotate: -15,
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.24, ease: SOFT_EASE },
      };
    }
    if (meta?.vote === 1) {
      return {
        x: 460,
        rotate: 15,
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.24, ease: SOFT_EASE },
      };
    }
    return {
      y: -44,
      scale: 0.955,
      opacity: 0,
      transition: { duration: 0.22, ease: SOFT_EASE },
    };
  },
};

interface DraggableCardFaceProps {
  card: CardItem;
  lang: Language;
  dragX: MotionValue<number>;
  dragDist: MotionValue<number>;
  wheelCooldownUntilRef: React.MutableRefObject<number>;
  transitionMeta: CardTransitionMeta;
  onSwipeAdvance: (vote: -1 | 1) => void;
  ref?: React.Ref<HTMLDivElement>;
}

const DraggableCardFace: React.FC<DraggableCardFaceProps> = ({
  card,
  lang,
  dragX,
  dragDist,
  wheelCooldownUntilRef,
  transitionMeta,
  onSwipeAdvance,
  ref,
}) => {
  const [digCount, setDigCount] = useState(0);
  const [isPresent] = usePresence();
  const hasSwipedRef = useRef(false);
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const onSwipeAdvanceRef = useRef(onSwipeAdvance);
  onSwipeAdvanceRef.current = onSwipeAdvance;

  const setCardRef = (node: HTMLDivElement | null) => {
    cardElRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      (ref as { current: HTMLDivElement | null }).current = node;
    }
  };

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-10.5, 0, 10.5]);
  const leftBadgeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -16, 0], [1, 0, 0]);
  const leftBadgeScale = useTransform(x, [-SWIPE_THRESHOLD, -16, 0], [1, 0.86, 0.86]);
  const rightBadgeOpacity = useTransform(x, [0, 16, SWIPE_THRESHOLD], [0, 0, 1]);
  const rightBadgeScale = useTransform(x, [0, 16, SWIPE_THRESHOLD], [0.86, 0.86, 1]);

  useEffect(() => {
    const unsubscribe = x.on('change', (latest) => {
      if (isPresent && !hasSwipedRef.current) {
        dragX.set(latest);
        dragDist.set(Math.abs(latest));
      }
    });
    return unsubscribe;
  }, [x, dragX, dragDist, isPresent]);

  // Direct horizontal two-finger trackpad wheel swipe support
  useEffect(() => {
    const el = cardElRef.current;
    if (!el || !isPresent) return;

    let snapTimer: number | null = null;
    const clearSnapTimer = () => {
      if (snapTimer !== null) {
        window.clearTimeout(snapTimer);
        snapTimer = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (hasSwipedRef.current) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.35 || Math.abs(e.deltaX) < 3) {
        return;
      }
      e.preventDefault();
      if (Date.now() < wheelCooldownUntilRef.current) return;

      clearSnapTimer();
      const next = Math.max(-220, Math.min(220, x.get() - e.deltaX * 0.7));
      x.set(next);

      if (next <= -SWIPE_THRESHOLD) {
        hasSwipedRef.current = true;
        wheelCooldownUntilRef.current = Date.now() + 550;
        dragX.set(0);
        animate(dragDist, 0, { duration: 0.22, ease: SOFT_EASE });
        onSwipeAdvanceRef.current(-1);
        return;
      }

      if (next >= SWIPE_THRESHOLD) {
        hasSwipedRef.current = true;
        wheelCooldownUntilRef.current = Date.now() + 550;
        dragX.set(0);
        animate(dragDist, 0, { duration: 0.22, ease: SOFT_EASE });
        onSwipeAdvanceRef.current(1);
        return;
      }

      snapTimer = window.setTimeout(() => {
        if (!hasSwipedRef.current) {
          animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 });
          animate(dragX, 0, { duration: 0.2, ease: SOFT_EASE });
          animate(dragDist, 0, { duration: 0.2, ease: SOFT_EASE });
        }
      }, 160);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      clearSnapTimer();
      el.removeEventListener('wheel', handleWheel);
    };
  }, [isPresent, x, dragX, dragDist, wheelCooldownUntilRef]);

  const isWildcard = card.kind === 'wildcard';
  const isQuote = card.kind === 'quote';
  const embossPreset = getBacksideEmbossPreset(card.id);
  const activeText = lang === 'de' ? card.de : card.en;
  const isLongText = isQuote ? activeText.length > 220 : activeText.length > 130;

  const sourceUrl = lang === 'de' ? card.sourceUrlDe : card.sourceUrlEn;
  const sourceLabel = lang === 'de' ? card.sourceLabelDe : card.sourceLabelEn;
  const quotePrompt = lang === 'de' ? card.promptDe : card.promptEn;
  const followUp = pickDigDeeper(card.stackId, digCount - 1);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (hasSwipedRef.current) return;

    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) {
      hasSwipedRef.current = true;
      dragX.set(0);
      animate(dragDist, 0, { duration: 0.22, ease: SOFT_EASE });
      onSwipeAdvance(1);
      return;
    }

    if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) {
      hasSwipedRef.current = true;
      dragX.set(0);
      animate(dragDist, 0, { duration: 0.22, ease: SOFT_EASE });
      onSwipeAdvance(-1);
      return;
    }

    animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 });
    animate(dragX, 0, { duration: 0.2, ease: SOFT_EASE });
    animate(dragDist, 0, { type: 'spring', stiffness: 420, damping: 30 });
  };

  return (
    <motion.div
      ref={setCardRef}
      custom={transitionMeta}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag={isPresent ? 'x' : false}
      dragMomentum={false}
      dragDirectionLock
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1.01 }}
      style={{
        x,
        rotate,
        touchAction: 'pan-y',
        border: `1px solid ${isWildcard ? 'var(--gold-border)' : 'var(--deck-edge-border-strong)'}`,
        boxShadow: 'var(--shadow-card)',
        zIndex: isPresent ? 10 : 20,
      }}
      className="relative noble-bezel p-1.5 rounded-[28px] cursor-grab active:cursor-grabbing will-change-transform"
    >
      {/* Prominent Swipe Left (Thumbs Down) & Swipe Right (Thumbs Up) Pill Stamps */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute top-6 right-6 z-20 px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-medium tracking-wide backdrop-blur-md"
        style={{
          opacity: leftBadgeOpacity,
          scale: leftBadgeScale,
          backgroundColor: 'var(--danger-soft)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
        }}
      >
        <ThumbDownIcon size={14} />
        <span>{lang === 'de' ? 'Nicht passend' : 'Thumbs down'}</span>
      </motion.span>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute top-6 left-6 z-20 px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-medium tracking-wide backdrop-blur-md"
        style={{
          opacity: rightBadgeOpacity,
          scale: rightBadgeScale,
          backgroundColor: 'var(--accent-soft)',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
        }}
      >
        <ThumbUpIcon size={14} />
        <span>{lang === 'de' ? 'Gefällt uns' : 'Thumbs up'}</span>
      </motion.span>

      {/* Inner Design 02 Cotton Cardstock with Subtle Drifting Embossed Crest Behind Outline */}
      <div
        className="noble-card relative overflow-hidden rounded-[22px] px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.4dvh,2.75rem)] min-h-[clamp(270px,45dvh,440px)] md:min-h-[clamp(300px,52dvh,540px)] grid grid-rows-[1fr_auto_1fr] items-center"
      >
        {/* Subtle Varied & Gently Drifting Embossed Crest Behind Inset Frame */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-0 ${embossPreset.positionClass} ${embossPreset.opacityClass}`}
        >
          <motion.div
            className="w-full h-full"
            initial={{ rotate: embossPreset.rotate, scale: 1, x: 0, y: 0 }}
            animate={{
              x: [0, embossPreset.driftX, 0],
              y: [0, embossPreset.driftY, 0],
              scale: [1, 1.035, 1],
              rotate: [embossPreset.rotate, embossPreset.rotate + 3, embossPreset.rotate],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          >
            <EmbossedNonagonPaper goldInnerRing={isWildcard} className="w-full h-full" />
          </motion.div>
        </div>

        {/* 02 Inset Letterpress Hairline Frame Above Emboss */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 sm:inset-3.5 z-[1] rounded-[15px] border"
          style={{ borderColor: 'var(--gold-hairline)' }}
        />

        {/* Serene Top Crown so Upper Embossed Ridges Breathe */}
        <div aria-hidden="true" className="h-4 sm:h-6" />

        {/* Main Centered Content */}
        <div className="relative z-10 text-center space-y-5">
          {isQuote ? (
            <>
              <blockquote
                className={`font-serif-card font-medium italic text-balance ${
                  isLongText
                    ? 'text-[clamp(1.08rem,1.9vw,1.62rem)] leading-[1.45] max-w-[46ch]'
                    : 'text-[clamp(1.32rem,2.6vw,2.3rem)] leading-[1.38] max-w-[36ch]'
                } mx-auto m-0`}
                style={{ color: 'var(--ink)' }}
              >
                {activeText}
              </blockquote>

              {card.author && (
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:text-sm pt-1">
                  <span className="font-medium" style={{ color: 'var(--gold)' }}>
                    {card.author}
                  </span>
                  {sourceUrl && sourceLabel && (
                    <>
                      <span style={{ color: 'var(--ink-muted)' }}>·</span>
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onPointerDown={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:opacity-80"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        <span>{sourceLabel}</span>
                        <ExternalLinkIcon size={12} />
                      </a>
                    </>
                  )}
                  {!sourceUrl && sourceLabel && (
                    <>
                      <span style={{ color: 'var(--ink-muted)' }}>·</span>
                      <span style={{ color: 'var(--ink-muted)' }}>{sourceLabel}</span>
                    </>
                  )}
                </div>
              )}

              {quotePrompt && (
                <div
                  className="pt-4 mt-4 border-t text-[clamp(0.95rem,1.35vw,1.18rem)] max-w-[48ch] mx-auto leading-relaxed text-pretty"
                  style={{ borderColor: 'var(--gold-hairline)', color: 'var(--ink)' }}
                >
                  <span
                    className="block text-[11px] font-medium mb-1.5"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {lang === 'de' ? 'Gesprächsimpuls' : 'Reflect together'}
                  </span>
                  {quotePrompt}
                </div>
              )}
            </>
          ) : (
            <p
              className={`font-serif-card font-medium text-balance ${
                isLongText
                  ? 'text-[clamp(1.32rem,2.55vw,2.2rem)] leading-[1.36] max-w-[38ch]'
                  : 'text-[clamp(1.65rem,3.6vw,3.1rem)] leading-[1.28] max-w-[30ch]'
              } mx-auto tracking-[-0.01em] m-0`}
              style={{ color: 'var(--ink)' }}
            >
              {activeText}
            </p>
          )}

          {/* Smooth Accordion Dig Deeper Layer */}
          <AnimatePresence initial={false}>
            {digCount > 0 && (
              <motion.div
                key="dig-deeper-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  height: { type: 'spring', stiffness: 320, damping: 32 },
                  opacity: { duration: 0.2 },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  className="pt-4 mt-4 border-t text-[clamp(0.95rem,1.35vw,1.18rem)] max-w-[48ch] mx-auto leading-relaxed text-pretty"
                  style={{ borderColor: 'var(--gold-hairline)', color: 'var(--ink-muted)' }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={digCount}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: SOFT_EASE }}
                      className="block"
                    >
                      {lang === 'de' ? followUp.de : followUp.en}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Hairline Rule + Quiet Dig Deeper Anchor (No Stack Icon on Backside) */}
        <div className="relative z-10 self-end pt-4 flex flex-col items-center gap-2">
          <div
            aria-hidden="true"
            className="w-7 h-px"
            style={{ backgroundColor: 'var(--gold-border)' }}
          />

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={BUTTON_SPRING}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setDigCount((c) => c + 1)}
            className="text-[11px] sm:text-xs uppercase tracking-[0.2em] font-medium pt-0.5 cursor-pointer transition-opacity hover:opacity-80"
            style={{ color: 'var(--gold)' }}
          >
            {digCount === 0
              ? lang === 'de'
                ? 'Tiefer gehen'
                : 'Dig deeper'
              : lang === 'de'
                ? 'Noch tiefer'
                : 'Another layer'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

interface NextCardUnderlayProps {
  card: CardItem;
  lang: Language;
  dragDist: MotionValue<number>;
}

const NextCardUnderlay: React.FC<NextCardUnderlayProps> = ({ card, lang, dragDist }) => {
  const scale = useTransform(dragDist, [0, 140], [0.96, 0.996]);
  const y = useTransform(dragDist, [0, 140], [6, 0]);
  const opacity = useTransform(dragDist, [0, 140], [0.35, 0.92]);

  const isWildcard = card.kind === 'wildcard';
  const embossPreset = getBacksideEmbossPreset(card.id);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none noble-bezel absolute inset-0 z-0 p-1.5 rounded-[28px] overflow-hidden"
      style={{
        scale,
        y,
        opacity,
        border: `1px solid ${isWildcard ? 'var(--gold-border)' : 'var(--deck-edge-border)'}`,
      }}
    >
      <div
        className="noble-card relative h-full overflow-hidden rounded-[22px] px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(1.25rem,3.4dvh,2.75rem)] min-h-[clamp(270px,45dvh,440px)] md:min-h-[clamp(300px,52dvh,540px)] grid grid-rows-[1fr_auto_1fr] items-center"
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-0 ${embossPreset.positionClass} ${embossPreset.opacityClass}`}
        >
          <div className="w-full h-full" style={{ transform: `rotate(${embossPreset.rotate}deg)` }}>
            <EmbossedNonagonPaper goldInnerRing={isWildcard} className="w-full h-full" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 sm:inset-3.5 z-[1] rounded-[15px] border"
          style={{ borderColor: 'var(--gold-hairline)' }}
        />
        <div aria-hidden="true" className="h-4 sm:h-6" />
        <p
          className="relative z-10 text-center font-serif-card font-medium text-[clamp(1.4rem,2.8vw,2.4rem)] leading-[1.32] max-w-[32ch] mx-auto line-clamp-4 m-0 opacity-75"
          style={{ color: 'var(--ink)' }}
        >
          {lang === 'de' ? card.de : card.en}
        </p>
        <div className="pointer-events-none self-end pt-4 pb-6 flex justify-center opacity-60">
          <div
            aria-hidden="true"
            className="w-7 h-px"
            style={{ backgroundColor: 'var(--gold-border)' }}
          />
        </div>
      </div>
    </motion.div>
  );
};

export const CardDeck: React.FC<CardDeckProps> = ({
  card,
  nextCard,
  remainingCount,
  lang,
  canUndo,
  isFavorite,
  transitionMeta,
  stackMap = STACK_MAP,
  onAdvance,
  onUndo,
  onToggleFavorite,
}) => {
  const dragX = useMotionValue(0);
  const dragDist = useMotionValue(0);
  const wheelCooldownUntilRef = useRef<number>(0);
  const topLayer1Scale = useTransform(dragDist, [0, 140], [0.985, 1]);
  const topLayer2Scale = useTransform(dragDist, [0, 140], [0.96, 0.98]);
  const topLayer3Scale = useTransform(dragDist, [0, 140], [0.94, 0.96]);
  const downHintScale = useTransform(dragX, [-SWIPE_THRESHOLD, -16, 0], [1.14, 1, 1]);
  const downHintGlow = useTransform(dragX, [-SWIPE_THRESHOLD, -16, 0], [1, 0, 0]);
  const upHintScale = useTransform(dragX, [0, 16, SWIPE_THRESHOLD], [1, 1, 1.14]);
  const upHintGlow = useTransform(dragX, [0, 16, SWIPE_THRESHOLD], [0, 0, 1]);

  const stack = getStackMetaSafe(stackMap, card.stackId);
  const isWildcard = card.kind === 'wildcard';
  const accentColor = isWildcard ? WILDCARD_ACCENT : stack.accent;

  const stackLabel = isWildcard
    ? lang === 'de'
      ? 'Impuls'
      : 'Moment'
    : lang === 'de'
      ? stack.nameDe
      : stack.nameEn;

  // Reset drag feedback immediately if an external trigger (button or keyboard) advances/undoes
  useEffect(() => {
    animate(dragX, 0, { duration: 0.2, ease: SOFT_EASE });
    animate(dragDist, 0, { duration: 0.2, ease: SOFT_EASE });
  }, [card.id, dragX, dragDist]);

  // Up to 3 visible physical stack layers beneath the active card
  const backLayerCount = Math.min(3, Math.max(0, remainingCount - 1));

  return (
    <div className="w-full max-w-[min(95vw,1040px)] mx-auto flex flex-col items-center">
      {/* Quiet Meta Bar above the Stack */}
      <div className="w-full flex items-center justify-between px-1 mb-2 sm:mb-2.5 min-h-[26px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${card.id}-meta`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: SOFT_EASE }}
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--ink-muted)' }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <span className="font-medium" style={{ color: 'var(--ink)' }}>
              {stackLabel}
            </span>
            {card.ruhiChapter && (
              <span style={{ color: 'var(--ink-soft)' }}>
                · {lang === 'de' ? `Kap. ${card.ruhiChapter}` : `Ch. ${card.ruhiChapter}`}
              </span>
            )}
            {card.fromGroup && (
              <span
                className="px-2 py-0.5 rounded-full text-[11px]"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {card.contributedBy
                  ? `${card.contributedBy}`
                  : lang === 'de'
                    ? 'Aus der Runde'
                    : 'From the group'}
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-1.5">
          {canUndo && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              transition={BUTTON_SPRING}
              onClick={onUndo}
              aria-label={lang === 'de' ? 'Zurück' : 'Undo'}
              title={lang === 'de' ? 'Vorherige Karte' : 'Previous card'}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--elevated)] cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              <UndoIcon size={14} />
            </motion.button>
          )}
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.88 }}
            transition={BUTTON_SPRING}
            onClick={onToggleFavorite}
            aria-label={lang === 'de' ? 'Karte merken' : 'Save card'}
            title={lang === 'de' ? 'Karte merken' : 'Save card'}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--elevated)] cursor-pointer"
            style={{ color: isFavorite ? 'var(--gold)' : 'var(--ink-muted)' }}
          >
            <BookmarkIcon size={15} filled={isFavorite} />
          </motion.button>
        </div>
      </div>

      {/* Physical 3-Layer Sculpted Card Stack */}
      <div className="relative w-full pb-3 sm:pb-3.5 select-none touch-pan-y">
        {/* Layer 3 (deepest) */}
        {backLayerCount >= 3 && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none mx-10 sm:mx-16 h-3.5 sm:h-4 -mb-2.5 rounded-t-[20px]"
            style={{
              backgroundColor: 'var(--deck-edge-2)',
              border: '1px solid var(--deck-edge-border)',
              borderBottom: 'none',
              opacity: 0.72,
              scale: topLayer3Scale,
            }}
          />
        )}

        {/* Layer 2 */}
        {backLayerCount >= 2 && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none mx-6 sm:mx-10 h-3.5 sm:h-4 -mb-2.5 rounded-t-[22px]"
            style={{
              backgroundColor: 'var(--deck-edge-2)',
              border: '1px solid var(--deck-edge-border)',
              borderBottom: 'none',
              opacity: 0.86,
              scale: topLayer2Scale,
            }}
          />
        )}

        {/* Layer 1 (card immediately beneath) */}
        {backLayerCount >= 1 && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none mx-3 sm:mx-5 h-3.5 sm:h-4 -mb-2.5 rounded-t-[26px]"
            style={{
              backgroundColor: 'var(--deck-edge-1)',
              border: '1px solid var(--deck-edge-border-strong)',
              borderBottom: 'none',
              opacity: 0.96,
              scale: topLayer1Scale,
            }}
          />
        )}

        {/* Interactive Card Surface + Real Next-Card Underlay */}
        <div className="relative">
          {nextCard && (
            <NextCardUnderlay card={nextCard} lang={lang} dragDist={dragDist} />
          )}

          <AnimatePresence mode="popLayout" initial={false} custom={transitionMeta}>
            <DraggableCardFace
              key={card.id}
              card={card}
              lang={lang}
              dragX={dragX}
              dragDist={dragDist}
              wheelCooldownUntilRef={wheelCooldownUntilRef}
              transitionMeta={transitionMeta}
              onSwipeAdvance={(vote) => onAdvance(vote)}
            />
          </AnimatePresence>
        </div>

        {/* Bottom 3-Layer Physical Stack Thickness */}
        {backLayerCount >= 1 && (
          <div
            aria-hidden="true"
            className="pointer-events-none mx-3.5 sm:mx-6 h-2.5 sm:h-3 -mt-1 rounded-b-[22px] transition-opacity duration-200"
            style={{
              backgroundColor: 'var(--deck-edge-1)',
              border: '1px solid var(--deck-edge-border-strong)',
              borderTop: 'none',
              opacity: 0.92,
            }}
          />
        )}
        {backLayerCount >= 2 && (
          <div
            aria-hidden="true"
            className="pointer-events-none mx-7 sm:mx-12 h-2 sm:h-2.5 -mt-0.5 rounded-b-[20px] transition-opacity duration-200"
            style={{
              backgroundColor: 'var(--deck-edge-2)',
              border: '1px solid var(--deck-edge-border)',
              borderTop: 'none',
              opacity: 0.78,
            }}
          />
        )}
        {backLayerCount >= 3 && (
          <div
            aria-hidden="true"
            className="pointer-events-none mx-11 sm:mx-18 h-1.5 sm:h-2 -mt-0.5 rounded-b-[18px] transition-opacity duration-200"
            style={{
              backgroundColor: 'var(--deck-edge-2)',
              border: '1px solid var(--deck-edge-border)',
              borderTop: 'none',
              opacity: 0.62,
            }}
          />
        )}
      </div>

      {/* Rounded Pill 3-Part Vote-to-Advance Dock */}
      <div className="pt-1.5 sm:pt-2 flex flex-col items-center gap-1.5">
        <div
          className="inline-flex items-center p-1.5 sm:p-2 rounded-full gap-1.5 sm:gap-2"
          style={{
            backgroundColor: 'var(--subtle)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-stack)',
          }}
        >
          <motion.div style={{ scale: downHintScale }}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={BUTTON_SPRING}
              onClick={() => onAdvance(-1)}
              aria-label={lang === 'de' ? 'Nicht passend, nächste Karte' : 'Not for us, next card'}
              title={lang === 'de' ? 'Daumen runter & nächste' : 'Thumbs down & next'}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--elevated)] cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full flex items-center justify-center"
                style={{
                  opacity: downHintGlow,
                  backgroundColor: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  border: '1.5px solid var(--danger)',
                }}
              >
                <ThumbDownIcon size={18} />
              </motion.span>
              <ThumbDownIcon size={18} />
            </motion.button>
          </motion.div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={BUTTON_SPRING}
            onClick={() => onAdvance(0)}
            aria-label={lang === 'de' ? 'Nächste Karte ohne Bewertung' : 'Next card without voting'}
            className="h-11 sm:h-12 px-7 sm:px-9 rounded-full inline-flex items-center gap-1.5 text-sm sm:text-[15px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
            style={{
              backgroundColor: 'var(--elevated)',
              color: 'var(--ink)',
            }}
          >
            <span>{lang === 'de' ? 'Weiter' : 'Next'}</span>
            <ChevronRightIcon size={16} />
          </motion.button>

          <motion.div style={{ scale: upHintScale }}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={BUTTON_SPRING}
              onClick={() => onAdvance(1)}
              aria-label={lang === 'de' ? 'Gute Frage, nächste Karte' : 'Resonated, next card'}
              title={lang === 'de' ? 'Daumen hoch & nächste' : 'Thumbs up & next'}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  opacity: upHintGlow,
                  boxShadow: '0 0 0 3px var(--accent-soft), 0 0 0 1.5px var(--accent)',
                }}
              />
              <ThumbUpIcon size={18} />
            </motion.button>
          </motion.div>
        </div>

        <span
          className="text-[11px] tabular-nums truncate max-w-full text-center"
          style={{ color: 'var(--ink-soft)' }}
        >
          {remainingCount}{' '}
          {remainingCount === 1
            ? lang === 'de'
              ? 'Karte übrig'
              : 'card left'
            : lang === 'de'
              ? 'Karten übrig'
              : 'cards left'}{' '}
          · {lang === 'de' ? 'Links / rechts wischen' : 'Swipe left / right to rate'}
        </span>
      </div>
    </div>
  );
};
