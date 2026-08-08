/**
 * Driver ↔ Customer chat screen.
 *
 * Mirrors customer-app's chat with driver-side quick replies + system
 * messages + read receipts (Chat 1 + 2 + 8 batch). Same backend socket
 * room, same message DTO, same rendering rules.
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
import { MOCK_DRIVER_MESSAGES } from '@/constants/driverMockData';
import { useChat } from '@seirs/shared/hooks/useChat';
import { chatApi } from '@/services/api';
import { SOCKET_URL } from '@/constants/config';

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
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ chatId: string }>();
  const { user } = useAuth();
  const { t }   = useTranslation();

  const deliveryId = params.chatId ?? null;
  const conversation = MOCK_DRIVER_MESSAGES.find(m => m.id === params.chatId) ?? MOCK_DRIVER_MESSAGES[0];
  const customer = conversation.customer;

  const { messages, loading, sending, send } = useChat(deliveryId, { socketUrl: SOCKET_URL });

  const [input, setInput] = useState('');
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

  const myUserId = user?.id ?? '';
  const sortedMessages = useMemo(() => messages, [messages]);

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
            <Text style={[styles.headerName, { color: theme.text }]}>{customer.name}</Text>
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
              return (
                <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                  {!isMe && <Avatar name={customer.name} size={28} />}
                  <View style={styles.bubbleColumn}>
                    <View style={[
                      styles.bubble,
                      isMe
                        ? [styles.bubbleMe,       { backgroundColor: theme.primary }]
                        : [styles.bubbleCustomer, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                    ]}>
                      <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
                        {item.body}
                      </Text>
                    </View>
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
          contentContainerStyle={styles.quickReplyRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((qr) => (
            <Pressable
              key={qr.key}
              onPress={() => handleSend(t(`chat.quickReplies.driver.${qr.key}`, { defaultValue: qr.fallback }))}
              disabled={sending}
              style={[styles.quickReplyChip, { backgroundColor: theme.surface, borderColor: theme.border, opacity: sending ? 0.5 : 1 }]}
            >
              <Text style={[styles.quickReplyText, { color: theme.text }]}>
                {t(`chat.quickReplies.driver.${qr.key}`, { defaultValue: qr.fallback })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

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

  systemWrap:  { alignItems: 'center', marginVertical: 4 },
  systemPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  systemText:  { fontSize: 11, fontWeight: FontWeight.medium },

  quickReplyRow:  { paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 8 },
  quickReplyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  quickReplyText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  inputWrap: { flex: 1, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:     { fontSize: FontSize.base, lineHeight: 20 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
