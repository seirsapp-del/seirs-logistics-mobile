/**
 * Driver-side support ticket thread (Chat 5). Same shape as customer's
 * thread. 15s poll while open, paperclip attach for screenshots.
 */
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supportApi, uploadApi, type SupportThreadDTO } from '@/services/api';

export default function DriverSupportThreadScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ ticketId: string }>();
  const ticketId = params.ticketId ?? '';

  const [thread,    setThread]    = useState<SupportThreadDTO | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try { setThread(await supportApi.thread(ticketId)); }
    catch { setThread(null); }
  }, [ticketId]);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);
  useEffect(() => {
    if (!thread || thread.ticket.status === 'closed') return;
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [thread, load]);

  const sendText = async () => {
    const body = input.trim();
    if (!body || sending || !ticketId) return;
    setInput('');
    setSending(true);
    try {
      await supportApi.reply(ticketId, body);
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Could not send', e?.message ?? String(e));
      setInput(body);
    } finally { setSending(false); }
  };

  const sendImage = async (uri: string) => {
    if (!ticketId || uploading || sending) return;
    setUploading(true);
    try {
      const mimeType = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const { url } = await uploadApi.file(uri, mimeType, 'chat');
      await supportApi.reply(ticketId, `📎 ${url}`);
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Could not upload photo', e?.message ?? String(e));
    } finally { setUploading(false); }
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!r.canceled && r.assets?.[0]?.uri) await sendImage(r.assets[0].uri);
  };
  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photo permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!r.canceled && r.assets?.[0]?.uri) await sendImage(r.assets[0].uri);
  };
  const attach = () => {
    if (uploading || sending) return;
    Alert.alert('Attach photo', 'Choose where to attach from.', [
      { text: 'Take photo',   onPress: pickCamera  },
      { text: 'From gallery', onPress: pickGallery },
      { text: 'Cancel',       style: 'cancel'      },
    ]);
  };

  const myUserId = user?.id ?? '';
  const busy = sending || uploading;
  const isClosed = thread?.ticket.status === 'closed';
  const parseAttached = (body: string): string | null => {
    const m = body.match(/^📎 (https?:\/\/\S+)$/);
    return m ? m[1] : null;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.subject, { color: theme.text }]} numberOfLines={1}>{thread?.ticket.subject ?? 'Support'}</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>SEIRS Support · {thread?.ticket.status ?? '…'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {loading && !thread ? (
          <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={thread?.messages ?? []}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<View style={styles.emptyWrap}><Text style={{ color: theme.textThird, fontSize: FontSize.sm }}>{t('support.threadEmpty', { defaultValue: 'This thread is empty.' })}</Text></View>}
            renderItem={({ item }) => {
              if (!item.senderId && (item as any).systemType) {
                return (
                  <View style={styles.systemWrap}>
                    <View style={[styles.systemPill, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9', borderColor: theme.border }]}>
                      <Ionicons name="information-circle-outline" size={12} color={theme.textSecond} />
                      <Text style={[styles.systemText, { color: theme.textSecond }]}>{item.body}</Text>
                    </View>
                  </View>
                );
              }
              // The API returns the sender as an OBJECT and has no senderId
              // field, so this compared undefined to the user id and every
              // message rendered as the agent's: a thread where nobody could
              // tell who said what (founder 2026-08-17). senderId is kept as
              // a fallback for any older payload.
              const isMe = ((item as any).sender?.id ?? (item as any).senderId) === myUserId;
              const attachedUrl = parseAttached(item.body);
              const hasImage = !!attachedUrl;
              return (
                <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                  {hasImage ? (
                    <Pressable
                      onPress={() => setViewerUrl(attachedUrl!)}
                      style={[styles.imageBubble, { borderColor: theme.border, backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}
                    >
                      <Image source={{ uri: attachedUrl! }} style={styles.imageThumb} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <View style={[
                      styles.bubble,
                      isMe
                        ? [styles.bubbleMe,    { backgroundColor: theme.primary }]
                        : [styles.bubbleAgent, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                    ]}>
                      <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>{item.body}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {isClosed ? (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border, justifyContent: 'center' }]}>
            <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>
              {t('support.closedNote', { defaultValue: 'This ticket is closed. Open a new one if you still need help.' })}
            </Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Pressable onPress={attach} disabled={busy}
              style={[styles.attachBtn, { backgroundColor: theme.surfaceSecond, borderColor: theme.border, opacity: busy ? 0.5 : 1 }]}
            >
              {uploading ? <ActivityIndicator color={theme.primary} size="small" /> : <Ionicons name="attach" size={20} color={theme.text} />}
            </Pressable>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={t('chat.inputPlaceholder', { defaultValue: 'Type a message…' })}
                placeholderTextColor={theme.textThird}
                value={input}
                onChangeText={setInput}
                multiline maxLength={500} editable={!busy}
              />
            </View>
            <Pressable
              style={[styles.sendBtn, { backgroundColor: input.trim() && !busy ? theme.primary : theme.border }]}
              onPress={sendText} disabled={!input.trim() || busy}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerUrl(null)}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />}
          <Pressable style={styles.viewerClose} onPress={() => setViewerUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  subject:     { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub:   { fontSize: 11, marginTop: 2 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  msgList:     { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  emptyWrap:   { flex: 1, alignItems: 'center', paddingTop: 60 },
  bubbleWrap:   { flexDirection: 'row', marginBottom: Spacing.xs },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubble:       { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  bubbleMe:     { borderBottomRightRadius: 4 },
  bubbleAgent:  { borderBottomLeftRadius: 4 },
  bubbleText:   { fontSize: FontSize.base, lineHeight: 20 },
  imageBubble:  { maxWidth: 220, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1 },
  imageThumb:   { width: 220, height: 220 },
  systemWrap:   { alignItems: 'center', marginVertical: 4 },
  systemPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  systemText:   { fontSize: 11, fontWeight: FontWeight.medium },
  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  attachBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  inputWrap: { flex: 1, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:     { fontSize: FontSize.base, lineHeight: 20 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerImage:    { width: '100%', height: '100%' },
  viewerClose:    { position: 'absolute', top: 48, right: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});
