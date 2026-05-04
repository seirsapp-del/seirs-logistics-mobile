import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Check, AlertTriangle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { uploadApi } from '@/services/api';

// Spec V8 §2.16 — anti-theft trunk inventory check. Whenever a passenger
// or recipient exits the vehicle while there are still other packages
// in the trunk (multi-cargo pool ride), the driver MUST take a quick
// photo confirming everything else is still present. Photo URL is
// attached to the delivery record so disputes can reference it.
//
// Triggered from the active delivery screen mid-trip when:
//   - one of multiple legs completes (passenger drop or package drop)
//   - the remaining legs include any package
export default function TrunkCheckScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const params = useLocalSearchParams<{ deliveryId?: string; remaining?: string }>();
  const remaining = Number(params.remaining ?? '0');

  const [photoUri, setPhotoUri] = useState('');
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera access required'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
  };

  const submit = async () => {
    if (!photoUri) { Alert.alert('Photo required', 'Take a quick trunk photo to confirm remaining packages.'); return; }
    setUploading(true);
    try {
      const uploaded = await uploadApi.uploadFile(photoUri, 'trunk-check');
      // Server-side: backend will accept this URL via deliveriesApi
      // updateStatus when the trip-progress wiring lands. For now the
      // photo is uploaded to R2 and the URL would be persisted next.
      Alert.alert(
        'Trunk verified',
        'Photo uploaded. You can continue with the next leg.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
      console.log('trunk check photo:', uploaded.url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Trunk Check</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.warnBanner}>
          <AlertTriangle size={20} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>Confirm remaining packages</Text>
            <Text style={styles.warnSub}>
              {remaining > 0
                ? `${remaining} other package${remaining === 1 ? ' is' : 's are'} still in your trunk. Take a photo confirming everything is intact before continuing.`
                : 'Take a quick photo of the trunk so the chain of custody is documented.'}
            </Text>
          </View>
        </View>

        {photoUri ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            <Pressable onPress={pickPhoto} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Camera size={14} color={theme.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Retake</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickPhoto} style={[styles.photoBox, { borderColor: theme.primary }]}>
            <Camera size={36} color={theme.primary} />
            <Text style={[styles.photoTitle, { color: theme.text }]}>Tap to capture trunk</Text>
            <Text style={[styles.photoHint, { color: theme.textSecond }]}>
              Frame the inside of the trunk so all remaining packages are visible.
            </Text>
          </Pressable>
        )}

        <Pressable
          disabled={!photoUri || uploading}
          onPress={submit}
          style={[styles.primaryBtn, { backgroundColor: photoUri ? theme.primary : theme.surfaceSecond }]}
        >
          {uploading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Check size={16} color={photoUri ? '#fff' : theme.textThird} />
                <Text style={[styles.primaryBtnText, { color: photoUri ? '#fff' : theme.textThird }]}>
                  Confirm and continue
                </Text>
              </>
          }
        </Pressable>

        <Text style={[styles.footnote, { color: theme.textThird }]}>
          If anything is missing, do NOT continue. Pull over safely and contact support before driving further. Photos here become evidence in any dispute.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  warnBanner:{ flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'flex-start', backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  warnTitle: { color: '#92400E', fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 4 },
  warnSub:   { color: '#92400E', fontSize: FontSize.sm, lineHeight: 19 },

  card:    { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8 },
  preview: { width: '100%', height: 240, borderRadius: 12, backgroundColor: '#E5E7EB' },

  photoBox:  { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 56, alignItems: 'center', gap: 10 },
  photoTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  photoHint: { fontSize: FontSize.xs, textAlign: 'center', paddingHorizontal: 24 },

  secondaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  secondaryBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: Spacing.md },
  primaryBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },

  footnote: { fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
});
