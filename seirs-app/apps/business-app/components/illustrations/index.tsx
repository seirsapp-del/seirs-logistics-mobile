import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect, G, Line, Ellipse } from 'react-native-svg';

/**
 * Hand-drawn SEIRS illustrations: pure SVG, no external assets.
 * Style vocabulary (consistent across all 8):
 *   - SEIRS navy   #0F2B4C   primary fills + stroke
 *   - SEIRS blue   #3A86FF   secondary accent
 *   - Orange       #FF6B00   high-vis / energy accent
 *   - Yellow       #FFBE0B   reward / package accent
 *   - Brown skin   #7B4F2C   when human characters appear
 *   - Background   #EAF3FF   soft sky behind subjects (light mode)
 *
 * Each illustration is square (1:1) and scales to whatever size is
 * passed by the Illustration component. Skin tones default to Nigerian
 * brown.
 */

const NAVY   = '#0F2B4C';
const BLUE   = '#3A86FF';
const ORANGE = '#FF6B00';
const YELLOW = '#FFBE0B';
const GREEN  = '#22C55E';
const SKIN   = '#7B4F2C';
const BG     = '#EAF3FF';
const DARK   = '#0D1117';
const WHITE  = '#FFFFFF';

interface SvgIllustrationProps {
  size?: number;
}

// Common wrapper: centred SVG with soft brand-tinted background
function IllustrationFrame({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {children}
      </Svg>
    </View>
  );
}

// ─── 1. SEND PACKAGE: open box with items being placed in ────────────
export function SendPackageSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      {/* Soft round backdrop */}
      <Circle cx={100} cy={110} r={75} fill={BG} />

      {/* Open cardboard box: back panel */}
      <Path d="M55 95 L100 75 L145 95 L100 115 Z" fill={NAVY} opacity={0.85} />
      {/* Front panel */}
      <Path d="M55 95 L55 155 L100 175 L100 115 Z" fill={NAVY} />
      <Path d="M100 115 L100 175 L145 155 L145 95 Z" fill="#1A3A63" />
      {/* Tape strip */}
      <Path d="M70 105 L100 90 L130 105" stroke={BLUE} strokeWidth={3} fill="none" />

      {/* Items in the box: one yellow envelope, one blue parcel */}
      {/* Envelope */}
      <Rect x={70} y={50} width={32} height={22} rx={2} fill={YELLOW} stroke={DARK} strokeWidth={1.5} />
      <Path d="M70 52 L86 64 L102 52" stroke={DARK} strokeWidth={1.5} fill="none" />

      {/* Hand placing a small parcel (brown skin) */}
      <Circle cx={140} cy={62} r={4} fill={BLUE} />
      <Rect x={120} y={66} width={22} height={14} rx={1.5} fill={BLUE} />
      <Line x1={140} y1={80} x2={130} y2={90} stroke={SKIN} strokeWidth={5} strokeLinecap="round" />
    </IllustrationFrame>
  );
}

// ─── 2. SEND ADDRESS: two pins on a map line ─────────────────────────
export function SendAddressSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      {/* Soft round backdrop */}
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Curved dotted route between the two pins */}
      <Path
        d="M55 130 Q100 70 145 130"
        stroke={NAVY}
        strokeWidth={2.5}
        strokeDasharray="6 5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Pickup pin (left, green): origin */}
      <G>
        <Path
          d="M55 110 C45 110 45 95 55 95 C65 95 65 110 55 110 Z M55 110 L55 130"
          fill={GREEN}
          stroke={DARK}
          strokeWidth={1.5}
        />
        <Circle cx={55} cy={102} r={3.5} fill={WHITE} />
      </G>

      {/* Dropoff pin (right, orange): destination */}
      <G>
        <Path
          d="M145 110 C135 110 135 95 145 95 C155 95 155 110 145 110 Z M145 110 L145 130"
          fill={ORANGE}
          stroke={DARK}
          strokeWidth={1.5}
        />
        <Circle cx={145} cy={102} r={3.5} fill={WHITE} />
      </G>

      {/* Tiny package floating along the route, near the apex */}
      <Rect x={92} y={70} width={16} height={14} rx={1.5} fill={YELLOW} stroke={DARK} strokeWidth={1} />
      <Line x1={100} y1={70} x2={100} y2={84} stroke={DARK} strokeWidth={0.8} />
    </IllustrationFrame>
  );
}

// ─── 3. SEND VEHICLE: row of okada / keke / car / van ────────────────
export function SendVehicleSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Ground line */}
      <Line x1={30} y1={140} x2={170} y2={140} stroke={NAVY} strokeWidth={2} strokeLinecap="round" />

      {/* Okada (motorbike): left, small */}
      <G>
        <Circle cx={45} cy={130} r={6} fill={DARK} />
        <Circle cx={62} cy={130} r={6} fill={DARK} />
        <Path d="M45 122 L62 122" stroke={ORANGE} strokeWidth={3} />
        <Circle cx={54} cy={114} r={4} fill={SKIN} />
        <Path d="M50 114 A4 4 0 0 1 58 114 Z" fill={DARK} />
      </G>

      {/* Keke (tricycle): second */}
      <G>
        <Rect x={75} y={110} width={20} height={20} rx={2} fill={YELLOW} stroke={DARK} strokeWidth={1.5} />
        <Circle cx={78} cy={132} r={5} fill={DARK} />
        <Circle cx={92} cy={132} r={5} fill={DARK} />
        <Rect x={78} y={114} width={14} height={6} fill={BG} />
      </G>

      {/* Car: third, selected (highlighted ring) */}
      <G>
        <Circle cx={120} cy={130} r={22} fill={BLUE} opacity={0.15} />
        <Path d="M105 125 L110 115 L130 115 L135 125 Z" fill={BLUE} />
        <Rect x={105} y={125} width={30} height={10} rx={2} fill={BLUE} />
        <Circle cx={111} cy={135} r={4} fill={DARK} />
        <Circle cx={129} cy={135} r={4} fill={DARK} />
        <Rect x={113} y={118} width={6} height={6} fill={BG} />
        <Rect x={121} y={118} width={6} height={6} fill={BG} />
      </G>

      {/* Danfo (yellow bus): right */}
      <G>
        <Rect x={148} y={110} width={22} height={22} rx={2} fill={YELLOW} stroke={DARK} strokeWidth={1.5} />
        <Rect x={150} y={113} width={5} height={5} fill={BG} />
        <Rect x={157} y={113} width={5} height={5} fill={BG} />
        <Rect x={164} y={113} width={4} height={5} fill={BG} />
        {/* Danfo signature horizontal stripes */}
        <Line x1={148} y1={122} x2={170} y2={122} stroke={DARK} strokeWidth={1} />
        <Circle cx={154} cy={134} r={4} fill={DARK} />
        <Circle cx={164} cy={134} r={4} fill={DARK} />
      </G>
    </IllustrationFrame>
  );
}

// ─── 4. SEND FARE: receipt with checkmarks unfurling ─────────────────
export function SendFareSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Receipt body: long rectangle with zigzag bottom */}
      <Path
        d="M65 50 L135 50 L135 145 L125 138 L115 145 L105 138 L95 145 L85 138 L75 145 L65 138 Z"
        fill={WHITE}
        stroke={NAVY}
        strokeWidth={2}
      />

      {/* Title line */}
      <Rect x={75} y={62} width={50} height={4} rx={1} fill={NAVY} />

      {/* Line items with check marks */}
      <Circle cx={78} cy={82} r={3} fill={GREEN} />
      <Path d="M76 82 L78 84 L81 80" stroke={WHITE} strokeWidth={1.2} fill="none" />
      <Rect x={87} y={80} width={28} height={3} rx={1} fill={NAVY} opacity={0.6} />
      <Rect x={119} y={80} width={12} height={3} rx={1} fill={NAVY} />

      <Circle cx={78} cy={95} r={3} fill={GREEN} />
      <Path d="M76 95 L78 97 L81 93" stroke={WHITE} strokeWidth={1.2} fill="none" />
      <Rect x={87} y={93} width={22} height={3} rx={1} fill={NAVY} opacity={0.6} />
      <Rect x={113} y={93} width={18} height={3} rx={1} fill={NAVY} />

      <Circle cx={78} cy={108} r={3} fill={GREEN} />
      <Path d="M76 108 L78 110 L81 106" stroke={WHITE} strokeWidth={1.2} fill="none" />
      <Rect x={87} y={106} width={30} height={3} rx={1} fill={NAVY} opacity={0.6} />
      <Rect x={121} y={106} width={10} height={3} rx={1} fill={NAVY} />

      {/* Total line */}
      <Line x1={70} y1={120} x2={130} y2={120} stroke={NAVY} strokeWidth={1} />
      <Rect x={75} y={126} width={30} height={5} rx={1} fill={NAVY} />
      <Rect x={107} y={126} width={24} height={5} rx={1} fill={YELLOW} />

      {/* Naira symbol floating */}
      <Circle cx={155} cy={70} r={14} fill={YELLOW} />
      <Path d="M150 64 L150 76 M155 64 L155 76 M148 67 L158 67 M148 73 L158 73 M148 70 L158 70" stroke={DARK} strokeWidth={1.5} strokeLinecap="round" />
    </IllustrationFrame>
  );
}

// ─── 5. SEND CONFIRM: package with a green checkmark stamp ──────────
export function SendConfirmSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Box (isometric-ish, larger than the package step's box) */}
      <Path d="M50 90 L100 65 L150 90 L100 115 Z" fill={NAVY} opacity={0.85} />
      <Path d="M50 90 L50 150 L100 175 L100 115 Z" fill={NAVY} />
      <Path d="M100 115 L100 175 L150 150 L150 90 Z" fill="#1A3A63" />
      {/* Tape */}
      <Path d="M65 100 L100 80 L135 100" stroke={ORANGE} strokeWidth={4} fill="none" />
      <Path d="M100 80 L100 165" stroke={ORANGE} strokeWidth={4} opacity={0.6} />

      {/* Green check-mark stamp: circular, slightly tilted */}
      <G transform="translate(135 50) rotate(15)">
        <Circle cx={0} cy={0} r={22} fill={GREEN} />
        <Circle cx={0} cy={0} r={22} fill="none" stroke={WHITE} strokeWidth={2} strokeDasharray="2 2" />
        <Path d="M-8 0 L-2 6 L9 -6" stroke={WHITE} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </IllustrationFrame>
  );
}

// ─── 6. EMPTY NO ACTIVE: figure waiting with a clock ─────────────────
export function EmptyNoActiveSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Stylised clock: circle with hands */}
      <Circle cx={100} cy={90} r={32} fill={WHITE} stroke={NAVY} strokeWidth={3} />
      <Circle cx={100} cy={90} r={28} fill="none" stroke={NAVY} strokeWidth={1} opacity={0.3} />
      {/* Tick marks at 12, 3, 6, 9 */}
      <Line x1={100} y1={64} x2={100} y2={68} stroke={NAVY} strokeWidth={2} />
      <Line x1={126} y1={90} x2={122} y2={90} stroke={NAVY} strokeWidth={2} />
      <Line x1={100} y1={116} x2={100} y2={112} stroke={NAVY} strokeWidth={2} />
      <Line x1={74} y1={90} x2={78} y2={90} stroke={NAVY} strokeWidth={2} />
      {/* Hour + minute hands */}
      <Line x1={100} y1={90} x2={100} y2={75} stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
      <Line x1={100} y1={90} x2={115} y2={90} stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={100} cy={90} r={3} fill={NAVY} />

      {/* Small package sitting below: waiting to be picked up */}
      <Rect x={84} y={140} width={32} height={22} rx={2} fill={YELLOW} stroke={DARK} strokeWidth={1.5} />
      <Line x1={100} y1={140} x2={100} y2={162} stroke={DARK} strokeWidth={1} />
      <Line x1={84} y1={151} x2={116} y2={151} stroke={DARK} strokeWidth={1} />
    </IllustrationFrame>
  );
}

// ─── 7. EMPTY NO DELIVERIES: friendly box with a "send" arrow ────────
export function EmptyNoDeliveriesSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Open box with arms (anthropomorphised: gives "friendly" feel) */}
      {/* Box body */}
      <Path d="M60 90 L140 90 L140 160 L60 160 Z" fill={YELLOW} stroke={DARK} strokeWidth={2} />
      {/* Open flaps */}
      <Path d="M60 90 L80 70 L100 90 Z" fill={YELLOW} stroke={DARK} strokeWidth={2} />
      <Path d="M100 90 L120 70 L140 90 Z" fill="#E6A800" stroke={DARK} strokeWidth={2} />

      {/* Cute face on the box: eyes + smile */}
      <Circle cx={82} cy={115} r={3} fill={DARK} />
      <Circle cx={118} cy={115} r={3} fill={DARK} />
      <Path d="M85 130 Q100 140 115 130" stroke={DARK} strokeWidth={2} fill="none" strokeLinecap="round" />

      {/* Small arrow pointing right (to the "Send" CTA) */}
      <G transform="translate(155 125)">
        <Line x1={-10} y1={0} x2={10} y2={0} stroke={BLUE} strokeWidth={3} strokeLinecap="round" />
        <Path d="M5 -5 L10 0 L5 5" stroke={BLUE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>

      {/* Tiny sparkle/star above the box */}
      <Path
        d="M150 60 L152 65 L157 67 L152 69 L150 74 L148 69 L143 67 L148 65 Z"
        fill={ORANGE}
      />
    </IllustrationFrame>
  );
}

// ─── 8. EMPTY NO CARDS: card flipping over with a + ──────────────────
export function EmptyNoCardsSvg({ size = 140 }: SvgIllustrationProps) {
  return (
    <IllustrationFrame size={size}>
      <Circle cx={100} cy={100} r={75} fill={BG} />

      {/* Two cards stacked: back card slightly rotated */}
      <G transform="translate(100 105) rotate(-10) translate(-50 -32)">
        <Rect x={0} y={0} width={100} height={64} rx={8} fill={NAVY} opacity={0.4} />
      </G>

      {/* Front card */}
      <G transform="translate(100 100) rotate(5) translate(-50 -32)">
        <Rect x={0} y={0} width={100} height={64} rx={8} fill={NAVY} />
        {/* Chip */}
        <Rect x={12} y={20} width={14} height={11} rx={2} fill={YELLOW} />
        {/* Card number dots */}
        <Circle cx={36} cy={26} r={1.5} fill={WHITE} />
        <Circle cx={42} cy={26} r={1.5} fill={WHITE} />
        <Circle cx={48} cy={26} r={1.5} fill={WHITE} />
        <Circle cx={54} cy={26} r={1.5} fill={WHITE} />
        <Circle cx={62} cy={26} r={1.5} fill={WHITE} />
        <Circle cx={68} cy={26} r={1.5} fill={WHITE} />
        {/* Card brand */}
        <Circle cx={78} cy={46} r={5} fill={ORANGE} />
        <Circle cx={86} cy={46} r={5} fill={YELLOW} opacity={0.8} />
        {/* "Empty" indicator on card */}
        <Rect x={12} y={42} width={28} height={3} rx={1} fill={WHITE} opacity={0.4} />
        <Rect x={12} y={48} width={20} height={3} rx={1} fill={WHITE} opacity={0.4} />
      </G>

      {/* Floating "+" badge in the top-right */}
      <Circle cx={155} cy={65} r={16} fill={GREEN} />
      <Line x1={155} y1={58} x2={155} y2={72} stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
      <Line x1={148} y1={65} x2={162} y2={65} stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
    </IllustrationFrame>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
