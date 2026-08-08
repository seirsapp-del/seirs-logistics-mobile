import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect, G, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Colors, FontSize, FontWeight, Radius, Shadows, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Custom SEIRS home hero — animated. No external dependencies beyond
 * react-native-svg + react-native-reanimated (both already installed).
 *
 * Composition (left → right across the hero):
 *   - A stylised okada (motorcycle) with a package strapped on the back
 *   - A dashed route line behind it
 *   - A destination pin at the right edge
 *   - The okada slides left → right on a 4 s loop; wheels rotate; the
 *     package wobbles subtly so the whole thing feels alive without
 *     screaming for attention
 *   - Brand mark + tagline overlay sit at the bottom
 *
 * All shapes are pure SVG — no images, no Lottie file, no network.
 * Animations use react-native-svg props (NOT React Native styles) since
 * SVG groups don't accept `style`. We drive everything via
 * `useAnimatedProps` returning the SVG `transform` prop.
 */

const AnimatedG = Animated.createAnimatedComponent(G);

const SCENE_WIDTH  = 360;
const SCENE_HEIGHT = 200;
const HORIZON_Y    = 130;
const RIDER_Y      = 100;

interface Props {
  tagline: string;
}

export function HomeHeroAnimated({ tagline }: Props) {
  const cs     = useColorScheme();
  const isDark = cs === 'dark';

  // Drives the okada's left→right slide (0 to 1, repeating).
  const slide      = useSharedValue(0);
  // Drives wheel rotation (0 to 1, repeating, much faster).
  const wheelRot   = useSharedValue(0);
  // Drives package bob (0 to 1, ping-pong, very subtle).
  const packageBob = useSharedValue(0);

  useEffect(() => {
    slide.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
    wheelRot.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
    packageBob.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [slide, wheelRot, packageBob]);

  // SVG transform props — must use animatedProps, not style. The
  // `transform` prop on react-native-svg's <G> accepts an array of
  // operations matching React Native's transform style.
  const okadaProps = useAnimatedProps(() => ({
    transform: [{ translateX: 40 + slide.value * (SCENE_WIDTH - 100) }],
  }));

  // Wheel rotation — rotate around the wheel's local centre. Each wheel
  // is already centred at (0,0) inside its own <G x={…} y={…}>, so a
  // plain rotate just spins it in place.
  const wheelProps = useAnimatedProps(() => ({
    transform: [{ rotate: `${wheelRot.value * 360}deg` }],
  }));

  // Package wobble — translateY only, very subtle (1.5 px).
  const packageProps = useAnimatedProps(() => ({
    transform: [{ translateY: packageBob.value * -1.5 }],
  }));

  // Brand surfaces.
  const skyTop     = isDark ? '#1C2128' : '#0F2B4C';
  const skyBottom  = isDark ? '#0D1117' : '#1A3A63';
  const accent     = '#3A86FF';
  const yellow     = '#FFBE0B';
  const routeColor = 'rgba(255,255,255,0.25)';

  return (
    <View style={[styles.wrap, Shadows.navy]}>
      <LinearGradient
        colors={[skyTop, skyBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Soft "sun" — gives the scene depth. */}
        <Circle cx={SCENE_WIDTH - 50} cy={40} r={18} fill="rgba(255,190,11,0.18)" />
        <Circle cx={SCENE_WIDTH - 50} cy={40} r={10} fill="rgba(255,190,11,0.30)" />

        {/* Faint horizon hills. */}
        <Path
          d={`M0 ${HORIZON_Y + 10} Q90 ${HORIZON_Y - 10} 180 ${HORIZON_Y + 5} T${SCENE_WIDTH} ${HORIZON_Y + 8} L${SCENE_WIDTH} ${SCENE_HEIGHT} L0 ${SCENE_HEIGHT} Z`}
          fill="rgba(255,255,255,0.04)"
        />

        {/* Dashed route line. */}
        <Line
          x1={20}
          y1={HORIZON_Y}
          x2={SCENE_WIDTH - 30}
          y2={HORIZON_Y}
          stroke={routeColor}
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
        />

        {/* Origin marker (left). */}
        <Circle cx={20} cy={HORIZON_Y} r={5} fill={accent} />
        <Circle cx={20} cy={HORIZON_Y} r={2.5} fill="#fff" />

        {/* Destination pin (right) — stylised teardrop. */}
        <G>
          <Path
            d={`M${SCENE_WIDTH - 30} ${HORIZON_Y - 18}
                C${SCENE_WIDTH - 22} ${HORIZON_Y - 18},
                 ${SCENE_WIDTH - 22} ${HORIZON_Y - 6},
                 ${SCENE_WIDTH - 30} ${HORIZON_Y}
                C${SCENE_WIDTH - 38} ${HORIZON_Y - 6},
                 ${SCENE_WIDTH - 38} ${HORIZON_Y - 18},
                 ${SCENE_WIDTH - 30} ${HORIZON_Y - 18} Z`}
            fill={yellow}
          />
          <Circle cx={SCENE_WIDTH - 30} cy={HORIZON_Y - 13} r={3} fill={skyTop} />
        </G>

        {/* The okada — slides left to right via animatedProps. */}
        <AnimatedG animatedProps={okadaProps}>
          {/* Rear wheel */}
          <G x={-22} y={RIDER_Y + 16}>
            <Circle cx={0} cy={0} r={9} fill="#0D1117" />
            <AnimatedG animatedProps={wheelProps}>
              <Line x1={-6} y1={0} x2={6} y2={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
              <Line x1={0} y1={-6} x2={0} y2={6} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
            </AnimatedG>
            <Circle cx={0} cy={0} r={2.5} fill="rgba(255,255,255,0.6)" />
          </G>

          {/* Front wheel */}
          <G x={22} y={RIDER_Y + 16}>
            <Circle cx={0} cy={0} r={9} fill="#0D1117" />
            <AnimatedG animatedProps={wheelProps}>
              <Line x1={-6} y1={0} x2={6} y2={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
              <Line x1={0} y1={-6} x2={0} y2={6} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
            </AnimatedG>
            <Circle cx={0} cy={0} r={2.5} fill="rgba(255,255,255,0.6)" />
          </G>

          {/* Frame — connects the two wheels. */}
          <Path
            d={`M${-22} ${RIDER_Y + 8}
                L${-6}  ${RIDER_Y - 2}
                L${10}  ${RIDER_Y - 2}
                L${22}  ${RIDER_Y + 8}`}
            stroke={accent}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Fuel tank */}
          <Path
            d={`M${-4} ${RIDER_Y - 4} L${10} ${RIDER_Y - 4} L${8} ${RIDER_Y + 2} L${-4} ${RIDER_Y + 2} Z`}
            fill={accent}
          />
          {/* Handlebar */}
          <Line x1={22} y1={RIDER_Y + 8} x2={26} y2={RIDER_Y - 8} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          <Line x1={22} y1={RIDER_Y - 8} x2={30} y2={RIDER_Y - 8} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />

          {/* Rider — Nigerian, in high-vis orange vest + dark helmet.
              Skin tone is brown (not white), authentic Lagos okada look:
              real riders wear bright vests for visibility and dark
              half-helmets. The helmet stripe is SEIRS blue so the
              brand reads even on the small character. */}
          {/* High-vis orange vest (torso) */}
          <Path
            d={`M${0} ${RIDER_Y - 4}
                C${-4} ${RIDER_Y - 14}, ${4} ${RIDER_Y - 18}, ${6} ${RIDER_Y - 14}
                L${10} ${RIDER_Y - 4}
                Z`}
            fill="#FF6B00"
            stroke="#0D1117"
            strokeWidth={0.5}
          />
          {/* Reflective stripe across the vest — classic Lagos vest detail */}
          <Line
            x1={-2} y1={RIDER_Y - 9}
            x2={8}  y2={RIDER_Y - 9}
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={1}
          />
          {/* Right arm reaching forward to the handlebar — shows skin */}
          <Line
            x1={6}  y1={RIDER_Y - 10}
            x2={22} y2={RIDER_Y - 2}
            stroke="#7B4F2C"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Head — Nigerian skin tone */}
          <Circle cx={3} cy={RIDER_Y - 22} r={6} fill="#7B4F2C" />
          {/* Helmet — solid dark cap covering the top half of the head */}
          <Path
            d={`M${-3} ${RIDER_Y - 22} A6 6 0 0 1 ${9} ${RIDER_Y - 22} Z`}
            fill="#0D1117"
          />
          {/* SEIRS-blue brand stripe on the helmet */}
          <Path
            d={`M${-2} ${RIDER_Y - 25} Q${3} ${RIDER_Y - 27}, ${8} ${RIDER_Y - 25}`}
            stroke={accent}
            strokeWidth={1.5}
            fill="none"
          />

          {/* Package — wobbles via animatedProps. Yellow pops on navy. */}
          <AnimatedG animatedProps={packageProps}>
            <Rect
              x={-22}
              y={RIDER_Y - 14}
              width={16}
              height={14}
              rx={1.5}
              fill={yellow}
              stroke="#0D1117"
              strokeWidth={1}
            />
            <Line x1={-14} y1={RIDER_Y - 14} x2={-14} y2={RIDER_Y} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
            <Line x1={-22} y1={RIDER_Y - 7}  x2={-6}  y2={RIDER_Y - 7} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
          </AnimatedG>
        </AnimatedG>
      </Svg>

      {/* Brand mark + tagline overlay. */}
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.brand}>SEIRS</Text>
        <Text style={styles.tag}>{tagline}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    height: 200,
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
    backgroundColor: 'rgba(15,43,76,0.55)',
  },
  brand: {
    color: '#fff',
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    letterSpacing: 2,
  },
  tag: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
});
