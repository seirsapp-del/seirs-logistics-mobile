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

export const NAVY_REFINED = '#0E2540';

interface SeirsLogoProps {
  variant?:    'lockup' | 'mark' | 'wordmark';
  size?:       number;   // pixel width of the whole logo (or the mark, for `mark` variant)
  color?:      string;   // stroke + fill; defaults to refined navy
  className?:  string;
  bold?:       boolean;  // Uses the thicker "SeirsMarkBold" strokes + solid wheels
}

export default function SeirsLogo({
  variant = 'lockup',
  size    = 140,
  color   = NAVY_REFINED,
  className,
  bold    = false,
}: SeirsLogoProps) {
  if (variant === 'mark')     return <SeirsMark    size={size} color={color} bold={bold} className={className} />;
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
      <SeirsMark    size={markW} color={color} bold={bold} />
      <SeirsWordmark size={wordW} color={color} />
    </span>
  );
}

function SeirsMark({
  size,
  color,
  bold,
  className,
}: { size: number; color: string; bold?: boolean; className?: string }) {
  const VB_W = 48;
  const VB_H = 32;
  const height = size * (VB_H / VB_W);
  const stroke = bold ? 3.5 : 2;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Frame: rear hub -> saddle-left -> saddle-right -> front hub */}
      <path
        d="M 10 24 L 18 16 L 30 16 L 38 24"
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {bold ? (
        <>
          <circle cx={10} cy={24} r={6} fill={color} />
          <circle cx={10} cy={24} r={2} fill="#FFFFFF" />
          <circle cx={38} cy={24} r={6} fill={color} />
          <circle cx={38} cy={24} r={2} fill="#FFFFFF" />
        </>
      ) : (
        <>
          <circle cx={10} cy={24} r={5} stroke={color} strokeWidth={stroke} fill="none" />
          <line x1={6}  y1={24} x2={14} y2={24} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <line x1={10} y1={20} x2={10} y2={28} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <circle cx={38} cy={24} r={5} stroke={color} strokeWidth={stroke} fill="none" />
          <line x1={34} y1={24} x2={42} y2={24} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <line x1={38} y1={20} x2={38} y2={28} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        </>
      )}

      {/* Handlebar reaching forward-up from the rider's hand */}
      <line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={stroke} strokeLinecap="round" />

      {/* Rider torso, angled forward */}
      <line x1={24} y1={16} x2={28} y2={8} stroke={color} strokeWidth={bold ? 4 : stroke} strokeLinecap="round" />

      {/* Rider head */}
      <circle cx={28} cy={5} r={bold ? 3.5 : 3} fill={color} />

      {/* Arm to handlebar */}
      <line x1={27} y1={10} x2={37} y2={12} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
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
