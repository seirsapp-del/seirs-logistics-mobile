import {
  View, Text, Pressable, StyleSheet, TextInput, StatusBar, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { deliveriesApi } from '@/services/api';

const TAG_KEYS = ['tagPunctual', 'tagProfessional', 'tagSafeDriver', 'tagCleanCar', 'tagGreatMusic', 'tagFriendly'];
const STAR_LABEL_KEYS = ['', 'starTerrible', 'starBad', 'starOkay', 'starGood', 'starExcellent'];

export default function RateDriverScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { t }    = useTranslation();
  const { driverId, tripId } = useLocalSearchParams<{ driverId: string; tripId?: string }>();

  const [driver, setDriver] = useState<{ name: string; vehicle: string; color: string; plate: string; profilePhoto?: string }>({
    name: 'Driver', vehicle: '', color: '', plate: '',
  });

  // If we know the trip, pull driver info from the real delivery payload
  // so we don't render a mock name like "John Driver".
  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const d = await deliveriesApi.get(tripId);
        if (d?.driver) {
          setDriver({
            name:         d.driver.user?.name ?? d.driver.name ?? 'Driver',
            profilePhoto: d.driver.user?.profilePhoto ?? d.driver.profilePhoto,
            vehicle:      d.driver.vehicleModel ?? '',
            color:        d.driver.vehicleColor ?? '',
            plate:        d.driver.vehicleNumber ?? d.driver.plate ?? '',
          });
        }
      } catch {}
    })();
  }, [tripId]);

  const [stars,    setStars]    = useState(0);
  const [hovered,  setHovered]  = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment,  setComment]  = useState('');
  const [tipping,  setTipping]  = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);

  const display = hovered || stars;

  const toggleTag = (tag: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!tripId) {
      Alert.alert(t('rateDriver.noTripLinked'), t('rateDriver.noTripLinkedMsg'));
      return;
    }
    if (!stars) {
      Alert.alert(t('rateDriver.pickRating'), t('rateDriver.pickRatingMsg'));
      return;
    }
    setLoading(true);
    try {
      const tagText = Array.from(selected).join(', ');
      const noteText = [tagText, comment.trim()].filter(Boolean).join(' — ');
      await deliveriesApi.rate(tripId, stars, noteText || undefined);
      router.replace('/(customer)/(tabs)' as any);
    } catch (e: any) {
      Alert.alert(t('rateDriver.couldNotSubmit'), e?.message ?? t('rateDriver.tryAgain'));
    } finally {
      setLoading(false);
    }
  };

  const TIP_OPTIONS = [100, 200, 500];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('rateDriver.title')}</Text>
          <Pressable onPress={() => router.replace('/(customer)/(tabs)' as any)}>
            <Text style={[styles.skipText, { color: theme.textSecond }]}>{t('rateDriver.skip')}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Driver */}
          <View style={[styles.driverCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Avatar name={driver.name} uri={driver.profilePhoto} size={72} />
            <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
            <Text style={[styles.driverSub, { color: theme.textSecond }]}>{[driver.color, driver.vehicle, driver.plate].filter(Boolean).join(' · ')}</Text>
          </View>

          {/* Stars */}
          <View style={styles.starSection}>
            <Text style={[styles.starPrompt, { color: theme.text }]}>{t('rateDriver.howWasRide')}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(s => (
                <Pressable
                  key={s}
                  onPress={() => setStars(s)}
                  onPressIn={() => setHovered(s)}
                  onPressOut={() => setHovered(0)}
                >
                  <Ionicons
                    name={s <= display ? 'star' : 'star-outline'}
                    size={44}
                    color={s <= display ? '#FFBE0B' : theme.border}
                  />
                </Pressable>
              ))}
            </View>
            {display > 0 && (
              <Text style={[styles.starLabel, { color: display >= 4 ? '#22C55E' : display === 3 ? '#FFBE0B' : '#EF4444' }]}>
                {t(`rateDriver.${STAR_LABEL_KEYS[display]}`)}
              </Text>
            )}
          </View>

          {/* Tags */}
          {stars >= 4 && (
            <View style={styles.tagsSection}>
              <Text style={[styles.tagsTitle, { color: theme.text }]}>{t('rateDriver.whatStoodOut')}</Text>
              <View style={styles.tags}>
                {TAG_KEYS.map(tagKey => {
                  const label = t(`rateDriver.${tagKey}`);
                  return (
                    <Pressable
                      key={tagKey}
                      style={[
                        styles.tag,
                        { borderColor: selected.has(label) ? theme.primary : theme.border },
                        selected.has(label) && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
                      ]}
                      onPress={() => toggleTag(label)}
                    >
                      {selected.has(label) && <Ionicons name="checkmark" size={12} color={theme.primary} />}
                      <Text style={[styles.tagText, { color: selected.has(label) ? theme.primary : theme.textSecond }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Comment */}
          <View style={styles.commentSection}>
            <Text style={[styles.commentLabel, { color: theme.text }]}>{t('rateDriver.leaveComment')}</Text>
            <View style={[styles.commentWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <TextInput
                style={[styles.commentInput, { color: theme.text }]}
                placeholder={t('rateDriver.commentPlaceholder')}
                placeholderTextColor={theme.textThird}
                multiline
                maxLength={300}
                value={comment}
                onChangeText={setComment}
              />
            </View>
          </View>

          {/* Tip */}
          <View style={styles.tipSection}>
            <Text style={[styles.tipTitle, { color: theme.text }]}>{t('rateDriver.addTip')}</Text>
            <View style={styles.tipOptions}>
              {TIP_OPTIONS.map(amount => (
                <Pressable
                  key={amount}
                  style={[
                    styles.tipBtn,
                    { borderColor: tipping === amount ? theme.primary : theme.border },
                    tipping === amount && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
                  ]}
                  onPress={() => setTipping(prev => prev === amount ? null : amount)}
                >
                  <Text style={[styles.tipBtnText, { color: tipping === amount ? theme.primary : theme.textSecond }]}>
                    ₦{amount}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

        </ScrollView>

        {/* CTA */}
        <View style={[styles.cta, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <Button
            label={tipping ? t('rateDriver.submitRatingWithTip', { amount: tipping }) : t('rateDriver.submitRating')}
            onPress={handleSubmit}
            loading={loading}
            disabled={stars === 0}
            size="lg"
            fullWidth
            leftIcon={<Ionicons name="star" size={18} color="#fff" />}
          />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  skipText:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  content: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xl },

  driverCard: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.xxl, borderWidth: 1 },
  driverName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverSub:  { fontSize: FontSize.sm },

  starSection: { alignItems: 'center', gap: Spacing.md },
  starPrompt:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  stars:       { flexDirection: 'row', gap: Spacing.sm },
  starLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  tagsSection: { gap: Spacing.sm },
  tagsTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  tags:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tag:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  tagText:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  commentSection: { gap: Spacing.sm },
  commentLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  commentWrap:    { borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 100 },
  commentInput:   { fontSize: FontSize.base, lineHeight: 22 },

  tipSection:  { gap: Spacing.sm },
  tipTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  tipOptions:  { flexDirection: 'row', gap: Spacing.sm },
  tipBtn:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.xl, borderWidth: 1.5 },
  tipBtnText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  cta: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});
