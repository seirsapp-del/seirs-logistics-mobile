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
  /**
   * The locked mark (2026-09-05).
   *
   * This drew stroke 3.5 on a 48x32 box, which is the pre-August okada.
   * The apps drew a third one at stroke 2. The founder saw all three and
   * asked for one mark everywhere.
   *
   * The numbers below are the founder's locked pick of 30 August with the
   * two corrections of 3 September (torso 6.0 -> 5.5 so its round cap
   * stops hanging below the frame rail; head to 31.82, -1.18 so the neck
   * meets the skull at the same angle on both sides).
   *
   * SOURCE OF TRUTH is seirs-app/shared/brand/mark.ts, which
   * scripts/build-mark-assets.js also cuts the PNG assets from. It is
   * copied here rather than imported because this app has no
   * @seirs/shared path alias, and adding one to change a logo would put
   * the whole Next build at risk. If the mark ever moves again, this file
   * and apps/seirs-website/src/components/SeirsLogo.tsx are the two
   * copies that must move with it.
   */
  const SW = 5.5, WHEEL_R = 7.0, HUB_R = 2.4, HEAD_R = 4.3;
  const HEAD = { x: 31.82, y: -1.18 };
  const VB_X = 3.0, VB_Y = -5.48, VB_W = 42.0, VB_H = 36.48;

  return (
    <svg
      width={size}
      height={size * (VB_H / VB_W)}
      viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color} strokeWidth={SW} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx={10} cy={24} r={WHEEL_R} fill={color} />
      <circle cx={38} cy={24} r={WHEEL_R} fill={color} />
      <line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <line x1={24} y1={16} x2={31.13} y2={1.74} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <circle cx={HEAD.x} cy={HEAD.y} r={HEAD_R} fill={color} />
      <line x1={29.35} y1={5.30} x2={37} y2={12} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      {/* Hubs last, so they punch through the frame path's round cap. */}
      <circle cx={10} cy={24} r={HUB_R} fill={hubColor} />
      <circle cx={38} cy={24} r={HUB_R} fill={hubColor} />
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
