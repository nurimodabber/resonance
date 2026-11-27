import React, { useEffect, useRef, useState } from 'react';
import type { JourneyLength, Language } from '../types/deck';

interface JourneyLengthSliderProps {
  value: JourneyLength;
  onChange: (next: JourneyLength) => void;
  totalAvailable?: number;
  lang: Language;
  compact?: boolean;
  commitOnRelease?: boolean;
}

const MIN_COUNT = 10;
const MAX_NUMERIC = 60;
const ALL_SENTINEL = 65;
const STEP = 5;

function toNumericLength(val: JourneyLength): number {
  return val === 'all'
    ? ALL_SENTINEL
    : Math.max(MIN_COUNT, Math.min(MAX_NUMERIC, Math.round(val / STEP) * STEP));
}

function fromNumericLength(n: number): JourneyLength {
  return n >= ALL_SENTINEL ? 'all' : n;
}

export const JourneyLengthSlider: React.FC<JourneyLengthSliderProps> = ({
  value,
  onChange,
  totalAvailable,
  lang,
  compact = false,
  commitOnRelease = false,
}) => {
  const isDe = lang === 'de';
  const [draftVal, setDraftVal] = useState<JourneyLength>(value);
  const draggingRef = useRef(false);
  const latestDraftRef = useRef<JourneyLength>(value);
  const valueRef = useRef<JourneyLength>(value);
  const onChangeRef = useRef(onChange);

  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!draggingRef.current) {
      setDraftVal(value);
      latestDraftRef.current = value;
    }
  }, [value]);

  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  const displayValue = commitOnRelease ? draftVal : value;
  const numericVal = toNumericLength(displayValue);
  const pct = ((numericVal - MIN_COUNT) / (ALL_SENTINEL - MIN_COUNT)) * 100;

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (!commitOnRelease) return;

    cleanupDragRef.current?.();
    draggingRef.current = true;

    const finishDrag = () => {
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      cleanupDragRef.current = null;
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (latestDraftRef.current !== valueRef.current) {
        onChangeRef.current(latestDraftRef.current);
      }
    };

    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    cleanupDragRef.current = () => {
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      draggingRef.current = false;
    };
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = fromNumericLength(Number(e.target.value));
    setDraftVal(next);
    latestDraftRef.current = next;
    if (!commitOnRelease || !draggingRef.current) {
      onChange(next);
    }
  };

  const countLabel =
    displayValue === 'all'
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

  const renderSliderTrack = () => (
    <div className="relative flex items-center h-6 flex-1 min-w-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full"
        style={{
          background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${pct}%, var(--border-strong) ${pct}%, var(--border-strong) 100%)`,
        }}
      />
      <input
        type="range"
        min={MIN_COUNT}
        max={ALL_SENTINEL}
        step={STEP}
        value={numericVal}
        onPointerDown={handlePointerDown}
        onChange={handleRangeChange}
        aria-label={isDe ? 'Ungefähre Fragenanzahl' : 'Approximate question count'}
        className="resonance-slider relative z-10 w-full h-6 m-0 bg-transparent touch-none cursor-pointer"
      />
    </div>
  );

  if (compact) {
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-1 rounded-full min-w-[205px] sm:min-w-[245px]"
        style={{
          backgroundColor: 'var(--subtle)',
          border: '1px solid var(--border)',
        }}
        onClick={stop}
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onKeyDown={stop}
      >
        {renderSliderTrack()}
        <span
          className="text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0"
          style={{ color: 'var(--gold)' }}
        >
          {displayValue === 'all' ? (isDe ? 'Alle' : 'All') : `~${numericVal}`}
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

      {renderSliderTrack()}

      <div className="flex items-center justify-between text-[10px] pt-0.5">
        {quickStops.map((s) => {
          const active = displayValue === s.val;
          return (
            <button
              key={String(s.val)}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraftVal(s.val);
                latestDraftRef.current = s.val;
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
