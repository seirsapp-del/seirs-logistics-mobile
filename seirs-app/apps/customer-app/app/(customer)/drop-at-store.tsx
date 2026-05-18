import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, ArrowRight, Store, MapPin, Package, User, Check, Copy, Share2,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { dropoffApi } from '@/services/api';

// Spec V8 Â§3 â€” async customer entry point. Customer schedules a drop-off,
// gets a printable QR + 6-char backup code, walks into the picked store
// at their convenience. Partner staff scans â†’ driver picks up â†’ recipient
// collects (door delivery or store pickup).
//
// 4 steps + final receipt screen.
type Step = 'pickup' | 'destination' | 'package' | 'review' | 'done';

interface NearbyStore {
  id:           string;
  storeName:    string;
  storeAddress: string;
  currentLoad:  number;
  maxCapacity:  number;
  bucket:       'plenty' | 'limited' | 'full';
  full:         boolean;
}

const BUCKET_STYLE: Record<string, { color: string; label: string }> = {
  plenty:  { color: '#16A34A', label: 'Plenty of space' },
  limited: { color: '#D97706', label: 'Limited space'   },
  full:    { color: '#DC2626', label: 'Full'            },
};

export default function DropAtStoreScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [step,             setStep]           = useState<Step>('pickup');
  const [loading,          setLoading]        = useState(false);
  const [error,            setError]          = useState('');

  // Pickup store
  const [stores,           setStores]         = useState<NearbyStore[]>([]);
  const [pickupStore,      setPickupStore]    = useState<NearbyStore | null>(null);

  // Destination
  const [mode,             setMode]           = useState<'store_to_door' | 'store_to_store'>('store_to_door');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [dropoffStore,     setDropoffStore]   = useState<NearbyStore | null>(null);

  // Package + recipient
  const [recipientName,    setRecipientName]  = useState('');
  const [recipientPhone,   setRecipientPhone] = useState('');
  const [weightKg,         setWeightKg]       = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [declaredValue,    setDeclaredValue]  = useState('');

  // Final
  const [receipt,          setReceipt]        = useState<{ dropCode: string; backupCode: string; pickupStoreId: string } | null>(null);

  // Load nearby stores on mount, using device location if granted
  useEffect(() => {
    (async () => {
      setLoading(true);
      let lat: number | undefined; let lng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch { /* fall back to all-stores list */ }

      try {
        const list = await dropoffApi.listCapacityNearby(lat, lng, 15);
        setStores(list);
      } catch (e: any) {
        setError(e?.message ?? 'Could not load partner stores. Pull to refresh.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submitDropoff = async () => {
    if (!pickupStore) return;

    if (mode === 'store_to_door' && !recipientAddress.trim()) {
      setError('Recipient address required for door delivery.');
      return;
    }
    if (mode === 'store_to_store' && !dropoffStore) {
      setError('Pick a destination partner store.');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim() || !weightKg) {
      setError('Recipient name, phone, and weight are required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await dropoffApi.schedule({
        pickupStoreId:    pickupStore.id,
        mode,
        dropoffStoreId:   mode === 'store_to_store' ? dropoffStore?.id : undefined,
        recipientAddress: mode === 'store_to_door'   ? recipientAddress.trim() : undefined,
        recipientName:    recipientName.trim(),
        recipientPhone:   recipientPhone.trim(),
        weightKg:         Number(weightKg),
        packageDescription: packageDescription.trim() || undefined,
        declaredValueNgn: declaredValue ? Number(declaredValue) : 0,
      });
      setReceipt(res);
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Could not schedule drop-off.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', `Code ${code} copied to clipboard.`);
  };

  const shareCode = async () => {
    if (!receipt) return;
    try {
      await Share.share({
        message:
          `My SEIRS drop-off code is ${receipt.dropCode} (backup: ${receipt.backupCode}).\n` +
          `I'll be dropping a package at ${pickupStore?.storeName}.`,
      });
    } catch { /* user dismissed */ }
  };

  // â”€â”€ Renderers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <Pressable
        onPress={() => {
          if (step === 'pickup' || step === 'done') return router.back();
          if (step === 'destination') return setStep('pickup');
          if (step === 'package')     return setStep('destination');
          if (step === 'review')      return setStep('package');
        }}
        style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
      >
        <ArrowLeft size={20} color={theme.text} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Drop at Store</Text>
        {step !== 'done' && (
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            {step === 'pickup'      ? 'Step 1 of 4 â€” Pickup store' :
             step === 'destination' ? 'Step 2 of 4 â€” Where to?' :
             step === 'package'     ? 'Step 3 of 4 â€” Package details' :
                                      'Step 4 of 4 â€” Review'}
          </Text>
        )}
      </View>
      <View style={{ width: 36 }} />
    </View>
  );

  // â”€â”€ Receipt screen (success) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (step === 'done' && receipt) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.doneContent}>
          <View style={[styles.successBadge, { backgroundColor: '#16A34A18' }]}>
            <Check size={32} color="#16A34A" strokeWidth={2.5} />
          </View>
          <Text style={[styles.doneTitle, { color: theme.text }]}>Drop-off scheduled</Text>
          <Text style={[styles.doneSub, { color: theme.textSecond }]}>
            Take this code with you when you walk into{' '}
            <Text style={{ fontWeight: '700' }}>{pickupStore?.storeName}</Text>.
            Show it to the partner staff at the counter.
          </Text>

          {/* QR */}
          <View style={[styles.qrCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={styles.qrWrap}>
              <QRCode
                value={receipt.dropCode}
                size={180}
                color={theme.text as string}
                backgroundColor={theme.surface as string}
              />
            </View>
            <Text style={[styles.codeLabel, { color: theme.textSecond }]}>DROP-OFF CODE</Text>
            <Text style={[styles.codeBig,   { color: theme.primary }]}>{receipt.dropCode}</Text>

            <View style={styles.divider} />
            <Text style={[styles.codeLabel, { color: theme.textSecond }]}>BACKUP (READ ALOUD)</Text>
            <Text style={[styles.codeMed,   { color: theme.text }]}>{receipt.backupCode}</Text>
            <Text style={[styles.codeNote,  { color: theme.textThird }]}>
              If the QR scan fails, partner staff will type the 6-character backup instead.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable style={[styles.secondaryBtn, { borderColor: theme.border }]} onPress={() => copyCode(receipt.dropCode)}>
              <Copy size={16} color={theme.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Copy code</Text>
            </Pressable>
            <Pressable style={[styles.secondaryBtn, { borderColor: theme.border }]} onPress={shareCode}>
              <Share2 size={16} color={theme.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Share</Text>
            </Pressable>
          </View>

          <Pressable style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // â”€â”€ Step screens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {renderHeader()}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Step 1 â€” pickup store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {step === 'pickup' && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>NEAREST PARTNER STORES</Text>
              {loading && <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />}
              {!loading && stores.length === 0 && (
                <Text style={[styles.emptyText, { color: theme.textSecond }]}>No partner stores nearby. Try door-to-door delivery instead.</Text>
              )}
              {stores.map(s => {
                const bucket = BUCKET_STYLE[s.bucket];
                const selected = pickupStore?.id === s.id;
                const disabled = s.full;
                return (
                  <Pressable
                    key={s.id}
                    disabled={disabled}
                    onPress={() => setPickupStore(s)}
                    style={[
                      styles.storeCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: selected ? theme.primary : theme.border,
                        opacity: disabled ? 0.5 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.storeIcon, { backgroundColor: theme.primary + '15' }]}>
                      <Store size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.storeName, { color: theme.text }]}>{s.storeName}</Text>
                      <Text style={[styles.storeAddress, { color: theme.textSecond }]} numberOfLines={1}>{s.storeAddress}</Text>
                      <Text style={[styles.bucketText, { color: bucket.color }]}>â— {bucket.label}</Text>
                    </View>
                    {selected && <Check size={18} color={theme.primary} />}
                  </Pressable>
                );
              })}

              <Pressable
                disabled={!pickupStore}
                style={[styles.primaryBtn, { backgroundColor: pickupStore ? theme.primary : theme.surfaceSecond, marginTop: Spacing.lg }]}
                onPress={() => setStep('destination')}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <ArrowRight size={16} color="#fff" />
              </Pressable>
            </>
          )}

          {/* Step 2 â€” destination mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {step === 'destination' && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>WHERE SHOULD IT GO?</Text>

              <Pressable
                onPress={() => setMode('store_to_door')}
                style={[
                  styles.modeCard,
                  { backgroundColor: theme.surface, borderColor: mode === 'store_to_door' ? theme.primary : theme.border },
                ]}
              >
                <View style={[styles.modeIcon, { backgroundColor: theme.primary + '15' }]}>
                  <MapPin size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, { color: theme.text }]}>Door delivery</Text>
                  <Text style={[styles.modeSub,   { color: theme.textSecond }]}>
                    Driver delivers to recipient&apos;s address. Faster, full price.
                  </Text>
                </View>
                {mode === 'store_to_door' && <Check size={18} color={theme.primary} />}
              </Pressable>

              <Pressable
                onPress={() => setMode('store_to_store')}
                style={[
                  styles.modeCard,
                  { backgroundColor: theme.surface, borderColor: mode === 'store_to_store' ? theme.primary : theme.border },
                ]}
              >
                <View style={[styles.modeIcon, { backgroundColor: theme.primary + '15' }]}>
                  <Store size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, { color: theme.text }]}>Recipient collects from a store</Text>
                  <Text style={[styles.modeSub,   { color: theme.textSecond }]}>
                    Cheapest. Recipient picks up from a partner store within 24 hours.
                  </Text>
                </View>
                {mode === 'store_to_store' && <Check size={18} color={theme.primary} />}
              </Pressable>

              {mode === 'store_to_door' && (
                <View style={{ marginTop: Spacing.md }}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>Recipient address</Text>
                  <TextInput
                    value={recipientAddress}
                    onChangeText={setRecipientAddress}
                    placeholder="House number, street, area, city"
                    placeholderTextColor={theme.textThird}
                    multiline
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 60, textAlignVertical: 'top' }]}
                  />
                </View>
              )}

              {mode === 'store_to_store' && (
                <View style={{ marginTop: Spacing.md }}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>Destination partner store</Text>
                  {stores.filter(s => s.id !== pickupStore?.id).map(s => {
                    const bucket = BUCKET_STYLE[s.bucket];
                    const selected = dropoffStore?.id === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        disabled={s.full}
                        onPress={() => setDropoffStore(s)}
                        style={[
                          styles.storeCard,
                          {
                            backgroundColor: theme.surface,
                            borderColor: selected ? theme.primary : theme.border,
                            opacity: s.full ? 0.5 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.storeIcon, { backgroundColor: theme.primary + '15' }]}>
                          <Store size={20} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.storeName, { color: theme.text }]}>{s.storeName}</Text>
                          <Text style={[styles.storeAddress, { color: theme.textSecond }]} numberOfLines={1}>{s.storeAddress}</Text>
                          <Text style={[styles.bucketText, { color: bucket.color }]}>â— {bucket.label}</Text>
                        </View>
                        {selected && <Check size={18} color={theme.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Pressable
                disabled={mode === 'store_to_door' ? !recipientAddress.trim() : !dropoffStore}
                style={[styles.primaryBtn, {
                  backgroundColor: (mode === 'store_to_door' ? recipientAddress.trim() : dropoffStore) ? theme.primary : theme.surfaceSecond,
                  marginTop: Spacing.lg,
                }]}
                onPress={() => setStep('package')}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <ArrowRight size={16} color="#fff" />
              </Pressable>
            </>
          )}

          {/* Step 3 â€” package + recipient â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {step === 'package' && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>PACKAGE</Text>

              <Text style={[styles.fieldLabel, { color: theme.text }]}>Weight (kg)</Text>
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="0.5"
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: Spacing.md }]}>Description (optional)</Text>
              <TextInput
                value={packageDescription}
                onChangeText={setPackageDescription}
                placeholder="e.g. clothing, documents, small electronics"
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: Spacing.md }]}>Declared value â‚¦ (optional)</Text>
              <TextInput
                value={declaredValue}
                onChangeText={setDeclaredValue}
                keyboardType="number-pad"
                placeholder="If over â‚¦50,000, recipient must show ID"
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              />

              <Text style={[styles.sectionLabel, { color: theme.textSecond, marginTop: Spacing.lg }]}>RECIPIENT</Text>

              <Text style={[styles.fieldLabel, { color: theme.text }]}>Full name</Text>
              <TextInput
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="As recipient will type when collecting"
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              />

              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: Spacing.md }]}>Phone</Text>
              <TextInput
                value={recipientPhone}
                onChangeText={setRecipientPhone}
                keyboardType="phone-pad"
                placeholder="08012345678"
                placeholderTextColor={theme.textThird}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              />

              <Pressable
                disabled={!recipientName.trim() || !recipientPhone.trim() || !weightKg}
                style={[styles.primaryBtn, {
                  backgroundColor: (recipientName.trim() && recipientPhone.trim() && weightKg) ? theme.primary : theme.surfaceSecond,
                  marginTop: Spacing.lg,
                }]}
                onPress={() => setStep('review')}
              >
                <Text style={styles.primaryBtnText}>Review</Text>
                <ArrowRight size={16} color="#fff" />
              </Pressable>
            </>
          )}

          {/* Step 4 â€” review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {step === 'review' && pickupStore && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>REVIEW</Text>

              <View style={[styles.reviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.reviewRow}>
                  <View style={[styles.reviewIcon, { backgroundColor: theme.primary + '15' }]}>
                    <Store size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewLabel, { color: theme.textSecond }]}>DROP AT</Text>
                    <Text style={[styles.reviewValue, { color: theme.text }]}>{pickupStore.storeName}</Text>
                    <Text style={[styles.reviewSub, { color: theme.textSecond }]}>{pickupStore.storeAddress}</Text>
                  </View>
                </View>

                <View style={styles.reviewRow}>
                  <View style={[styles.reviewIcon, { backgroundColor: theme.primary + '15' }]}>
                    {mode === 'store_to_door'
                      ? <MapPin size={16} color={theme.primary} />
                      : <Store  size={16} color={theme.primary} />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewLabel, { color: theme.textSecond }]}>
                      {mode === 'store_to_door' ? 'DELIVER TO ADDRESS' : 'COLLECT FROM STORE'}
                    </Text>
                    <Text style={[styles.reviewValue, { color: theme.text }]}>
                      {mode === 'store_to_door' ? recipientAddress : dropoffStore?.storeName}
                    </Text>
                    {mode === 'store_to_store' && dropoffStore && (
                      <Text style={[styles.reviewSub, { color: theme.textSecond }]}>{dropoffStore.storeAddress}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.reviewRow}>
                  <View style={[styles.reviewIcon, { backgroundColor: theme.primary + '15' }]}>
                    <Package size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewLabel, { color: theme.textSecond }]}>PACKAGE</Text>
                    <Text style={[styles.reviewValue, { color: theme.text }]}>{weightKg} kg</Text>
                    {packageDescription ? (
                      <Text style={[styles.reviewSub, { color: theme.textSecond }]}>{packageDescription}</Text>
                    ) : null}
                    {declaredValue && Number(declaredValue) >= 50000 && (
                      <Text style={[styles.reviewWarn, { color: '#D97706' }]}>
                        High value â€” recipient ID required at handoff
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.reviewRow}>
                  <View style={[styles.reviewIcon, { backgroundColor: theme.primary + '15' }]}>
                    <User size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewLabel, { color: theme.textSecond }]}>RECIPIENT</Text>
                    <Text style={[styles.reviewValue, { color: theme.text }]}>{recipientName}</Text>
                    <Text style={[styles.reviewSub,   { color: theme.textSecond }]}>{recipientPhone}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: '#3A7BD518' }]}>
                <Text style={[styles.infoText, { color: theme.textSecond }]}>
                  Walk into {pickupStore.storeName} with your package. Show staff the QR code (or read the 6-char backup) and they&apos;ll receive it. A driver will be dispatched within the SLA window.
                </Text>
              </View>

              <Pressable
                disabled={loading}
                style={[styles.primaryBtn, { backgroundColor: theme.primary, marginTop: Spacing.lg }]}
                onPress={submitDropoff}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Schedule drop-off</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  headerSub:     { fontSize: FontSize.xs, marginTop: 2 },

  body:          { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  errorBox:      { padding: Spacing.sm, backgroundColor: '#FEE2E2', borderRadius: Radius.md, borderWidth: 1, borderColor: '#FECACA' },
  errorText:     { color: '#991B1B', fontSize: FontSize.sm },

  sectionLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.8, marginBottom: Spacing.xs },
  emptyText:     { fontSize: FontSize.sm, textAlign: 'center', marginVertical: Spacing.lg },

  storeCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginBottom: Spacing.xs },
  storeIcon:     { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  storeName:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  storeAddress:  { fontSize: FontSize.xs, marginTop: 2 },
  bucketText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginTop: 4 },

  modeCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginBottom: Spacing.xs },
  modeIcon:      { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  modeTitle:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginBottom: 2 },
  modeSub:       { fontSize: FontSize.xs, lineHeight: 17 },

  fieldLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.xs },
  input:         { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base },

  reviewCard:    { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  reviewRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  reviewIcon:    { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  reviewLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5, marginBottom: 2 },
  reviewValue:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  reviewSub:     { fontSize: FontSize.xs, marginTop: 2 },
  reviewWarn:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, marginTop: 4 },

  infoBox:       { padding: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.md },
  infoText:      { fontSize: FontSize.xs, lineHeight: 17 },

  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: 14, borderRadius: Radius.lg },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // Done screen
  doneContent:   { padding: Spacing.lg, gap: Spacing.md, alignItems: 'center', paddingBottom: Spacing.xxl },
  successBadge:  { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.lg },
  doneTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  doneSub:       { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 21, paddingHorizontal: Spacing.md },

  qrCard:        { borderRadius: Radius.xxl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: Spacing.xs, alignSelf: 'stretch', marginTop: Spacing.md },
  qrWrap:        { padding: Spacing.md, borderRadius: Radius.lg },
  codeLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.8, marginTop: Spacing.xs },
  codeBig:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, letterSpacing: 1 },
  codeMed:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: 4 },
  codeNote:      { fontSize: FontSize.xs, textAlign: 'center', marginTop: 4 },
  divider:       { height: 1, backgroundColor: '#E5E7EB', alignSelf: 'stretch', marginVertical: Spacing.sm },

  actionRow:     { flexDirection: 'row', gap: Spacing.sm, alignSelf: 'stretch' },
  secondaryBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1 },
  secondaryBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
