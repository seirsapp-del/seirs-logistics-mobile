import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { request } from '@seirs/shared/services/api';
import { useColors } from '@/context/ThemeContext';

// Spec V8 Tier 3 — developer console for API keys. Live + test key
// management for SEIRS-as-a-platform integrators. Secret is shown
// ONCE on creation and never again.

interface ApiKey {
  id:        string;
  publicKey: string;
  mode:      'live' | 'test';
  name:      string;
  active:    boolean;
  callsToday: number;
  createdAt: string;
}

export default function ApiKeysScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [keys,    setKeys]    = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<'live' | 'test'>('test');
  const [creatingNew, setCreatingNew] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ publicKey: string; secret: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await request<ApiKey[]>('GET', '/dev-platform/keys');
      setKeys(Array.isArray(list) ? list : []);
    } catch { setKeys([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) { Alert.alert('Name required'); return; }
    setCreatingNew(true);
    try {
      const res = await request<{ publicKey: string; secret: string }>(
        'POST', '/dev-platform/keys', { name: newName.trim(), mode: newMode },
      );
      setRevealedSecret({ publicKey: res.publicKey, secret: res.secret });
      setNewName('');
      setCreating(false);
      load();
    } catch (e: any) {
      Alert.alert('Could not create key', e?.message ?? 'Try again.');
    } finally {
      setCreatingNew(false);
    }
  };

  const revoke = (key: ApiKey) => {
    Alert.alert(
      'Revoke key',
      `Apps using ${key.publicKey} will stop working immediately. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await request('DELETE', `/dev-platform/keys/${key.id}`);
              load();
            } catch (e: any) {
              Alert.alert('Could not revoke', e?.message ?? 'Try again.');
            }
          },
        },
      ],
    );
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>API Keys</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>

          <View style={[styles.intro, { backgroundColor: colors.accent + '15' }]}>
            <Icon name="Key" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: colors.text }]}>SEIRS Developer Platform</Text>
              <Text style={[styles.introSub, { color: colors.textSecond }]}>
                Use these keys to integrate SEIRS as your logistics layer. Test keys (sk_test_) hit a sandbox; live keys (sk_live_) charge real money.
              </Text>
            </View>
          </View>

          {/* Revealed-once secret */}
          {revealedSecret && (
            <View style={[styles.card, { borderColor: '#16A34A', backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.cardLabel, { color: '#16A34A' }]}>SECRET — SHOWN ONCE</Text>
              <Text style={styles.secretMonospace}>{revealedSecret.secret}</Text>
              <Pressable onPress={() => copy(revealedSecret.secret)} style={styles.copyBtn}>
                <Icon name="Copy" size={14} color="#fff" />
                <Text style={styles.copyBtnText}>Copy secret</Text>
              </Pressable>
              <Text style={styles.warnMonospace}>Save this securely — you can&apos;t retrieve it again.</Text>
              <Pressable onPress={() => setRevealedSecret(null)} style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>I&apos;ve saved it — dismiss</Text>
              </Pressable>
            </View>
          )}

          {creating ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.textSecond }]}>NEW KEY</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder='e.g. "Production server"' placeholderTextColor={colors.textThird} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
              <View style={styles.modeRow}>
                {(['test','live'] as const).map(m => {
                  const on = newMode === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setNewMode(m)}
                      style={[
                        styles.modeChip,
                        { borderColor: colors.border },
                        on && { borderColor: colors.accent, backgroundColor: colors.accent },
                      ]}
                    >
                      <Text style={[styles.modeText, { color: colors.textSecond }, on && { color: '#fff' }]}>
                        {m === 'test' ? 'Test' : 'Live'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.row}>
                <Pressable onPress={() => setCreating(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecond }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={create} disabled={creatingNew} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
                  {creatingNew ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={[styles.addBtn, { borderColor: colors.accent }]}>
              <Icon name="Plus" size={16} color={colors.accent} />
              <Text style={[styles.addBtnText, { color: colors.accent }]}>Issue new key</Text>
            </Pressable>
          )}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : keys.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Key" size={32} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textSecond }]}>No keys yet. Issue your first one above.</Text>
            </View>
          ) : (
            keys.map(k => (
              <View key={k.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !k.active && { opacity: 0.5 }]}>
                <View style={styles.keyTop}>
                  <Text style={[styles.modePill, { backgroundColor: k.mode === 'live' ? '#16A34A18' : '#D9770618', color: k.mode === 'live' ? '#16A34A' : '#D97706' }]}>
                    {k.mode === 'live' ? 'LIVE' : 'TEST'}
                  </Text>
                  <Text style={[styles.keyName, { color: colors.text }]}>{k.name}</Text>
                  {k.active
                    ? <Pressable onPress={() => revoke(k)}><Icon name="Trash2" size={14} color="#DC2626" /></Pressable>
                    : <Text style={styles.revokedText}>REVOKED</Text>
                  }
                </View>
                <View style={[styles.keyRow, { backgroundColor: colors.surfaceSecond }]}>
                  <Text style={[styles.publicMonospace, { color: colors.text }]} numberOfLines={1}>{k.publicKey}</Text>
                  <Pressable onPress={() => copy(k.publicKey)}><Icon name="Copy" size={14} color={colors.accent} /></Pressable>
                </View>
                <Text style={[styles.metaText, { color: colors.textThird }]}>{k.callsToday ?? 0} calls today</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700' },

  content:   { padding: 16, gap: 12 },

  intro:     { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 12, alignItems: 'center' },
  introTitle:{ fontSize: 14, fontWeight: '700', marginBottom: 2 },
  introSub:  { fontSize: 12, lineHeight: 17 },

  card:      { borderRadius: 12, padding: 14, gap: 10, borderWidth: 1 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Secret reveal stays green — semantic "saved successfully" color
  secretMonospace: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, color: '#0F2B4C', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8 },
  warnMonospace:   { fontSize: 11, color: '#92400E' },
  copyBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#16A34A' },
  copyBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  dismissBtn: { paddingVertical: 8, alignItems: 'center' },
  dismissBtnText:{ fontSize: 13, color: '#16A34A', fontWeight: '600' },

  input:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modeRow:   { flexDirection: 'row', gap: 8 },
  modeChip:  { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
  modeText:  { fontSize: 13, fontWeight: '700' },
  row:       { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  cancelBtnText:{ fontSize: 14, fontWeight: '600' },
  primaryBtn:{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addBtnText:{ fontSize: 14, fontWeight: '700' },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13 },

  keyTop:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modePill:  { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  keyName:   { flex: 1, fontSize: 14, fontWeight: '700' },
  revokedText:{ fontSize: 10, fontWeight: '800', color: '#DC2626' },
  keyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8 },
  publicMonospace: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
  metaText:  { fontSize: 11 },
});
