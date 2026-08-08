/**
 * Customer ↔ Driver chat screen.
 *
 * Real-time chat scoped to one delivery. Includes three features shipped
 * as part of the pre-launch chat batch:
 *   1. Quick-reply chips ("I'm at the gate", etc.) so users don't type
 *      while their driver is on the road.
 *   2. System messages (driver assigned, picked up, delivered) auto-
 *      inserted by the backend and rendered as centered status pills.
 *   3. Read receipts: single check when delivered, double check when read.
 *
 * The `chatId` URL param is the *delivery id*. Every conversation is
 * scoped to a delivery. There is no separate thread entity.
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@seirs/shared/hooks/useChat';
import { chatApi } from '@/services/api';
import { SOCKET_URL } from '@/constants/config';

// Customer-side canned messages. Kept short so they fit on chips + are
// actionable. Translated via i18n keys chat.quickReplies.customer.*
const QUICK_REPLIES = [
  { key: 'atGate',       fallback: "I'm at the gate" },
  { key: 'ringDoorbell', fallback: 'Ring the doorbell' },
  { key: 'leaveGuard',   fallback: 'Leave with security' },
  { key: 'callWhenNear', fallback: 'Call when you arrive' },
  { key: 'thanks',       fallback: 'Thanks!' },
];

export default function ChatScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ chatId: string; driverName?: string }>();
  const { user } = useAuth();
  const { t }   = useTranslation();

  const deliveryId = params.chatId ?? null;
  const driverName = params.driverName || 'Driver';

  const { messages, loading, sending, send } = useChat(deliveryId, { socketUrl: SOCKET_URL });

  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  // Flip read receipts on focus. `useChat.list()` also does this as a
  // side effect but explicit mark-read handles the case where user
  // switches away + back without a re-fetch.
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

  const myUserId = user?.id ?? '';
  const sortedMessages = useMemo(() => messages, [messages]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }, Shadows.xs]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Avatar name={driverName} size={36} />
          <View>
            <Text style={[styles.headerName, { color: theme.text }]}>{driverName}</Text>
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
                <Ionicons name="chatbubbles-outline" size={48} color={theme.textThird} />
                <Text style={[styles.emptyText, { color: theme.textSecond }]}>
                  {t('chat.empty', { defaultValue: 'No messages yet. Say hi to your driver.' })}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              // System messages (backend-inserted status events) render as
              // centered pills with a translated label. senderId is null.
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
              return (
                <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                  {!isMe && <Avatar name={driverName} size={28} />}
                  <View style={styles.bubbleColumn}>
                    <View style={[
                      styles.bubble,
                      isMe
                        ? [styles.bubbleMe,     { backgroundColor: theme.primary }]
                        : [styles.bubbleDriver, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                    ]}>
                      <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
                        {item.body}
                      </Text>
                    </View>
                    {showTime && (
                      <View style={[styles.metaRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                        <Text style={[styles.bubbleTime, { color: theme.textThird }]}>{time}</Text>
                        {/* Read receipt on my own messages only. Single check
                            = delivered to backend. Double check = the other
                            party has opened the chat since. */}
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

        {/* Quick-reply chips: horizontal scroll so more can fit + users
            never have to type while on the move. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickReplyRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((qr) => (
            <Pressable
              key={qr.key}
              onPress={() => handleSend(t(`chat.quickReplies.customer.${qr.key}`, { defaultValue: qr.fallback }))}
              disabled={sending}
              style={[styles.quickReplyChip, { backgroundColor: theme.surface, borderColor: theme.border, opacity: sending ? 0.5 : 1 }]}
            >
              <Text style={[styles.quickReplyText, { color: theme.text }]}>
                {t(`chat.quickReplies.customer.${qr.key}`, { defaultValue: qr.fallback })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
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
              editable={!sending}
            />
          </View>
          <Pressable
            style={[styles.sendBtn, { backgroundColor: input.trim() && !sending ? theme.primary : theme.border }]}
            onPress={() => handleSend(input)}
            disabled={!input.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backBtn:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerName:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub:    { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  msgList: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText:   { fontSize: FontSize.sm, textAlign: 'center' },

  bubbleWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginBottom: Spacing.xs },
  bubbleWrapMe: { flexDirection: 'row-reverse' },
  bubbleColumn: { flex: 1, gap: 3 },
  bubble:       { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  bubbleMe:     { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  bubbleDriver: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  bubbleText:   { fontSize: FontSize.base, lineHeight: 20 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bubbleTime:   { fontSize: 10 },

  systemWrap:  { alignItems: 'center', marginVertical: 4 },
  systemPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  systemText:  { fontSize: 11, fontWeight: FontWeight.medium },

  quickReplyRow:  { paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 8 },
  quickReplyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  quickReplyText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  inputBar:  {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1,
  },
  inputWrap: { flex: 1, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:     { fontSize: FontSize.base, lineHeight: 20 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
