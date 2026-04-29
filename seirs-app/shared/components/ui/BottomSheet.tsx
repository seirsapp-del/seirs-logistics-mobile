import {
  Modal, View, Text, Pressable, StyleSheet,
  Animated, Dimensions, ScrollView,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Colors, Radius, FontSize, FontWeight, Spacing, Shadows } from '../../theme/index';

const { height: SCREEN_H } = Dimensions.get('window');

interface BottomSheetProps {
  visible:    boolean;
  onClose:    () => void;
  title?:     string;
  children:   React.ReactNode;
  snapHeight?: number | 'auto';
  scrollable?: boolean;
}

export function BottomSheet({
  visible, onClose, title, children,
  snapHeight = SCREEN_H * 0.55, scrollable = false,
}: BottomSheetProps) {
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const anim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue:  visible ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start();
  }, [visible]);

  const translateY = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [typeof snapHeight === 'number' ? snapHeight : 500, 0],
  });

  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  if (!visible) return null;

  const Content = scrollable ? ScrollView : View;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.surface,
            transform: [{ translateY }],
            ...(typeof snapHeight === 'number' ? { height: snapHeight } : {}),
          },
          Shadows.lg,
        ]}
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
        </View>

        {/* Title */}
        {title && (
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        )}

        {/* Content */}
        <Content style={styles.content} {...(scrollable ? { showsVerticalScrollIndicator: false } : {})}>
          {children}
        </Content>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius:  Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
});
