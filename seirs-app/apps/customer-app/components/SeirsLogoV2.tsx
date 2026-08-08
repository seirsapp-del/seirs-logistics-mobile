import { View } from 'react-native';
import Svg, { Circle, Path, Rect, Line, Text as SvgText, G } from 'react-native-svg';

/**
 * SEIRS logo v2 — refined for "ten-year-old brand on day one" feel.
 *
 * Built 2026-05-20 after a brand-strategy pass. Three principles:
 *   1. Single stroke weight (2px) throughout — feels designed, not sketched
 *   2. Every coordinate snaps to integer pixels on a 48×32 grid
 *   3. Two colours only in the mark (navy + yellow). Sky-blue is UI-only
 *
 * Hidden detail: the triangular negative space between the rider's
 * torso, arm, and the handlebar forms a forward-pointing wedge — reads
 * subliminally as "motion." Won't be consciously noticed; will be felt.
 *
 * Three exports:
 *   <SeirsMark    size={96} />                  // mark only (square — app icon, favicon, social avatar)
 *   <SeirsWordmark size={120} />                // wordmark only (website nav, email signature)
 *   <SeirsLogoLockup size={140} />              // mark + wordmark horizontal (letterhead, receipt header)
 *
 * Default colour is the refined navy (#0E2540), a touch warmer than the
 * current brand navy. Pass `color` to override (e.g. white on dark).
 */

// Refined brand colours. Sky-blue intentionally omitted — UI only.
export const NAVY_REFINED = '#0E2540';
export const YELLOW       = '#FFBE0B';

const STROKE = 2;

// ── 1. The mark ────────────────────────────────────────────────────────
// Stick-figure okada on a 48×32 grid. Two wheels, single-curve frame,
// rider leaning forward. NO yellow package (removed 2026-05-20 — user
// preferred a cleaner silhouette). Everything snaps to integer pixels.

interface MarkProps {
  size?:    number;   // Width in px. Height scales to aspect. Default 96.
  color?:   string;   // Stroke colour. Default refined navy.
}

export function SeirsMark({
  size  = 96,
  color = NAVY_REFINED,
}: MarkProps) {
  const VB_W = 48;
  const VB_H = 32;
  const aspect = VB_H / VB_W;

  return (
    <Svg width={size} height={size * aspect} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Frame — single 4-segment path: rear hub → saddle-left → saddle-right → front hub */}
      <Path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rear wheel — circle + 2-stroke axle cross */}
      <Circle cx={10} cy={24} r={5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Line x1={6}  y1={24} x2={14} y2={24} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={10} y1={20} x2={10} y2={28} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Front wheel */}
      <Circle cx={38} cy={24} r={5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Line x1={34} y1={24} x2={42} y2={24} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={38} y1={20} x2={38} y2={28} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Handlebar — short bar reaching forward from the rider's hand,
          visibly ABOVE the front wheel so there's clear hand→wheel space */}
      <Line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Rider torso — angled forward */}
      <Line x1={24} y1={16} x2={28} y2={8} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Rider head — filled solid so it reads at favicon size */}
      <Circle cx={28} cy={5} r={3} fill={color} />

      {/* Arm to handlebar — ends at (37,12), above-left of wheel for breathing room */}
      <Line x1={27} y1={10} x2={37} y2={12} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

// ── 2. The wordmark ────────────────────────────────────────────────────
// "SEIRS" — equal-cell positioning so spacing is platform-consistent
// (system fonts handle letter-spacing differently on iOS vs Android,
// so we draw each letter at a hand-placed x). 0.18em tracking gives
// the "luxury wordmark" feel of Stripe / Linear / Vercel.

interface WordmarkProps {
  size?:  number;   // Width in px. Default 120.
  color?: string;   // Default refined navy.
}

export function SeirsWordmark({
  size  = 120,
  color = NAVY_REFINED,
}: WordmarkProps) {
  const VB_W = 120;
  const VB_H = 28;
  const aspect = VB_H / VB_W;

  // Five equal cells. Each letter is centred in its cell. Total tracking
  // ≈ 0.18em — enough to feel deliberate, not so much it loses cohesion.
  const cellW = VB_W / 5;
  const letters = ['S', 'E', 'I', 'R', 'S'];

  return (
    <Svg width={size} height={size * aspect} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {letters.map((char, i) => (
        <SvgText
          key={`${char}-${i}`}
          x={i * cellW + cellW / 2}
          y={22}
          fontSize={22}
          fontWeight="900"
          fill={color}
          textAnchor="middle"
          fontFamily="System"
        >
          {char}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Bolder variants ────────────────────────────────────────────────────
// Thicker strokes (3.5px), solid-filled wheels, beefier rider — the
// "people can actually see it" variant. Use when the mark needs to
// shout (home-screen header, hero card, splash, app icon). Thin v2 is
// still fine for favicon and small contexts.

interface BoldMarkProps {
  size?:      number;
  color?:     string;   // stroke + fill colour for the bike + rider
  /** Colour shown inside the wheel hubs (= "background" the wheels sit on,
   *  so the axle hole reads). Set to your container's bg colour. */
  hubColor?:  string;
}

export function SeirsMarkBold({
  size     = 96,
  color    = NAVY_REFINED,
  hubColor = '#FFFFFF',
}: BoldMarkProps) {
  const VB_W = 48;
  const VB_H = 32;
  const aspect = VB_H / VB_W;
  const STR = 3.5;

  return (
    <Svg width={size} height={size * aspect} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Frame — bolder */}
      <Path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color}
        strokeWidth={STR}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rear wheel — SOLID filled, with hub hole showing through */}
      <Circle cx={10} cy={24} r={6}   fill={color} />
      <Circle cx={10} cy={24} r={2}   fill={hubColor} />

      {/* Front wheel */}
      <Circle cx={38} cy={24} r={6}   fill={color} />
      <Circle cx={38} cy={24} r={2}   fill={hubColor} />

      {/* Handlebar — reaches forward from the hand, sits ABOVE the wheel
          for clear hand→wheel separation */}
      <Line x1={37} y1={12} x2={42} y2={9}
            stroke={color} strokeWidth={STR} strokeLinecap="round" />

      {/* Rider torso — beefier */}
      <Line x1={24} y1={16} x2={28} y2={8}
            stroke={color} strokeWidth={4} strokeLinecap="round" />

      {/* Head — bigger solid circle */}
      <Circle cx={28} cy={5} r={3.5} fill={color} />

      {/* Arm — ends at (37,12), above-left of wheel for visible gap */}
      <Line x1={27} y1={10} x2={37} y2={12}
            stroke={color} strokeWidth={STR} strokeLinecap="round" />
    </Svg>
  );
}

// ── 4. The brand pill — bold lockup in a navy capsule ─────────────────
// THIS is the home-screen / drawer / hero brand mark. Mark + wordmark
// inside a rounded navy pill, white-on-navy with the yellow package
// as the single colour pop. Self-contained, can't be missed.

interface PillProps {
  /** Width in px. Pill auto-scales height. Default 180. */
  size?: number;
  /** Background fill of the pill. Default refined navy. */
  background?: string;
  /** Stroke + fill colour for mark + wordmark. Default white. */
  color?: string;
}

export function SeirsBrandPill({
  size       = 180,
  background = NAVY_REFINED,
  color      = '#FFFFFF',
}: PillProps) {
  // Pill viewBox: 200×56 (≈ 3.6:1) — comfortable banner proportion.
  const VB_W = 200;
  const VB_H = 56;
  const aspect = VB_H / VB_W;
  const STR = 3.5;

  return (
    <Svg width={size} height={size * aspect} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Navy pill background */}
      <Rect x={0} y={0} width={200} height={56} rx={28} fill={background} />

      {/* Mark — translated + scaled. Source is 48×32; place at x=14,
          y=center-of-pill minus half mark-height. Scale 0.85 keeps it
          inside the pill with ~4px vertical padding. */}
      <G transform="translate(14 8) scale(0.85)">
        <Path d="M 10 24 L 18 16 L 30 16 L 38 24"
              stroke={color} strokeWidth={STR} fill="none"
              strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={10} cy={24} r={6} fill={color} />
        <Circle cx={10} cy={24} r={2} fill={background} />
        <Circle cx={38} cy={24} r={6} fill={color} />
        <Circle cx={38} cy={24} r={2} fill={background} />
        <Line x1={37} y1={12} x2={42} y2={9}
              stroke={color} strokeWidth={STR} strokeLinecap="round" />
        <Line x1={24} y1={16} x2={28} y2={8}
              stroke={color} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={28} cy={5} r={3.5} fill={color} />
        <Line x1={27} y1={10} x2={37} y2={12}
              stroke={color} strokeWidth={STR} strokeLinecap="round" />
      </G>

      {/* Wordmark — equal-cell, centred vertically (y=36 = pill mid + 8px optical) */}
      {['S', 'E', 'I', 'R', 'S'].map((char, i) => (
        <SvgText
          key={`${char}-${i}`}
          x={86 + i * 22}
          y={37}
          fontSize={22}
          fontWeight="900"
          fill={color}
          textAnchor="middle"
          fontFamily="System"
        >
          {char}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── 3. The full lockup ─────────────────────────────────────────────────
// Mark on the left, wordmark on the right, gap = ~6% of width.
// This is what goes on website headers, receipts, letterhead, business
// cards. The mark-only and wordmark-only versions are for everything
// else.

interface LockupProps {
  size?:    number;   // Approx width in px. Default 200.
  color?:   string;   // Default refined navy.
  tagline?: string;   // Optional tagline below the wordmark.
}

export function SeirsLogoLockup({
  size    = 200,
  color   = NAVY_REFINED,
  tagline,
}: LockupProps) {
  // Mark is 48×32 viewBox → 3:2 ratio. Wordmark is 120×28 viewBox →
  // about 4.3:1. Sizing: mark gets ~30% of width, wordmark gets ~65%,
  // gap is ~5%.
  const markW   = size * 0.32;
  const wordW   = size * 0.62;
  const gap     = size * 0.06;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <SeirsMark size={markW} color={color} />
      <View>
        <SeirsWordmark size={wordW} color={color} />
        {tagline && (
          <SvgTextTagline color={color} text={tagline} width={wordW} />
        )}
      </View>
    </View>
  );
}

// Small helper so the tagline aligns to the wordmark's left edge and
// uses the same SVG-based rendering (consistent across platforms).
function SvgTextTagline({ text, width, color }: { text: string; width: number; color: string }) {
  const VB_W = 120;
  const VB_H = 10;
  return (
    <Svg width={width} height={width * (VB_H / VB_W)} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <SvgText
        x={0}
        y={8}
        fontSize={7}
        fontWeight="400"
        fill={color}
        fontFamily="System"
        opacity={0.7}
      >
        {text}
      </SvgText>
    </Svg>
  );
}
