'use client';
import React from 'react';

/**
 * SEIRS logo, web version.
 *
 * Ported from apps/customer-app/components/SeirsLogoV2.tsx (2026-05-20 brand
 * pass) to plain SVG for use in the admin dashboard.
 *
 * Same design principles: single stroke weight, integer-pixel grid, two
 * brand colours only (navy + white on dark backgrounds). The stick-figure
 * okada silhouette is on a 48x32 viewBox.
 *
 * Three exports:
 *   <SeirsMarkBold size={40} color="#fff" hubColor="#0F2B4C" />
 *   <SeirsWordmark size={100} color="#fff" />
 *   <SeirsLockup size={180} color="#fff" hubColor="#0F2B4C" />
 */

export const NAVY_REFINED = '#0E2540';
export const YELLOW       = '#FFBE0B';

interface MarkProps {
  size?:     number;
  color?:    string;
  hubColor?: string;
}

export function SeirsMarkBold({
  size     = 40,
  color    = NAVY_REFINED,
  hubColor = '#FFFFFF',
}: MarkProps) {
  const VB_W = 48;
  const VB_H = 32;
  const STR  = 3.5;

  return (
    <svg
      width={size}
      height={size * (VB_H / VB_W)}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color}
        strokeWidth={STR}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Rear wheel */}
      <circle cx={10} cy={24} r={6} fill={color} />
      <circle cx={10} cy={24} r={2} fill={hubColor} />
      {/* Front wheel */}
      <circle cx={38} cy={24} r={6} fill={color} />
      <circle cx={38} cy={24} r={2} fill={hubColor} />
      {/* Handlebar */}
      <line x1={37} y1={12} x2={42} y2={9}
            stroke={color} strokeWidth={STR} strokeLinecap="round" />
      {/* Rider torso */}
      <line x1={24} y1={16} x2={28} y2={8}
            stroke={color} strokeWidth={4} strokeLinecap="round" />
      {/* Head */}
      <circle cx={28} cy={5} r={3.5} fill={color} />
      {/* Arm */}
      <line x1={27} y1={10} x2={37} y2={12}
            stroke={color} strokeWidth={STR} strokeLinecap="round" />
    </svg>
  );
}

interface WordmarkProps {
  size?:  number;
  color?: string;
}

export function SeirsWordmark({
  size  = 100,
  color = NAVY_REFINED,
}: WordmarkProps) {
  const VB_W = 120;
  const VB_H = 28;
  const cellW = VB_W / 5;
  const letters = ['S', 'E', 'I', 'R', 'S'];

  return (
    <svg
      width={size}
      height={size * (VB_H / VB_W)}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SEIRS"
    >
      {letters.map((char, i) => (
        <text
          key={`${char}-${i}`}
          x={i * cellW + cellW / 2}
          y={22}
          fontSize={22}
          fontWeight={900}
          fill={color}
          textAnchor="middle"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          style={{ letterSpacing: '0.05em' }}
        >
          {char}
        </text>
      ))}
    </svg>
  );
}

interface LockupProps {
  /** Approx total width in px. Mark + wordmark scale within. */
  size?:     number;
  color?:    string;
  /** Background colour behind the wheels (for the hub cutouts). */
  hubColor?: string;
  /** Optional tagline under the wordmark. */
  tagline?:  string;
  /** Tagline colour (defaults to color with reduced opacity). */
  taglineColor?: string;
}

export function SeirsLockup({
  size         = 180,
  color        = NAVY_REFINED,
  hubColor     = '#FFFFFF',
  tagline,
  taglineColor,
}: LockupProps) {
  const markW = size * 0.28;
  const wordW = size * 0.60;
  const gap   = size * 0.06;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <SeirsMarkBold size={markW} color={color} hubColor={hubColor} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SeirsWordmark size={wordW} color={color} />
        {tagline && (
          <span
            style={{
              fontSize: Math.max(9, wordW * 0.09),
              fontWeight: 500,
              color: taglineColor ?? color,
              opacity: taglineColor ? 1 : 0.55,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              lineHeight: 1,
            }}
          >
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
}
