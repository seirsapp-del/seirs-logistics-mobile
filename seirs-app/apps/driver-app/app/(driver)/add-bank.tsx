import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { NIGERIAN_BANKS } from '@/constants/driverMockData';

export default function AddBankScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [selectedBank,   setSelectedBank]   = useState('');
  const [accountNumber,  setAccountNumber]  = useState('');
  const [accountName,    setAccountName]    = useState('');
  const [bankModalOpen,  setBankModalOpen]  = useState(false);
  const [bankSearch,     setBankSearch]     = useState('');
  const [verifying,      setVerifying]      = useState(false);
  const [verified,       setVerified]       = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [done,           setDone]           = useState(false);

  const filteredBanks = NIGERIAN_BANKS.filter(b => b.toLowerCase().includes(bankSearch.toLowerCase()));

  const handleVerify = () => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    setVerifying(true);
    setTimeout(() => {
      setAccountName('Chidi Okonkwo');
      setVerifying(false);
      setVerified(true);
    }, 1200);
  };

  const canSave = verified && selectedBank && accountNumber.length === 10;

  const handleSave = () => {
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setDone(true); }, 1000);
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
        <View style={[styles.successCircle, { backgroundColor: '#22C55E18' }]}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
        </View>
        <Text style={[styles.successTitle, { color: theme.text }]}>Bank Added!</Text>
        <Text style={[styles.successSub, { color: theme.textSecond }]}>{selectedBank} account ending in {accountNumber.slice(-4)} has been saved.</Text>
        <Pressable style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Add Bank Account</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Bank selector */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Bank</Text>
            <Pressable
              style={[styles.selectBtn, { backgroundColor: theme.surface, borderColor: selectedBank ? theme.primary : theme.border }, Shadows.xs]}
              onPress={() => setBankModalOpen(true)}
            >
              <Ionicons name="business-outline" size={18} color={selectedBank ? theme.primary : theme.textThird} />
              <Text style={[styles.selectText, { color: selectedBank ? theme.text : theme.textThird }]}>
                {selectedBank || 'Select bank…'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.textThird} />
            </Pressable>
          </View>

          {/* Account number */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecond }]}>Account Number</Text>
            <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="10-digit NUBAN"
                placeholderTextColor={theme.textThird}
                keyboardType="numeric"
                maxLength={10}
                value={accountNumber}
                onChangeText={v => { setAccountNumber(v); setVerified(false); setAccountName(''); }}
              />
              {accountNumber.length === 10 && selectedBank && !verified && (
                <Pressable style={[styles.verifyBtn, { backgroundColor: theme.primary }]} onPress={handleVerify}>
                  <Text style={styles.verifyBtnText}>{verifying ? 'Checking…' : 'Verify'}</Text>
                </Pressable>
              )}
              {verified && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
            </View>
            <Text style={[styles.hint, { color: theme.textThird }]}>{accountNumber.length}/10 digits</Text>
          </View>

          {/* Account name (auto-filled) */}
          {accountName ? (
            <View style={[styles.nameCard, { backgroundColor: isDark ? '#001800' : '#F0FDF4', borderColor: '#22C55E30' }]}>
              <Ionicons name="person-circle-outline" size={20} color="#22C55E" />
              <View>
                <Text style={[styles.nameLabel, { color: theme.textThird }]}>Account Name</Text>
                <Text style={[styles.nameValue, { color: '#22C55E' }]}>{accountName}</Text>
              </View>
            </View>
          ) : null}

          {/* Info note */}
          <View style={[styles.infoNote, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.textThird} />
            <Text style={[styles.infoText, { color: theme.textSecond }]}>
              Your bank details are encrypted and used only for withdrawal processing.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save CTA */}
      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: canSave ? theme.primary : theme.surfaceSecond }]}
          onPress={handleSave}
          disabled={!canSave || submitting}
        >
          <Ionicons name="save-outline" size={20} color={canSave ? '#fff' : theme.textThird} />
          <Text style={[styles.saveBtnText, { color: canSave ? '#fff' : theme.textThird }]}>
            {submitting ? 'Saving…' : 'Save Bank Account'}
          </Text>
        </Pressable>
      </View>

      {/* Bank picker modal */}
      <Modal visible={bankModalOpen} transparent animationType="slide" onRequestClose={() => setBankModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Bank</Text>
            <View style={[styles.searchWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={16} color={theme.textThird} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search banks…"
                placeholderTextColor={theme.textThird}
                value={bankSearch}
                onChangeText={setBankSearch}
              />
            </View>
            <FlatList
              data={filteredBanks}
              keyExtractor={b => b}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.bankItem, { borderBottomColor: theme.border }]}
                  onPress={() => { setSelectedBank(item); setBankModalOpen(false); setBankSearch(''); setVerified(false); setAccountName(''); }}
                >
                  <Text style={[styles.bankItemText, { color: theme.text }]}>{item}</Text>
                  {selectedBank === item && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.lg },

  fieldGroup: { gap: Spacing.sm },
  label:      { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  selectText:{ flex: 1, fontSize: FontSize.base },

  inputRow:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, gap: Spacing.sm },
  input:      { flex: 1, fontSize: FontSize.base },
  verifyBtn:  { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  verifyBtnText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  hint:       { fontSize: FontSize.xs },

  nameCard:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  nameLabel: { fontSize: FontSize.xs },
  nameValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  infoNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  infoText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  ctaBar:    { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:   { height: 54, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  saveBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: FontSize.base },
  bankItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 0.5 },
  bankItemText: { fontSize: FontSize.base },

  successCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  successTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  successSub:    { fontSize: FontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  doneBtn:       { paddingHorizontal: Spacing.xl * 2, paddingVertical: Spacing.md, borderRadius: Radius.full },
  doneBtnText:   { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
