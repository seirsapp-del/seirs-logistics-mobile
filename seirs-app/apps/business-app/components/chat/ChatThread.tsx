/**
 * Shared business/partner chat thread component.
 *
 * Used by both (business)/messages/[chatId].tsx and (partner)/messages/[chatId].tsx
 * because a business account and a partner mode share the same account
 * and therefore the same threads. The only visual concession to the
 * desk/warehouse context (vs the on-road driver context) is a slightly
 * more restrained set of quick-reply chips.
 *
 * Feature parity with customer + driver chat:
 *   - Chat 1: quick-reply chips (warehouse-tuned)
 *   - Chat 2: system messages rendered as centered pills
 *   - Chat 3: image messages (paperclip -> camera or gallery -> upload)
 *   - Chat 8: read receipts (single check vs double check)
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, ScrollView, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@seirs/shared/hooks/useChat';
import { chatApi, uploadApi } from '@/services/api';
import { SOCKET_URL } from '@/constants/config';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
// Business/partner canned messages. Warehouse and counter context.
const QUICK_REPLIES = () => [
  { key: 'ready',         fallback: tx('auto.chatthread.packageIsReadyForPickup', 'Package is ready for pickup') },
  { key: 'atCounter',     fallback: tx('auto.chatthread.comeToTheFrontCounter', 'Come to the front counter') },
  { key: 'fiveMin',       fallback: tx('auto.chatthread.giveUs5Minutes', 'Give us 5 minutes') },
  { key: 'callOffice',    fallback: tx('auto.chatthread.pleaseCallOurOffice', 'Please call our office') },
  { key: 'thanks',        fallback: 'Thanks' },
];

interface ChatThreadProps {
  deliveryId: string;
  otherPartyName?: string;
}

export function ChatThread({ deliveryId, otherPartyName }: ChatThreadProps) {
  const router      = useRouter();
  const { isDark }  = useTheme();
  const theme       = Colors[isDark ? 'dark' : 'light'];
  const { user }    = useAuth() as any;
  const { t }       = useTranslation();

  const displayName = otherPartyName || 'Driver';

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
    alertDialog(
      t('chat.attach.title',    { defaultValue: 'Attach photo' }),
      t('chat.attach.subtitle', { defaultValue: 'Choose where to attach from.' }),
      [
        { text: t('chat.attach.camera',  { defaultValue: 'Take photo' }),   onPress: pickFromCamera },
        { text: t('chat.attach.gallery', { defaultValue: 'From gallery' }), onPress: pickFromGallery },
        { text: t('common.cancel',       { defaultValue: 'Cancel' }),       style: 'cancel' },
      ],
    );
  };

  const myUserId = user?.id ?? '';
  const sortedMessages = useMemo(() => messages, [messages]);
  const busy = sending || uploading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View>
            <Text style={[styles.headerName, { color: theme.text }]}>{displayName}</Text>
            <Text style={[styles.headerSub, { color: '#22C55E' }]}>{t('chat.online', { defaultValue: 'Online' })}</Text>
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
                <Icon name="MessageSquare" size={48} color={theme.textSecond} />
                <Text style={[styles.emptyText, { color: theme.textSecond }]}>
                  {t('chat.empty', { defaultValue: 'No messages yet.' })}
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
                      <Icon name="Info" size={12} color={theme.textSecond} />
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
                  <View style={styles.bubbleColumn}>
                    {hasImage && (
                      <Pressable
                        onPress={() => setViewerUrl(imageUrl!)}
                        style={[
                          styles.imageBubble,
                          isMe ? styles.imageBubbleMe : styles.imageBubbleOther,
                          { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9', borderColor: theme.border },
                        ]}
                      >
                        <Image source={{ uri: imageUrl! }} style={styles.imageThumb} resizeMode="cover" />
                      </Pressable>
                    )}
                    {hasText && (
                      <View style={[
                        styles.bubble,
                        isMe
                          ? [styles.bubbleMe,    { backgroundColor: theme.primary }]
                          : [styles.bubbleOther, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                        hasImage && { marginTop: 4 },
                      ]}>
                        <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
                          {item.body}
                        </Text>
                      </View>
                    )}
                    {showTime && (
                      <View style={[styles.metaRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                        <Text style={[styles.bubbleTime, { color: theme.textSecond }]}>{time}</Text>
                        {isMe && (
                          item.readAt
                            ? <Icon name="CheckCheck" size={12} color={theme.primary} />
                            : <Icon name="Check"      size={12} color={theme.textSecond} />
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickReplyStrip}
          contentContainerStyle={styles.quickReplyRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES().map((qr) => (
            <Pressable
              key={qr.key}
              onPress={() => handleSend(t(`chat.quickReplies.business.${qr.key}`, { defaultValue: qr.fallback }))}
              disabled={busy}
              style={[styles.quickReplyChip, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy ? 0.5 : 1 }]}
            >
              <Text style={[styles.quickReplyText, { color: theme.text }]}>
                {t(`chat.quickReplies.business.${qr.key}`, { defaultValue: qr.fallback })}
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
              : <Icon name="Paperclip" size={18} color={theme.text} />}
          </Pressable>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder={t('chat.inputPlaceholder', { defaultValue: 'Type a message…' })}
              placeholderTextColor={theme.textSecond}
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
              : <Icon name="Send" size={16} color="#fff" />}
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
            <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <Pressable style={styles.viewerClose} onPress={() => setViewerUrl(null)}>
            <Icon name="X" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1 },
  headerName:   { fontSize: 15, fontWeight: '700' },
  headerSub:    { fontSize: 11, fontWeight: '500' },

  msgList: { padding: 16, gap: 8, flexGrow: 1 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:   { fontSize: 13, textAlign: 'center' },

  bubbleWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  bubbleWrapMe: { flexDirection: 'row-reverse' },
  bubbleColumn: { flex: 1, gap: 3 },
  bubble:       { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe:     { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  bubbleOther:  { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  bubbleText:   { fontSize: 14, lineHeight: 20 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bubbleTime:   { fontSize: 10 },

  imageBubble:      { maxWidth: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  imageBubbleMe:    { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  imageBubbleOther: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  imageThumb:       { width: 220, height: 220 },

  systemWrap:  { alignItems: 'center', marginVertical: 4 },
  systemPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  systemText:  { fontSize: 11, fontWeight: '500' },

  // alignItems 'center' is load-bearing: a horizontal ScrollView's
  // content container defaults to 'stretch', which grew every chip to
  // the full height of the strip and turned the 999 radius into a giant
  // oval (founder 2026-08-24).
  quickReplyRow:  { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  // flexGrow 0 stops the strip itself swallowing the space the message
  // list leaves over.
  quickReplyStrip:{ flexGrow: 0, flexShrink: 0 },
  quickReplyChip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, borderWidth: 1 },
  quickReplyText: { fontSize: 14, fontWeight: '600' },

  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  attachBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  inputWrap: { flex: 1, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 120 },
  input:     { fontSize: 14, lineHeight: 20 },
  sendBtn:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerImage:    { width: '100%', height: '100%' },
  viewerClose:    { position: 'absolute', top: 48, right: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});
