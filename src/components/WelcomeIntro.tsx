import React from 'react';
import { motion } from 'motion/react';
import { useResonance } from '../context/ResonanceContext';
import {
  ChevronRightIcon,
  ConcentricLogo,
  NonagonFiligree,
  QrIcon,
  StacksIcon,
  ThumbUpIcon,
} from './Icons';

const INTRO_SPRING = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 30,
};

export const WelcomeIntro: React.FC = () => {
  const { lang, toggleLang, dismissIntro, startPlay } = useResonance();
  const isDe = lang === 'de';

  const steps = isDe
    ? [
        {
          icon: <StacksIcon size={17} />,
          title: 'Stapel wählen oder mischen',
          body: 'Folge der Abend-Reise von leichten Fragen in die Tiefe oder stelle eigene Stapel zusammen.',
        },
        {
          icon: <ThumbUpIcon size={17} />,
          title: 'Wischen, weitergehen, vertiefen',
          body: 'Daumen hoch oder runter stimmt ab und zieht direkt die nächste Karte. „Tiefer gehen“ öffnet einen Anschlussimpuls.',
        },
        {
          icon: <QrIcon size={17} />,
          title: 'Fragen aus der Runde sammeln',
          body: 'Über den QR-Code können Freundinnen und Freunde anonym eigene Fragen direkt in euren Stapel werfen.',
        },
      ]
    : [
        {
          icon: <StacksIcon size={17} />,
          title: 'Pick or mix stacks',
          body: 'Follow the Guided Journey from easy openers to deeper prompts, or combine stacks of your own.',
        },
        {
          icon: <ThumbUpIcon size={17} />,
          title: 'Swipe or tap to flow',
          body: 'Vote thumbs up or down to draw the next card right away, or tap Dig deeper when a topic opens up.',
        },
        {
          icon: <QrIcon size={17} />,
          title: 'Invite the room',
          body: 'Share a Group QR code so friends can quietly drop anonymous questions straight into tonight’s pile.',
        },
      ];

  const handleStartJourney = () => {
    dismissIntro();
    startPlay({ type: 'journey' });
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={isDe ? 'Einführung in Resonance' : 'Welcome to Resonance'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
      onClick={dismissIntro}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={INTRO_SPRING}
        className="w-full max-w-xl p-1.5 rounded-[30px]"
        style={{
          backgroundColor: 'var(--subtle)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="cardstock relative overflow-hidden rounded-[24px] p-6 sm:p-8 space-y-6"
          style={{
            backgroundImage:
              'radial-gradient(circle at 88% 12%, var(--gold-soft) 0%, transparent 56%)',
          }}
        >
          {/* Delicate antique-gold inner stationery frame */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 rounded-[18px]"
            style={{ border: '1px solid var(--gold-hairline)' }}
          />
          {/* Architectural 9-gon logo filigree */}
          <NonagonFiligree
            showCore
            className="pointer-events-none absolute -right-14 -top-14 w-56 h-56 opacity-[0.10]"
          />

          {/* Top Bar: Logo + Live Language Switcher */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ConcentricLogo size={44} />
              <div>
                <span
                  className="block text-[11px] font-medium tracking-wider uppercase"
                  style={{ color: 'var(--accent)' }}
                >
                  Resonance
                </span>
                <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  {isDe ? 'Zweisprachige Gesprächskarten' : 'Bilingual conversation cards'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleLang}
              aria-label={isDe ? 'Switch to English' : 'Auf Deutsch wechseln'}
              className="h-8 px-3 rounded-full text-xs font-semibold tracking-wide transition-opacity hover:opacity-85 cursor-pointer"
              style={{
                backgroundColor: 'var(--elevated)',
                color: 'var(--ink)',
                border: '1px solid var(--border-strong)',
              }}
            >
              {lang.toUpperCase()}
            </button>
          </div>

          {/* Editorial Headline & Intro Sentence */}
          <div className="relative z-10 space-y-2">
            <h2 className="font-serif-card text-[clamp(1.6rem,3vw,2.15rem)] font-medium leading-[1.15] tracking-[-0.015em] text-balance m-0">
              {isDe ? 'Gespräche, die bleiben.' : 'Conversations that linger.'}
            </h2>
            <p
              className="text-sm sm:text-[15px] leading-relaxed text-pretty m-0"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe
                ? 'Kuratierte Fragen, nachdenkliche Zitate und gemeinsame Runden – für Abende am Tisch, zu zweit oder im Freundeskreis.'
                : 'Curated questions, thoughtful passages, and shared piles—made for unhurried evenings around a table.'}
            </p>
          </div>

          {/* Three Compact Scannable Guide Steps */}
          <div className="relative z-10 space-y-3 pt-1">
            {steps.map((step) => (
              <div
                key={step.title}
                className="flex items-start gap-3.5 rounded-2xl p-3"
                style={{
                  backgroundColor: 'var(--subtle)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  {step.icon}
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {step.title}
                  </div>
                  <p
                    className="text-xs leading-relaxed text-pretty m-0"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Primary & Secondary Actions */}
          <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={dismissIntro}
              className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-colors hover:opacity-85 cursor-pointer"
              style={{
                backgroundColor: 'var(--elevated)',
                color: 'var(--ink)',
              }}
            >
              {isDe ? 'Stapel ansehen' : 'Browse stacks'}
            </button>
            <button
              type="button"
              onClick={handleStartJourney}
              className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              <span>{isDe ? 'Abend-Reise starten' : 'Start Guided Journey'}</span>
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
