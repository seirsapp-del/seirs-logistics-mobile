import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_DRIVER_MESSAGES } from '@/constants/driverMockData';

type Message = { id: string; text: string; from: 'me' | 'customer'; time: string };

export default function DriverChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router     = useRouter();
  const cs         = useColorScheme();
  const theme      = Colors[cs ?? 'light'];
  const isDark     = cs === 'dark';
  const listRef    = useRef<FlatList>(null);

  const chat = MOCK_DRIVER_MESSAGES.find(c => c.id === chatId);
  const [messages, setMessages] = useState<Message[]>(chat?.messages as Message[] ?? []);
  const [input, setInput]       = useState('');

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const now  = new Date();
    const time = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { id: `m${Date.now()}`, text, from: 'me', time }]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!chat) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecond }}>Chat not found</Text>
      </SafeAreaView>
    );
  }

  const QUICK_REPLIES = [
    'On my way!',
    'I\'ve arrived at pickup.',
    'Package delivered.',
    'Please be ready outside.',
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.navBackground }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Avatar name={chat.customer.name} size={36} />
          <View>
            <Text style={[styles.headerName, { color: theme.text }]}>{chat.customer.name}</Text>
            <Text style={[styles.headerSub, { color: theme.textSecond }]}>Trip #{chat.tripId}</Text>
          </View>
        </View>
        <Pressable
          style={[styles.callBtn, { backgroundColor: '#22C55E18' }]}
          onPress={() => router.push({ pathname: '/(driver)/call', params: { name: chat.customer.name } })}
        >
          <Ionicons name="call-outline" size={20} color="#22C55E" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.from === 'me';
            return (
              <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
                {!isMe && <Avatar name={chat.customer.name} size={28} />}
                <View style={[
                  styles.bubble,
                  isMe
                    ? [styles.bubbleMe, { backgroundColor: theme.primary }]
                    : [styles.bubbleThem, { backgroundColor: theme.surface, borderColor: theme.border }],
                ]}>
                  <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.65)' : theme.textThird }]}>{item.time}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Quick replies */}
        <FlatList
          horizontal
          data={QUICK_REPLIES}
          keyExtractor={q => q}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickList}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.quickChip, { borderColor: theme.primary + '60', backgroundColor: theme.primary + '10' }]}
              onPress={() => { setInput(item); }}
            >
              <Text style={[styles.quickText, { color: theme.primary }]}>{item}</Text>
            </Pressable>
          )}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Type a message…"
              placeholderTextColor={theme.textThird}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={send}
            />
          </View>
          <Pressable
            style={[styles.sendBtn, { backgroundColor: input.trim() ? theme.primary : theme.surfaceSecond }]}
            onPress={send}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={18} color={input.trim() ? '#fff' : theme.textThird} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.sm },
  headerName:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub:    { fontSize: FontSize.xs },
  callBtn:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  messageList:  { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.sm },

  bubbleWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, maxWidth: '85%' },
  bubbleWrapMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubbleWrapThem:{ alignSelf: 'flex-start' },

  bubble:       { padding: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.xl, gap: 3 },
  bubbleMe:     { borderBottomRightRadius: 4 },
  bubbleThem:   { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText:   { fontSize: FontSize.base, lineHeight: 22 },
  bubbleTime:   { fontSize: 10, alignSelf: 'flex-end' },

  quickList:    { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  quickChip:    { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  quickText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  inputBar:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  inputWrap:  { flex: 1, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:      { fontSize: FontSize.base, maxHeight: 100 },
  sendBtn:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
