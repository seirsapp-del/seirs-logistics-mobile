import { View, Text, StyleSheet } from 'react-native';
import { FontSize, FontWeight, Radius, Spacing } from '../../theme/index';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';

const COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: '#E5E7EB', text: '#6B7280' },
  success: { bg: '#DCFCE7', text: '#15803D' },
  warning: { bg: '#FEF9C3', text: '#A16207' },
  error:   { bg: '#FEE2E2', text: '#B91C1C' },
  info:    { bg: '#DBEAFE', text: '#1D4ED8' },
  purple:  { bg: '#F3E8FF', text: '#7C3AED' },
};

const DARK_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: '#222222', text: '#A1A1AA' },
  success: { bg: '#052E16', text: '#4ADE80' },
  warning: { bg: '#1C1300', text: '#FCD34D' },
  error:   { bg: '#2D0000', text: '#F87171' },
  info:    { bg: '#001234', text: '#60A5FA' },
  purple:  { bg: '#1E0040', text: '#C084FC' },
};

interface BadgeProps {
  label:    string;
  variant?: BadgeVariant;
  isDark?:  boolean;
  size?:    'sm' | 'md';
}

export function Badge({ label, variant = 'default', isDark = false, size = 'sm' }: BadgeProps) {
  const colors = isDark ? DARK_COLORS[variant] : COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, size === 'md' && styles.badgeMd]}>
      <Text style={[styles.text, { color: colors.text }, size === 'md' && styles.textMd]}>
        {label}
      </Text>
    </View>
  );
}

// Count dot (unread indicator)
export function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.countDot}>
      <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  badgeMd: { paddingHorizontal: 12, paddingVertical: 5 },
  text:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  textMd: { fontSize: FontSize.sm },
  countDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  countText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
});
