import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

type Mode = 'card' | 'bank';

export default function AddPaymentScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [mode,    setMode]    = useState<Mode>('card');
  const [number,  setNumber]  = useState('');
  const [expiry,  setExpiry]  = useState('');
  const [cvv,     setCvv]     = useState('');
  const [name,    setName]    = useState('');
  const [saving,  setSaving]  = useState(false);

  const formatCard = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})/g, '$1 ').trim();
  };

  const formatExpiry = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      router.back();
    }, 1500);
  };

  const isValid = mode === 'card'
    ? number.replace(/\s/g, '').length === 16 && expiry.length === 5 && cvv.length >= 3 && name.trim().length > 0
    : true;

  const inputStyle = [styles.input, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, color: theme.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Add Payment Method</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Mode selector */}
          <View style={[styles.modeRow, { backgroundColor: theme.surfaceSecond }]}>
            {(['card', 'bank'] as Mode[]).map(m => (
              <Pressable
                key={m}
                style={[styles.modeBtn, mode === m && { backgroundColor: theme.primary }]}
                onPress={() => setMode(m)}
              >
                <Ionicons
                  name={m === 'card' ? 'card-outline' : 'business-outline'}
                  size={16}
                  color={mode === m ? '#fff' : theme.textSecond}
                />
                <Text style={[styles.modeBtnText, { color: mode === m ? '#fff' : theme.textSecond }]}>
                  {m === 'card' ? 'Debit / Credit Card' : 'Bank Transfer'}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'card' ? (
            <View style={styles.form}>
              {/* Card number */}
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Card Number</Text>
                <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                  <Ionicons name="card-outline" size={18} color={theme.textThird} />
                  <TextInput
                    style={[styles.inputInner, { color: theme.text }]}
                    placeholder="0000 0000 0000 0000"
                    placeholderTextColor={theme.textThird}
                    keyboardType="number-pad"
                    value={number}
                    onChangeText={t => setNumber(formatCard(t))}
                    maxLength={19}
                  />
                </View>
              </View>

              {/* Expiry + CVV */}
              <View style={styles.row}>
                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Expiry Date</Text>
                  <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.textThird} />
                    <TextInput
                      style={[styles.inputInner, { color: theme.text }]}
                      placeholder="MM/YY"
                      placeholderTextColor={theme.textThird}
                      keyboardType="number-pad"
                      value={expiry}
                      onChangeText={t => setExpiry(formatExpiry(t))}
                      maxLength={5}
                    />
                  </View>
                </View>
                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>CVV</Text>
                  <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                    <Ionicons name="lock-closed-outline" size={18} color={theme.textThird} />
                    <TextInput
                      style={[styles.inputInner, { color: theme.text }]}
                      placeholder="•••"
                      placeholderTextColor={theme.textThird}
                      keyboardType="number-pad"
                      secureTextEntry
                      value={cvv}
                      onChangeText={t => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>

              {/* Cardholder name */}
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Cardholder Name</Text>
                <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
                  <Ionicons name="person-outline" size={18} color={theme.textThird} />
                  <TextInput
                    style={[styles.inputInner, { color: theme.text }]}
                    placeholder="As on card"
                    placeholderTextColor={theme.textThird}
                    autoCapitalize="words"
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              {/* Security note */}
              <View style={[styles.secNote, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} />
                <Text style={[styles.secNoteText, { color: theme.textSecond }]}>
                  Your card details are encrypted and processed securely by Flutterwave. We never store your full card number.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.bankInfo, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.bankTitle, { color: theme.text }]}>Bank Transfer Details</Text>
              <Text style={[styles.bankDesc, { color: theme.textSecond }]}>
                Transfer any amount to the account below. Your wallet will be credited automatically within 5 minutes.
              </Text>
              {[
                { label: 'Bank',           value: 'Providus Bank' },
                { label: 'Account Name',   value: 'SEIRS Logistics Ltd' },
                { label: 'Account Number', value: '5001234567' },
              ].map(r => (
                <View key={r.label} style={[styles.bankRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.bankRowLabel, { color: theme.textSecond }]}>{r.label}</Text>
                  <Text style={[styles.bankRowValue, { color: theme.text }]}>{r.value}</Text>
                </View>
              ))}
              <Pressable style={[styles.copyBtn, { borderColor: theme.primary, backgroundColor: isDark ? '#001020' : '#EFF6FF' }]}>
                <Ionicons name="copy-outline" size={16} color={theme.primary} />
                <Text style={[styles.copyBtnText, { color: theme.primary }]}>Copy Account Number</Text>
              </Pressable>
            </View>
          )}

        </ScrollView>

        {/* CTA */}
        <View style={[styles.cta, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <Button
            label={mode === 'card' ? 'Add Card' : 'I Have Transferred'}
            onPress={handleSave}
            loading={saving}
            disabled={mode === 'card' && !isValid}
            size="lg"
            fullWidth
            leftIcon={<Ionicons name={mode === 'card' ? 'card' : 'checkmark-circle-outline'} size={18} color="#fff" />}
          />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xl },

  modeRow: { flexDirection: 'row', borderRadius: Radius.full, padding: 4, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.full },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  form:       { gap: Spacing.md },
  row:        { flexDirection: 'row', gap: Spacing.md },
  fieldWrap:  { gap: 6 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, height: 52 },
  inputInner: { flex: 1, fontSize: FontSize.base },
  input:      { borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, height: 52, fontSize: FontSize.base },

  secNote:     { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  secNoteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  bankInfo:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  bankTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  bankDesc:      { fontSize: FontSize.sm, lineHeight: 20 },
  bankRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, borderTopWidth: 1, marginTop: Spacing.xs },
  bankRowLabel:  { fontSize: FontSize.sm },
  bankRowValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, marginTop: Spacing.sm },
  copyBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  cta: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});
