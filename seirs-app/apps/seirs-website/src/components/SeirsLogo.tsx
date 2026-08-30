/**
 * Website version of the SEIRS logo. Mirrors the mobile-app SeirsLogoV2
 * exports byte-for-byte on the SVG geometry so the brand reads the same
 * on the marketing site as it does inside the apps.
 *
 * The mobile mark lives at apps/customer-app/components/SeirsLogoV2.tsx.
 * Any tweak to strokes / grid / rider pose there should be mirrored here
 * to keep the brand consistent (short-term: two files, long-term: bring
 * both under shared/ when the mobile SVG library allows web export).
 *
 * NAVY_REFINED is a touch warmer than the app's primary #0F2B4C so the
 * mark still pops on the off-white marketing background (#F5F5F0).
 */

// The single SEIRS navy, 2026-08-30. #0E2540 lived here and in the
// app's SeirsLogoV2 while the palette said #0F2B4C, so the mark had
// one navy and the UI another. The founder picked #0A1F38 for the
// mark; the palette keeps #0F2B4C as the UI primary.
export const NAVY_REFINED = '#0A1F38';

interface SeirsLogoProps {
  variant?:    'lockup' | 'mark' | 'wordmark';
  size?:       number;   // pixel width of the whole logo (or the mark, for `mark` variant)
  color?:      string;   // stroke + fill; defaults to refined navy
  className?:  string;
  hubColor?:   string;   // what shows through the wheel hubs; set to the ground
}

export default function SeirsLogo({
  variant = 'lockup',
  size    = 140,
  color   = NAVY_REFINED,
  className,
  hubColor,
}: SeirsLogoProps) {
  if (variant === 'mark')     return <SeirsMark    size={size} color={color} hubColor={hubColor} className={className} />;
  if (variant === 'wordmark') return <SeirsWordmark size={size} color={color} className={className} />;

  const markW = size * 0.30;
  const wordW = size * 0.62;
  const gap   = size * 0.05;

  return (
    <span
      className={`inline-flex items-center ${className ?? ''}`}
      style={{ gap }}
      aria-label="SEIRS Logistics"
    >
      <SeirsMark    size={markW} color={color} hubColor={hubColor} />
      <SeirsWordmark size={wordW} color={color} />
    </span>
  );
}

function SeirsMark({
  size,
  color,
  hubColor = '#F5F5F0',
  className,
}: { size: number; color: string; bold?: boolean; hubColor?: string; className?: string }) {
  /**
   * THE mark, matched to the apps on 2026-08-30.
   *
   * Two things were wrong here. The `bold` prop defaulted to FALSE and every
   * caller omitted it, so the site rendered a thin, spoke-wheeled variant
   * that exists nowhere in the apps: the founder said the website logo did
   * not look like the phone one and he was right. And the bold branch it
   * would have drawn was the OLD geometry anyway, before the torso was
   * stretched.
   *
   * The thin variant is gone rather than fixed. It was a second drawing of
   * the same mark, which is the drift this file already suffers from with
   * its second navy.
   *
   * Geometry is now identical to SeirsMarkBold in the apps: stroke 6.5,
   * solid wheels r7.6 with r2.6 hubs, torso run to 15.94, head r4.8. The
   * viewBox is cropped to the ink, which is why it is no longer 0 0 48 32
   * -- the stretched rider's head sits above y=0.
   */
  const VB_X = 2.4, VB_Y = -6.06, VB_W = 43.2, VB_H = 37.66;
  const height = size * (VB_H / VB_W);
  const SW = 6.5;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color} strokeWidth={SW} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx={10} cy={24} r={7.6} fill={color} />
      <circle cx={10} cy={24} r={2.6} fill={hubColor} />
      <circle cx={38} cy={24} r={7.6} fill={color} />
      <circle cx={38} cy={24} r={2.6} fill={hubColor} />
      <line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <line x1={24} y1={16} x2={31.13} y2={1.74} stroke={color} strokeWidth={7} strokeLinecap="round" />
      <circle cx={31.13} cy={-1.26} r={4.8} fill={color} />
      <line x1={29.35} y1={5.30} x2={37} y2={12} stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </svg>
  );
}

function SeirsWordmark({
  size,
  color,
  className,
}: { size: number; color: string; className?: string }) {
  const VB_W = 120;
  const VB_H = 28;
  const height = size * (VB_H / VB_W);
  const cellW = VB_W / 5;
  const letters = ['S', 'E', 'I', 'R', 'S'];

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {letters.map((char, i) => (
        <text
          key={`${char}-${i}`}
          x={i * cellW + cellW / 2}
          y={22}
          fontSize={22}
          fontWeight="900"
          fill={color}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {char}
        </text>
      ))}
    </svg>
  );
}
