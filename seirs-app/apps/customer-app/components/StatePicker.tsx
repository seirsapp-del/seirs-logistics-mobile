/**
 * StatePicker: Nigerian state dropdown for register / address forms.
 *
 * Tappable field that opens a full-screen modal with a searchable list.
 * Better UX than a native Picker (which is wildly inconsistent across
 * Android versions) and works inside ScrollView without focus quirks.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { NIGERIAN_STATES } from '@/constants/nigerian-states';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

interface Props {
  label?:    string;
  value:     string;
  onChange:  (state: string) => void;
  placeholder?: string;
}

export function StatePicker({ label, value, onChange, placeholder = 'Select state' }: Props) {
  /**
   * Hardcoded light styles rendered this as a white box on the dark
   * business form, the same break the street field had (2026-08-16).
   */
  const cs     = useColorScheme();
  const colors = Colors[cs ?? 'light'];
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return NIGERIAN_STATES;
    return NIGERIAN_STATES.filter(s => s.toLowerCase().includes(q));
  }, [search]);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      {!!label && <Text style={[styles.label, { color: colors.textSecond }]}>{label}</Text>}
      <Pressable style={[styles.trigger, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, { color: colors.text }, !value && styles.triggerPlaceholder]}>
          {value || placeholder}
        </Text>
        <Icon name="ChevronDown" size={16} color="#9CA3AF" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.modal, { paddingTop: insets.top, backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surfaceSecond, borderBottomColor: colors.border }]}>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Icon name="X" size={22} color={colors.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{tx('auto.StatePicker.selectState', 'Select State')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecond, borderColor: colors.border }]}>
            <Icon name="Search" size={16} color={colors.textThird} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder={tx('auto.StatePicker.searchState', 'Search state…')}
              placeholderTextColor={colors.textThird}
              autoFocus
            />
          </View>

          <FlatList
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ paddingBottom: 40 }}
            data={filtered}
            keyExtractor={(s) => s}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{tr('auto.statepicker.noStateMatches', 'No state matches “')}{search}”.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, { backgroundColor: colors.surfaceSecond, borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surfaceSecond }]}
                onPress={() => pick(item)}
              >
                <Text style={[styles.rowText, { color: colors.text }, value === item && [styles.rowTextActive, { color: colors.primary }]]}>{item}</Text>
                {value === item && <Icon name="Check" size={16} color={colors.accent} />}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label:    { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  trigger:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, height: 52,
    borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 14,
  },
  triggerText:         { fontSize: 15, color: '#0F2B4C' },
  triggerPlaceholder:  { color: '#9CA3AF' },

  modal:        { flex: 1, backgroundColor: '#F5F5F0' },
  modalHeader:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  closeBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: '#0F2B4C' },
  searchWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', margin: 16, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0F2B4C' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  rowPressed:    { backgroundColor: '#F3F4F6' },
  rowText:       { fontSize: 15, color: '#0F2B4C' },
  rowTextActive: { fontWeight: '700', color: '#3A7BD5' },
  empty:         { padding: 40, alignItems: 'center' },
  emptyText:     { fontSize: 14, color: '#9CA3AF' },
});
