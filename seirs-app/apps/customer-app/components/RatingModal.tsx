import {
  Modal, View, Text, Pressable, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';

interface Props {
  visible:     boolean;
  deliveryId:  string;
  trackingCode:string;
  driverName:  string;
  onDone:      () => void;
}

export function RatingModal({ visible, deliveryId, trackingCode, driverName, onDone }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [rating,   setRating]   = useState(0);
  const [comment,  setComment]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [submitted,setSubmitted]= useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setLoading(true);
    try {
      await deliveriesApi.rate(deliveryId, rating, comment.trim() || undefined);
      setSubmitted(true);
    } catch { /* silently ignore — don't block user */ }
    finally { setLoading(false); }
  };

  const handleClose = () => {
    setRating(0);
    setComment('');
    setSubmitted(false);
    onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }, Shadows.lg]}>
          {submitted ? (
            <View style={styles.thankYou}>
              <Text style={styles.thankIcon}>🙏</Text>
              <Text style={[styles.thankTitle, { color: theme.text }]}>Thank you!</Text>
              <Text style={[styles.thankDesc, { color: theme.textSecond }]}>
                Your feedback helps us improve Seirs.
              </Text>
              <Pressable style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: theme.text }]}>Rate your delivery</Text>
              <Text style={[styles.subtitle, { color: theme.textSecond }]}>
                {trackingCode} · {driverName}
              </Text>

              {/* Stars */}
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Pressable key={star} onPress={() => setRating(star)} hitSlop={6}>
                    <Text style={[styles.star, { opacity: star <= rating ? 1 : 0.25 }]}>⭐</Text>
                  </Pressable>
                ))}
              </View>
              {rating > 0 && (
                <Text style={[styles.ratingLabel, { color: theme.textSecond }]}>
                  {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}
                </Text>
              )}

              {/* Comment */}
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Any comments? (optional)"
                placeholderTextColor={theme.textSecond}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={3}
                maxLength={250}
              />

              <View style={styles.actions}>
                <Pressable style={[styles.skipBtn, { borderColor: theme.border }]} onPress={handleClose}>
                  <Text style={[styles.skipText, { color: theme.textSecond }]}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[styles.submitBtn, { backgroundColor: theme.primary }, (rating === 0 || loading) && { opacity: 0.5 }]}
                  onPress={handleSubmit}
                  disabled={rating === 0 || loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitText}>Submit Rating</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 40 },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center', marginBottom: Spacing.xs },
  subtitle:    { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.xl },
  stars:       { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  star:        { fontSize: 40 },
  ratingLabel: { textAlign: 'center', fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing.lg },
  input:       { borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.base, minHeight: 80, textAlignVertical: 'top', marginBottom: Spacing.lg },
  actions:     { flexDirection: 'row', gap: Spacing.sm },
  skipBtn:     { flex: 1, height: 52, borderWidth: 1.5, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  skipText:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  submitBtn:   { flex: 2, height: 52, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  submitText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  thankYou:    { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  thankIcon:   { fontSize: 56 },
  thankTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  thankDesc:   { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
  doneBtn:     { height: 52, paddingHorizontal: 32, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.md },
  doneBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
