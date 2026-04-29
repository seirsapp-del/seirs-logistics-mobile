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

const COLORS = ['#3A86FF', '#2EC4B6', '#FF6B00', '#8B5CF6', '#22C55E', '#EF4444'];
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
