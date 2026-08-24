import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, Linking, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { sosApi, apiRequest } from '@/services/api';

/**
 * One row of the emergency directory. Admin-managed and served from
 * GET /config/emergency-contacts so the numbers can be corrected without
 * shipping an app release: a wrong number on this screen is the most
 * dangerous string in the product.
 */
type EmergencyContact = {
  id:          string;
  name:        string;
  numbers:     string[];
  instruction: string;
  category?:   string;
  sortOrder?:  number;
};

/**
 * Offline fallback ONLY. Rendered under an explicit "offline list" banner
 * when the directory fetch fails, so the user always has something to dial.
 * Both numbers are correct for Nigeria: 112 is the national emergency line
 * and 199 is the fire service. Do not grow this list, grow the admin one.
 */
const FALLBACK_CONTACT_IDS = ['fallback-112', 'fallback-199'] as const;

// Category to icon. Unknown categories fall back to a plain phone glyph
// rather than guessing, because the icon must not imply the wrong service.
const CATEGORY_ICON: Record<string, string> = {
  emergency: 'alert-circle-outline',
  national:  'alert-circle-outline',
  police:    'shield-outline',
  fire:      'flame-outline',
  medical:   'medkit-outline',
  ambulance: 'medkit-outline',
  road:      'car-outline',
  traffic:   'car-outline',
  women:     'people-outline',
  child:     'people-outline',
};

export default function SOSScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  // Optional ?deliveryId= param when SOS is opened from a live trip screen:
  // lets the backend notify the assigned driver too.
  const params  = useLocalSearchParams<{ deliveryId?: string }>();

  const [activated, setActivated] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [alertId,   setAlertId]   = useState<string | null>(null);

  // Emergency directory. `contacts` null means "still loading"; `offline`
  // true means the fetch failed and the two bundled national lines are
  // what the user is looking at.
  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);
  const [offline,  setOffline]  = useState(false);

  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  // Built here (not at module scope) so a language switch re-renders them.
  const fallbackContacts: EmergencyContact[] = [
    {
      id:          FALLBACK_CONTACT_IDS[0],
      name:        t('sos.fallback112Name'),
      numbers:     ['112'],
      instruction: t('sos.fallback112Use'),
      category:    'national',
    },
    {
      id:          FALLBACK_CONTACT_IDS[1],
      name:        t('sos.fallback199Name'),
      numbers:     ['199'],
      instruction: t('sos.fallback199Use'),
      category:    'fire',
    },
  ];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.4, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse1, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(pulse2, { toValue: 1.7, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse2, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    loop.start();
    loop2.start();
    return () => { loop.stop(); loop2.stop(); };
  }, []);

  // Load the directory once on mount, independent of the SOS state: the
  // founder's intent is that the user dials help directly WHILE SEIRS also
  // responds, so the list must already be on screen when SOS fires.
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items?: EmergencyContact[] }>('GET', '/config/emergency-contacts')
      .then((res) => {
        if (cancelled) return;
        const items = (res?.items ?? [])
          .filter(c => c && Array.isArray(c.numbers) && c.numbers.length > 0)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (items.length === 0) { setOffline(true); setContacts(fallbackContacts); return; }
        setOffline(false);
        setContacts(items);
      })
      .catch(() => {
        if (cancelled) return;
        setOffline(true);
        setContacts(fallbackContacts);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activated) return;
    if (countdown === 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [activated, countdown]);

  const dial = (number: string) => {
    // Was an Alert reading "Calling Police (199)..." that placed no call.
    // In an emergency that is the worst possible lie (sweep 2026-08-23).
    const clean = number.replace(/[^0-9+*#]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() =>
      Alert.alert(t('sos.callDialog'), number));
  };

  const fireSOS = async () => {
    setActivated(true);
    setCountdown(5);

    // Try to attach a GPS fix: non-blocking. The alert still posts
    // without coordinates if permission is denied / no fix yet.
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch { /* keep undefined */ }

    try {
      const created = await sosApi.trigger({
        deliveryId: params.deliveryId,
        lat, lng,
      });
      setAlertId(created.id);
    } catch (e: any) {
      // Surface the failure but stay in activated state: user can retry.
      Alert.alert(t('sos.cannotReach'),
        e?.message ?? t('sos.cannotReachMsg'));
    }
  };

  const handleSOS = () => {
    Alert.alert(
      t('sos.confirmSendTitle'),
      t('sos.confirmSendMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('sos.sendBtn'), style: 'destructive', onPress: fireSOS },
      ]
    );
  };

  const cancelSOS = async () => {
    if (alertId) {
      // Best-effort: UI already resets even if the cancel API call fails.
      sosApi.cancel(alertId).catch(() => {});
    }
    setActivated(false);
    setCountdown(5);
    setAlertId(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0A0000' : '#7F1D1D' }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('sos.headerTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* The whole screen scrolls, including while an SOS is active: the
            directory below has to stay reachable during the emergency. */}
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* SOS button */}
          <View style={styles.sosWrap}>
            <Animated.View style={[styles.ring2, { transform: [{ scale: pulse2 }] }]} />
            <Animated.View style={[styles.ring1, { transform: [{ scale: pulse1 }] }]} />
            <Pressable style={styles.sosBtn} onPress={handleSOS} disabled={activated}>
              <Ionicons name="warning" size={44} color="#fff" />
              <Text style={styles.sosBtnText}>SOS</Text>
              {activated && countdown > 0 && (
                <Text style={styles.sosCountdown}>{countdown}</Text>
              )}
            </Pressable>
          </View>

          {activated ? (
            <View style={styles.activeState}>
              {/* The alert posts the instant the button is confirmed, so the
                  countdown is an undo window, not a delay. The old copy said
                  "Activating in 5s" and implied nothing had been sent yet. */}
              <Text style={styles.activeTitle}>
                {countdown > 0 ? t('sos.activatingIn', { seconds: countdown }) : t('sos.activated')}
              </Text>
              <Text style={styles.activeDesc}>
                {countdown > 0 ? t('sos.sharingNow') : t('sos.activatedMsg')}
              </Text>
              {countdown > 0 && (
                <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
                  <Text style={styles.cancelBtnText}>{t('sos.cancelSos')}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.idleState}>
              <Text style={styles.idleTitle}>{t('sos.idleTitle')}</Text>
              <Text style={styles.idleDesc}>
                {t('sos.idleDesc')}
              </Text>
            </View>
          )}

          {/* Emergency directory */}
          <View style={styles.directorySection}>
            <Text style={styles.directoryTitle}>{t('sos.directoryTitle')}</Text>
            <Text style={styles.directorySub}>{t('sos.directorySub')}</Text>

            {contacts === null ? (
              <View style={styles.directoryLoading}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.directoryLoadingText}>{t('sos.directoryLoading')}</Text>
              </View>
            ) : (
              <>
                {offline && (
                  <View style={styles.offlineBanner}>
                    <Ionicons name="cloud-offline-outline" size={16} color="#FFE4E4" />
                    <Text style={styles.offlineBannerText}>{t('sos.directoryOffline')}</Text>
                  </View>
                )}

                {contacts.map(c => (
                  <View key={c.id} style={styles.contactRow}>
                    <View style={styles.contactIcon}>
                      <Ionicons
                        name={(CATEGORY_ICON[(c.category ?? '').toLowerCase()] ?? 'call-outline') as any}
                        size={20}
                        color="#FFE4E4"
                      />
                    </View>
                    <View style={styles.contactBody}>
                      <Text style={styles.contactName}>{c.name}</Text>
                      {!!c.instruction && (
                        <Text style={styles.contactInstruction} numberOfLines={2}>{c.instruction}</Text>
                      )}
                      <View style={styles.numberRow}>
                        {c.numbers.map(n => (
                          <Pressable
                            key={n}
                            onPress={() => dial(n)}
                            hitSlop={6}
                            style={styles.numberChip}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('sos.callDialog')} ${c.name} ${n}`}
                          >
                            <Ionicons name="call" size={13} color="#7F1D1D" />
                            <Text style={styles.numberChipText}>{n}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>

          {/* Share trip */}
          <Pressable
            style={styles.shareBtn}
            onPress={() => router.push({ pathname: '/(customer)/share-trip', params: { id: params.deliveryId } })}
          >
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>{t('sos.shareLocationBtn')}</Text>
          </Pressable>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  body: { flexGrow: 1, alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl },

  sosWrap: { alignItems: 'center', justifyContent: 'center', width: 220, height: 220 },
  ring2:   { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(239,68,68,0.08)' },
  ring1:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(239,68,68,0.15)' },
  sosBtn:  { width: 140, height: 140, borderRadius: 70, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', gap: 4,
             shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 16 },
  sosBtnText:  { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: 2 },
  sosCountdown:{ color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm },

  activeState:  { alignItems: 'center', gap: Spacing.sm },
  activeTitle:  { color: '#FFE4E4', fontSize: FontSize.lg, fontWeight: FontWeight.bold, textAlign: 'center' },
  activeDesc:   { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  cancelBtn:    { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: Spacing.sm },
  cancelBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  idleState:  { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  idleTitle:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, textAlign: 'center' },
  idleDesc:   { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  directorySection: { width: '100%', gap: Spacing.sm },
  directoryTitle:   { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  directorySub:     { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, lineHeight: 17, marginTop: -4 },

  directoryLoading:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  directoryLoadingText: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },

  offlineBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.sm, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.10)' },
  offlineBannerText: { flex: 1, color: '#FFE4E4', fontSize: FontSize.xs, lineHeight: 17 },

  contactRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.08)' },
  contactIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(239,68,68,0.20)', justifyContent: 'center', alignItems: 'center' },
  contactBody: { flex: 1, gap: 4 },
  contactName: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  // The "when to use this" line is the whole point of the directory: a
  // number without a reason gets dialled wrong under stress.
  contactInstruction: { color: 'rgba(255,255,255,0.70)', fontSize: FontSize.xs, lineHeight: 17 },
  numberRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  numberChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#FFE4E4' },
  numberChipText: { color: '#7F1D1D', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  shareBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: 14, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
  shareBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
