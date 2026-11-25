import React from 'react';
import type { JourneyLength, Language } from '../types/deck';

interface JourneyLengthSliderProps {
  value: JourneyLength;
  onChange: (next: JourneyLength) => void;
  totalAvailable?: number;
  lang: Language;
  compact?: boolean;
}

const MIN_COUNT = 10;
const MAX_NUMERIC = 60;
const ALL_SENTINEL = 65;
const STEP = 5;

export const JourneyLengthSlider: React.FC<JourneyLengthSliderProps> = ({
  value,
  onChange,
  totalAvailable,
  lang,
  compact = false,
}) => {
  const isDe = lang === 'de';
  const numericVal =
    value === 'all'
      ? ALL_SENTINEL
      : Math.max(MIN_COUNT, Math.min(MAX_NUMERIC, Math.round(value / STEP) * STEP));
  const pct = ((numericVal - MIN_COUNT) / (ALL_SENTINEL - MIN_COUNT)) * 100;

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    onChange(n >= ALL_SENTINEL ? 'all' : n);
  };

  const countLabel =
    value === 'all'
      ? totalAvailable
        ? isDe
          ? `Alle (${totalAvailable})`
          : `All (${totalAvailable})`
        : isDe
          ? 'Alle'
          : 'All'
      : isDe
        ? `~${numericVal} Fragen`
        : `~${numericVal} questions`;

  const quickStops: { val: JourneyLength; label: string }[] = [
    { val: 15, label: '15' },
    { val: 25, label: '25' },
    { val: 40, label: '40' },
    { val: 'all', label: isDe ? 'Alle' : 'All' },
  ];

  if (compact) {
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full min-w-[205px] sm:min-w-[245px]"
        style={{
          backgroundColor: 'var(--subtle)',
          border: '1px solid var(--border)',
        }}
        onClick={stop}
        onPointerDown={stop}
      >
        <input
          type="range"
          min={MIN_COUNT}
          max={ALL_SENTINEL}
          step={STEP}
          value={numericVal}
          onChange={handleRangeChange}
          aria-label={isDe ? 'Ungefähre Fragenanzahl' : 'Approximate question count'}
          className="resonance-slider flex-1"
          style={{
            background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${pct}%, var(--border-strong) ${pct}%, var(--border-strong) 100%)`,
          }}
        />
        <span
          className="text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0"
          style={{ color: 'var(--gold)' }}
        >
          {value === 'all' ? (isDe ? 'Alle' : 'All') : `~${numericVal}`}
        </span>
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-1.5"
      onClick={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={stop}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span style={{ color: 'var(--ink-muted)' }}>
          {isDe ? 'Rundenlänge' : 'Session length'}
        </span>
        <span
          className="font-semibold tabular-nums px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'var(--gold-soft)',
            color: 'var(--gold)',
          }}
        >
          {countLabel}
        </span>
      </div>

      <input
        type="range"
        min={MIN_COUNT}
        max={ALL_SENTINEL}
        step={STEP}
        value={numericVal}
        onChange={handleRangeChange}
        aria-label={isDe ? 'Ungefähre Fragenanzahl' : 'Approximate question count'}
        className="resonance-slider block"
        style={{
          background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${pct}%, var(--border-strong) ${pct}%, var(--border-strong) 100%)`,
        }}
      />

      <div className="flex items-center justify-between text-[10px] pt-0.5">
        {quickStops.map((s) => {
          const active = value === s.val;
          return (
            <button
              key={String(s.val)}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(s.val);
              }}
              className="px-1.5 py-0.5 rounded-full tabular-nums font-medium transition-colors cursor-pointer hover:opacity-90"
              style={{
                color: active ? 'var(--gold)' : 'var(--ink-soft)',
                backgroundColor: active ? 'var(--gold-soft)' : 'transparent',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
