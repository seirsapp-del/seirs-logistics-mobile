import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Amber banner rendered above the main tab stack whenever the current user
// has a pending deletion. Tapping Cancel hits the backend, clears the
// AuthContext state, and the banner disappears. No banner = no deletion
// pending. Kept intentionally compact so it stays out of the way but is
// impossible to miss.
export function DeletionPendingBanner() {
  const { pendingDeletion, cancelPendingDeletion } = useAuth();
  const cs = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const [busy, setBusy] = useState(false);

  if (!pendingDeletion) return null;

  const scheduled = new Date(pendingDeletion.scheduledAt);
  const daysLeft = Math.max(0, Math.ceil((scheduled.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const dateLabel = scheduled.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

  const handleCancel = () => {
    Alert.alert(
      'Cancel account deletion?',
      'Your account will stay active and none of your data will be removed.',
      [
        { text: 'Keep deleting', style: 'cancel' },
        {
          text: 'Cancel deletion',
          style: 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await cancelPendingDeletion();
            } catch (e: any) {
              Alert.alert('Could not cancel', e?.message ?? 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: '#FEF3C7', borderBottomColor: '#FCD34D' }]}>
      <AlertTriangle size={16} color="#92400E" strokeWidth={2.5} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={styles.title}>
          Account deletion pending
        </Text>
        <Text style={styles.sub}>
          Your account will be permanently deleted on {dateLabel}
          {daysLeft > 0 ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)` : ''}.
        </Text>
      </View>
      <Pressable
        onPress={handleCancel}
        disabled={busy}
        style={[styles.btn, busy && { opacity: 0.5 }]}
      >
        <Text style={styles.btnText}>{busy ? '…' : 'Cancel'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#78350F' },
  sub:   { fontSize: FontSize.xs, color: '#78350F', marginTop: 1, lineHeight: 15 },
  btn:   { backgroundColor: '#78350F', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, marginLeft: 8 },
  btnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
});
