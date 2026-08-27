/**
 * Driver ↔ Customer chat screen.
 *
 * Mirrors customer-app's chat with driver-side quick replies + system
 * messages + read receipts + image messages (Chat 1 + 2 + 3 + 8 batch).
 * Same backend socket room, same message DTO, same rendering rules.
 *
 * For drivers, the attach flow is especially useful for parcel-condition
 * photos and delivery proof shared informally in the thread (the formal
 * proof-of-delivery photo remains a separate step on the delivery card).
 */
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@seirs/shared/hooks/useChat';
import { chatApi, uploadApi } from '@/services/api';
import { SOCKET_URL } from '@/constants/config';
import { alertDialog } from '@/components/SeirsDialog';

// Driver-side canned messages. Different from customer's, these are
// what a driver on an okada/keke actually needs to say on the road,
// tuned to Nigerian traffic + drop-off flow. i18n keys chat.quickReplies.driver.*
const QUICK_REPLIES = [
  { key: 'onMyWay',    fallback: 'On my way' },
  { key: 'traffic',    fallback: 'In traffic, running late' },
  { key: 'fiveMin',    fallback: '5 min out' },
  { key: 'arrived',    fallback: "I've arrived" },
  { key: 'delivered',  fallback: 'Package delivered' },
];

export default function DriverChatScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ chatId: string; other?: string }>();
  const { user } = useAuth();
  const { t }   = useTranslation();

  const deliveryId = params.chatId ?? null;
  // Real other-party name comes from the inbox via the `other` param
  // (production-readiness audit 2026-08-10: this used to fall back to a
  // mock conversation whose fake customer name showed in the header).
  const customer = { name: params.other?.trim() || 'Customer' };

  const { messages, loading, sending, send } = useChat(deliveryId, { socketUrl: SOCKET_URL });

  const [input,     setInput]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!deliveryId) return;
    chatApi.markRead(deliveryId).catch(() => {});
  }, [deliveryId, messages.length]);

  const handleSend = async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setInput('');
    try {
      await send(trimmed);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setInput(trimmed);
    }
  };

  const sendImageFromUri = async (uri: string) => {
    if (!deliveryId || uploading || sending) return;
    setUploading(true);
    try {
      const mimeType = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const { url }  = await uploadApi.file(uri, mimeType, 'chat');
      await send('', url);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      alertDialog(
        t('chat.attach.errorTitle', { defaultValue: 'Could not send photo' }),
        e?.message ?? String(e),
      );
    } finally {
      setUploading(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alertDialog(
        t('chat.attach.permTitle', { defaultValue: 'Camera permission needed' }),
        t('chat.attach.permBody',  { defaultValue: 'Enable camera access in your phone settings to take a photo.' }),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await sendImageFromUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alertDialog(
        t('chat.attach.permTitle', { defaultValue: 'Photo permission needed' }),
        t('chat.attach.permBody',  { defaultValue: 'Enable photo access in your phone settings to attach a picture.' }),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await sendImageFromUri(result.assets[0].uri);
    }
  };

  const handleAttach = () => {
    if (uploading || sending) return;
    // At Android's three-button ceiling. Translations are preserved: the
    // sheet takes the same t() strings the dialog did (2026-08-25 dialog
    // sweep).
    setSheet({
      title:   t('chat.attach.title',    { defaultValue: 'Attach photo' }),
      message: t('chat.attach.subtitle', { defaultValue: 'Choose where to attach from.' }),
      options: [
        { label: t('chat.attach.camera',  { defaultValue: 'Take photo' }),   variant: 'primary', icon: 'camera-outline', onPress: pickFromCamera },
        { label: t('chat.attach.gallery', { defaultValue: 'From gallery' }), icon: 'images-outline', onPress: pickFromGallery },
      ],
      cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    });
  };

  const myUserId = user?.id ?? '';
  const sortedMessages = useMemo(() => messages, [messages]);
  const busy = sending || uploading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }, Shadows.xs]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Avatar name={customer.name} size={36} />
          <View>
            {/* D-1.12: a hardcoded green "Online" used to sit here. No presence
                data is fetched anywhere, so it was green for a person who had
                not opened the app in a week. Removed until presence is real. */}
            <Text style={[styles.headerName, { color: theme.text }]}>{customer.name}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading && messages.length === 0 ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={sortedMessages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={48} color={theme.textThird} />
                <Text style={[styles.emptyText, { color: theme.textSecond }]}>
                  {t('chat.emptyDriver', { defaultValue: 'No messages yet.' })}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              if (!item.senderId && (item as any).systemType) {
                const label = t(
                  `chat.system.${(item as any).systemType}`,
                  { defaultValue: item.body },
                );
                return (
                  <View style={styles.systemWrap}>
                    <View style={[styles.systemPill, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9', borderColor: theme.border }]}>
                      <Ionicons name="information-circle-outline" size={12} color={theme.textSecond} />
                      <Text style={[styles.systemText, { color: theme.textSecond }]}>{label}</Text>
                    </View>
                  </View>
                );
              }

              const isMe     = item.senderId === myUserId;
              const next     = sortedMessages[index + 1];
              const showTime = !next || next.senderId !== item.senderId || (!!(next as any).systemType);
              const time     = new Date(item.createdAt).toLocaleTimeString(undefined, {
                hour: '2-digit', minute: '2-digit',
              });
              const imageUrl = (item as any).imageUrl as string | null | undefined;
              const hasImage = !!imageUrl;
              const hasText  = !!(item.body && item.body.trim());
              return (
                <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                  {!isMe && <Avatar name={customer.name} size={28} />}
                  <View style={styles.bubbleColumn}>
                    {hasImage && (
                      <Pressable
                        onPress={() => setViewerUrl(imageUrl!)}
                        style={[
                          styles.imageBubble,
                          isMe ? styles.imageBubbleMe : styles.imageBubbleCustomer,
                          { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9', borderColor: theme.border },
                        ]}
                      >
                        <Image
                          source={{ uri: imageUrl! }}
                          style={styles.imageThumb}
                          resizeMode="cover"
                        />
                      </Pressable>
                    )}
                    {hasText && (
                      <View style={[
                        styles.bubble,
                        isMe
                          ? [styles.bubbleMe,       { backgroundColor: theme.primary }]
                          : [styles.bubbleCustomer, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                        hasImage && { marginTop: 4 },
                      ]}>
                        <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
                          {item.body}
                        </Text>
                      </View>
                    )}
                    {showTime && (
                      <View style={[styles.metaRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                        <Text style={[styles.bubbleTime, { color: theme.textThird }]}>{time}</Text>
                        {isMe && (
                          item.readAt
                            ? <Ionicons name="checkmark-done" size={12} color={theme.primary} />
                            : <Ionicons name="checkmark"      size={12} color={theme.textThird} />
                        )}
                      </View>
                    )}
                  </View>
                  {isMe && <View style={{ width: 28 }} />}
                </View>
              );
            }}
          />
        )}

        {/* Driver-side quick replies (road-safe) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickReplyStrip}
          contentContainerStyle={styles.quickReplyRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((qr) => (
            <Pressable
              key={qr.key}
              onPress={() => handleSend(t(`chat.quickReplies.driver.${qr.key}`, { defaultValue: qr.fallback }))}
              disabled={busy}
              style={[styles.quickReplyChip, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy ? 0.5 : 1 }]}
            >
              <Text style={[styles.quickReplyText, { color: theme.text }]}>
                {t(`chat.quickReplies.driver.${qr.key}`, { defaultValue: qr.fallback })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Pressable
            onPress={handleAttach}
            disabled={busy}
            style={[styles.attachBtn, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, opacity: busy ? 0.5 : 1 }]}
          >
            {uploading
              ? <ActivityIndicator color={theme.primary} size="small" />
              : <Ionicons name="attach" size={20} color={theme.text} />}
          </Pressable>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder={t('chat.inputPlaceholder', { defaultValue: 'Type a message…' })}
              placeholderTextColor={theme.textThird}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend(input)}
              editable={!busy}
            />
          </View>
          <Pressable
            style={[styles.sendBtn, { backgroundColor: input.trim() && !busy ? theme.primary : theme.border }]}
            onPress={() => handleSend(input)}
            disabled={!input.trim() || busy}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerUrl(null)}>
          {viewerUrl && (
            <Image
              source={{ uri: viewerUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
          <Pressable style={styles.viewerClose} onPress={() => setViewerUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerName:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub:    { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  msgList: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText:   { fontSize: FontSize.sm, textAlign: 'center' },

  bubbleWrap:     { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginBottom: Spacing.xs },
  bubbleWrapMe:   { flexDirection: 'row-reverse' },
  bubbleColumn:   { flex: 1, gap: 3 },
  bubble:         { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  bubbleMe:       { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  bubbleCustomer: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  bubbleText:     { fontSize: FontSize.base, lineHeight: 20 },
  metaRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bubbleTime:     { fontSize: 10 },

  imageBubble:         { maxWidth: 220, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1 },
  imageBubbleMe:       { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  imageBubbleCustomer: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  imageThumb:          { width: 220, height: 220 },

  systemWrap:  { alignItems: 'center', marginVertical: 4 },
  systemPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  systemText:  { fontSize: 11, fontWeight: FontWeight.medium },

  // alignItems 'center' is load-bearing: a horizontal ScrollView's
  // content container defaults to 'stretch', which grew every chip to
  // the full height of the strip and turned the 999 radius into a giant
  // oval (founder 2026-08-24).
  quickReplyRow:  { paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 8, alignItems: 'center' },
  // flexGrow 0 stops the strip itself swallowing the space the message
  // list leaves over.
  quickReplyStrip:{ flexGrow: 0, flexShrink: 0 },
  quickReplyChip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, borderWidth: 1 },
  quickReplyText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  attachBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  inputWrap: { flex: 1, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:     { fontSize: FontSize.base, lineHeight: 20 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerImage:    { width: '100%', height: '100%' },
  viewerClose:    { position: 'absolute', top: 48, right: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});
