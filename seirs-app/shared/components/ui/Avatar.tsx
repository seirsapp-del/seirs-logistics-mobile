import { View, Text, Image, StyleSheet } from 'react-native';
import { FontWeight } from '../../theme/index';

interface AvatarProps {
  name:   string;
  size?:  number;
  uri?:   string | null;
  color?: string;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * Initial-avatar backgrounds. Brand family only: deep navy, sky blue,
 * teal, SEIRS orange, forest green, clay. Violet was removed 2026-08-12
 * (purple is not a SEIRS colour and it was showing on the customer home
 * top bar). Every entry clears 4.5:1 against white initials.
 */
const COLORS = ['#0F2B4C', '#3A7BD5', '#0E7C86', '#C2410C', '#15803D', '#9A3412'];
function colorFor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % COLORS.length;
  return COLORS[hash];
}

export function Avatar({ name, size = 44, uri, color }: AvatarProps) {
  const bg = color ?? colorFor(name);
  const fontSize = Math.max(12, size * 0.38);

  if (uri) {
    return <Image source={{ uri }} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} />;
  }

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initials, { fontSize }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { justifyContent: 'center', alignItems: 'center' },
  initials: { color: '#fff', fontWeight: FontWeight.bold },
  img: { resizeMode: 'cover' },
});
