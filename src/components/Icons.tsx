import React, { useId } from 'react';
import { resolveStackIconId } from '../data/stacks';
import type { StackIconId, StackId } from '../types/deck';

interface IconProps {
  className?: string;
  size?: number;
}

const NONAGON_OUTER =
  '256.0,78.0 370.4,119.6 431.3,225.1 410.2,345.0 316.9,423.3 195.1,423.3 101.8,345.0 80.7,225.1 141.6,119.6';
const NONAGON_MID =
  '256.0,384.0 173.7,354.1 129.9,278.2 145.1,192.0 212.2,135.7 299.8,135.7 366.9,192.0 382.1,278.2 338.3,354.1';
const NONAGON_INNER =
  '256.0,176.0 307.4,194.7 334.8,242.1 325.3,296.0 283.4,331.2 228.6,331.2 186.7,296.0 177.2,242.1 204.6,194.7';
const NONAGON_CORE =
  '256.0,298.0 229.0,288.2 214.6,263.3 219.6,235.0 241.6,216.5 270.4,216.5 292.4,235.0 297.4,263.3 283.0,288.2';

/**
 * 9-sided concentric teal & gold Resonance brand emblem.
 */
export const ConcentricLogo: React.FC<IconProps> = ({
  size = 28,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="56 56 400 400"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <polygon
      points={NONAGON_OUTER}
      fill="none"
      stroke="#ABD5D0"
      strokeWidth="20"
      strokeLinejoin="round"
    />
    <polygon
      points={NONAGON_MID}
      fill="none"
      stroke="#6CB5AD"
      strokeWidth="20"
      strokeLinejoin="round"
    />
    <polygon
      points={NONAGON_INNER}
      fill="none"
      stroke="#2E968A"
      strokeWidth="20"
      strokeLinejoin="round"
    />
    <polygon
      points={NONAGON_CORE}
      fill="#F0C66B"
      stroke="#F0C66B"
      strokeWidth="6"
      strokeLinejoin="round"
    />
  </svg>
);

interface NonagonFiligreeProps {
  className?: string;
  showCore?: boolean;
  rotationDeg?: number;
  accentStroke?: string;
  coreFill?: string;
}

/**
 * Architectural 9-sided watermark derived from the brand emblem for subtle depth.
 */
export const NonagonFiligree: React.FC<NonagonFiligreeProps> = ({
  className = '',
  showCore = false,
  rotationDeg = 0,
  accentStroke = 'var(--accent)',
  coreFill = 'var(--gold)',
}) => (
  <svg
    viewBox="40 40 432 432"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <g transform={rotationDeg !== 0 ? `rotate(${rotationDeg} 256 256)` : undefined}>
      <polygon
        points={NONAGON_OUTER}
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points={NONAGON_MID}
        stroke="var(--ink)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <polygon
        points={NONAGON_INNER}
        stroke={accentStroke}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      {showCore && (
        <polygon
          points={NONAGON_CORE}
          fill={coreFill}
          fillOpacity="0.28"
          stroke={coreFill}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </g>
  </svg>
);

const LOGO_EMBOSS_RINGS = [NONAGON_OUTER, NONAGON_MID, NONAGON_INNER];

/**
 * 3D raised blind-embossed concentric 9-gon paper texture shaped directly
 * like the 3 outer rings of the Resonance logo, leaving the center open.
 */
export const EmbossedNonagonPaper: React.FC<{
  className?: string;
  goldInnerRing?: boolean;
}> = ({ className = '', goldInnerRing = false }) => {
  const uid = useId().replace(/:/g, '');
  const shadowFilterId = `emboss-s-${uid}`;
  const highlightFilterId = `emboss-h-${uid}`;

  return (
    <svg
      viewBox="36 36 440 440"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <filter id={shadowFilterId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="2.8" />
        </filter>
        <filter id={highlightFilterId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* 1. Down-right soft cast shadow */}
      <g
        transform="translate(2.2, 2.8)"
        filter={`url(#${shadowFilterId})`}
        stroke="var(--emboss-shadow)"
        strokeWidth="16"
        strokeLinejoin="round"
      >
        {LOGO_EMBOSS_RINGS.map((pts, i) => (
          <polygon key={`s-${i}`} points={pts} />
        ))}
      </g>

      {/* 2. Up-left soft bevel highlight */}
      <g
        transform="translate(-1.8, -1.8)"
        filter={`url(#${highlightFilterId})`}
        stroke="var(--emboss-highlight)"
        strokeWidth="14"
        strokeLinejoin="round"
      >
        {LOGO_EMBOSS_RINGS.map((pts, i) => (
          <polygon key={`h-${i}`} points={pts} />
        ))}
      </g>

      {/* 3. Raised cardstock plateau face */}
      <g
        stroke="var(--emboss-face)"
        strokeWidth="13"
        strokeLinejoin="round"
      >
        {LOGO_EMBOSS_RINGS.map((pts, i) => (
          <polygon key={`f-${i}`} points={pts} />
        ))}
      </g>

      {/* 4. Crisp subtle top-left edge crest */}
      <g
        transform="translate(-0.6, -0.7)"
        stroke="var(--emboss-rim)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      >
        {LOGO_EMBOSS_RINGS.map((pts, i) => (
          <polygon key={`r-${i}`} points={pts} />
        ))}
      </g>

      {goldInnerRing && (
        <polygon
          points={NONAGON_INNER}
          stroke="var(--gold-hairline)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
};

export const StackArtwork: React.FC<{
  stackId: StackId;
  iconId?: StackIconId;
  size?: number;
  className?: string;
}> = ({ stackId, iconId, size = 34, className = '' }) => {
  switch (resolveStackIconId(undefined, iconId ?? stackId)) {
    case 'warmup':
      // Morning sun arcs over calm horizon
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M5 24h26" />
          <path d="M10 24a8 8 0 0 1 16 0" />
          <path d="M14 24a4 4 0 0 1 8 0" />
          <path d="M18 8v3M10.5 11.5l2 2M25.5 11.5l-2 2M8 18h2.5M25.5 18H28" />
        </svg>
      );

    case 'vulnerability':
      // Gentle open vessel / unfolding crescent arcs
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M18 9c-4 4.5-4 11.5 0 17 4-5.5 4-12.5 0-17Z" />
          <path d="M18 26C11.5 24 8 18.5 9 12c3.5 1.5 6.5 5 9 14Z" />
          <path d="M18 26c6.5-2 10-7.5 9-14-3.5 1.5-6.5 5-9 14Z" />
        </svg>
      );

    case 'friendship':
      // Two overlapping Venn circles with shared center point
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className={className}
          aria-hidden="true"
        >
          <circle cx="14.5" cy="18" r="7.5" />
          <circle cx="21.5" cy="18" r="7.5" />
          <circle cx="18" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'spirituality':
      // Radiant nine-ray star inside a quiet inner halo
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="18" cy="18" r="4.5" />
          <path d="M18 6v4.5M18 25.5V30M6 18h4.5M25.5 18H30M9.5 9.5l3.2 3.2M23.3 23.3l3.2 3.2M26.5 9.5l-3.2 3.2M12.7 23.3l-3.2 3.2" />
        </svg>
      );

    case 'quotes':
      // Quiet manuscript frame & double quotation marks
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M14 14a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3v3c0 2.2-1.3 4-3 4.8" />
          <path d="M24 14a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3v3c0 2.2-1.3 4-3 4.8" />
          <path d="M10 26.5h16" />
        </svg>
      );

    case 'reflection':
    default:
      // Winding path & north-star compass point
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="18" cy="18" r="11" />
          <polygon points="18,10 20.5,18 18,26 15.5,18" />
          <circle cx="18" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
};

export const ThumbUpIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M7 10v11" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);

export const ThumbDownIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M17 14V3" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const UndoIcon: React.FC<IconProps> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
  </svg>
);

export const BookmarkIcon: React.FC<IconProps & { filled?: boolean }> = ({
  size = 15,
  filled = false,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
  </svg>
);

export const QrIcon: React.FC<IconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14v3M14 20h6M20 20v1" />
  </svg>
);

export const SunIcon: React.FC<IconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const MoonIcon: React.FC<IconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const ExternalLinkIcon: React.FC<IconProps> = ({ size = 12, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const StacksIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M6 7.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
    <path d="M4.5 11a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2" />
    <rect x="3" y="12.5" width="18" height="8" rx="2.5" />
  </svg>
);

export const DeckPlayIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.45"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="4" y="2.75" width="16" height="18.5" rx="2.75" />
    <path d="M10.25 9.1 15.35 12l-5.1 2.9V9.1Z" fill="currentColor" fillOpacity="0.16" />
  </svg>
);
