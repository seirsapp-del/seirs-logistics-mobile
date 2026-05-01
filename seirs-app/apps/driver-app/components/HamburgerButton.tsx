import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AlignLeft } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Drawer } from '@/components/Drawer';

interface Props {
  color?: string;
  size?:  number;
}

/**
 * Self-contained hamburger button + drawer.
 * Drop into any screen header for the universal menu.
 */
export function HamburgerButton({ color, size = 22 }: Props) {
  const [open, setOpen] = useState(false);
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  return (
    <>
      <Pressable style={styles.btn} onPress={() => setOpen(true)} hitSlop={8}>
        <AlignLeft size={size} color={color ?? theme.text} strokeWidth={2} />
      </Pressable>
      <Drawer visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40, height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
