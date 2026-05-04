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
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>API Keys</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>

          <View style={styles.intro}>
            <Icon name="Key" size={20} color="#3A7BD5" />
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitle}>SEIRS Developer Platform</Text>
              <Text style={styles.introSub}>
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

          {/* Create new */}
          {creating ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>NEW KEY</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder='e.g. "Production server"' placeholderTextColor="#9CA3AF" style={styles.input} />
              <View style={styles.modeRow}>
                {(['test','live'] as const).map(m => (
                  <Pressable
                    key={m}
                    onPress={() => setNewMode(m)}
                    style={[styles.modeChip, newMode === m && styles.modeChipOn]}
                  >
                    <Text style={[styles.modeText, newMode === m && styles.modeTextOn]}>
                      {m === 'test' ? 'Test' : 'Live'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                <Pressable onPress={() => setCreating(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={create} disabled={creatingNew} style={styles.primaryBtn}>
                  {creatingNew ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={styles.addBtn}>
              <Icon name="Plus" size={16} color="#3A7BD5" />
              <Text style={styles.addBtnText}>Issue new key</Text>
            </Pressable>
          )}

          {loading ? (
            <ActivityIndicator color="#3A7BD5" style={{ marginTop: 32 }} />
          ) : keys.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Key" size={32} color="#D1D5DB" />
              <Text style={styles.emptyText}>No keys yet. Issue your first one above.</Text>
            </View>
          ) : (
            keys.map(k => (
              <View key={k.id} style={[styles.card, !k.active && { opacity: 0.5 }]}>
                <View style={styles.keyTop}>
                  <Text style={[styles.modePill, { backgroundColor: k.mode === 'live' ? '#16A34A18' : '#D9770618', color: k.mode === 'live' ? '#16A34A' : '#D97706' }]}>
                    {k.mode === 'live' ? 'LIVE' : 'TEST'}
                  </Text>
                  <Text style={styles.keyName}>{k.name}</Text>
                  {k.active
                    ? <Pressable onPress={() => revoke(k)}><Icon name="Trash2" size={14} color="#DC2626" /></Pressable>
                    : <Text style={styles.revokedText}>REVOKED</Text>
                  }
                </View>
                <View style={styles.keyRow}>
                  <Text style={styles.publicMonospace} numberOfLines={1}>{k.publicKey}</Text>
                  <Pressable onPress={() => copy(k.publicKey)}><Icon name="Copy" size={14} color="#3A7BD5" /></Pressable>
                </View>
                <Text style={styles.metaText}>{k.callsToday ?? 0} calls today</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  content:   { padding: 16, gap: 12 },

  intro:     { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#3A7BD512', borderRadius: 12, alignItems: 'center' },
  introTitle:{ fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginBottom: 2 },
  introSub:  { fontSize: 12, color: '#374151', lineHeight: 17 },

  card:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  secretMonospace: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, color: '#0F2B4C', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8 },
  warnMonospace:   { fontSize: 11, color: '#92400E' },
  copyBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#16A34A' },
  copyBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  dismissBtn: { paddingVertical: 8, alignItems: 'center' },
  dismissBtnText:{ fontSize: 13, color: '#16A34A', fontWeight: '600' },

  input:     { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F2B4C' },
  modeRow:   { flexDirection: 'row', gap: 8 },
  modeChip:  { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  modeChipOn:{ borderColor: '#3A7BD5', backgroundColor: '#3A7BD5' },
  modeText:  { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  modeTextOn:{ color: '#fff' },
  row:       { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText:{ fontSize: 14, fontWeight: '600', color: '#6B7280' },
  primaryBtn:{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#0F2B4C', alignItems: 'center' },
  primaryBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#3A7BD5', borderStyle: 'dashed' },
  addBtnText:{ color: '#3A7BD5', fontSize: 14, fontWeight: '700' },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13, color: '#6B7280' },

  keyTop:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modePill:  { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  keyName:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  revokedText:{ fontSize: 10, fontWeight: '800', color: '#DC2626' },
  keyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8 },
  publicMonospace: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, color: '#0F2B4C' },
  metaText:  { fontSize: 11, color: '#9CA3AF' },
});
