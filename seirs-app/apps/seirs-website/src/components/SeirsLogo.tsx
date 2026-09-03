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
   * Geometry matches the cut assets: the A3 weight, stroke 5.5, solid
   * wheels r7.0 with r2.4 hubs, torso 5.5, head r4.3. The founder compared
   * A3 against A4 on a real phone on 2026-08-30 and took the lighter set;
   * A4 was 6.5 / 7.0 / 7.6 / 2.6 / 4.8. Line coordinates are unchanged
   * between the two weights, only the radii and stroke widths move. The
   * viewBox is cropped to the ink, which is why it is no longer 0 0 48 32
   * -- the stretched rider's head sits above y=0.
   *
   * Two corrections, founder-approved 2026-09-03. The torso drops from 6.0
   * to 5.5: at 6.0 its round cap reached y=19.00 while the frame rail's
   * underside sits at 18.75, so a rounded lobe hung below the frame right
   * under the rider. And the head moves from (31.13, -1.26) to
   * (31.82, -1.18): it sits 3.0 from the torso's tip and used to sit
   * straight UP while the torso arrives at 26.57 degrees off vertical, so
   * the neck met the skull at a different angle on each side. It is now
   * offset at 13.3 degrees, half the lean. The ink top moves with it, hence
   * the viewBox. Cut by scripts/build-mark-assets.js, which is the one
   * source for all seven assets now.
   */
  const VB_X = 3.0, VB_Y = -5.48, VB_W = 42.0, VB_H = 36.48;
  const height = size * (VB_H / VB_W);
  const SW = 5.5;

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
      <circle cx={10} cy={24} r={7.0} fill={color} />
      <circle cx={10} cy={24} r={2.4} fill={hubColor} />
      <circle cx={38} cy={24} r={7.0} fill={color} />
      <circle cx={38} cy={24} r={2.4} fill={hubColor} />
      <line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <line x1={24} y1={16} x2={31.13} y2={1.74} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <circle cx={31.82} cy={-1.18} r={4.3} fill={color} />
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
