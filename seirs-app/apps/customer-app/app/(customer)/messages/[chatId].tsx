import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_MESSAGES } from '@/constants/mockData';

export default function ChatScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ chatId: string }>();

  const conversation = MOCK_MESSAGES.find(m => m.id === params.chatId) ?? MOCK_MESSAGES[0];
  const driver       = conversation.driver;

  const [messages, setMessages] = useState(conversation.messages);
  const [input,    setInput]    = useState('');
  const listRef = useRef<FlatList>(null);

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages(prev => [
      ...prev,
      { id: `m${Date.now()}`, text: input.trim(), from: 'me', time: new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) },
    ]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }, Shadows.xs]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Avatar name={driver.name} size={36} />
          <View>
            <Text style={[styles.headerName, { color: theme.text }]}>{driver.name}</Text>
            <Text style={[styles.headerSub, { color: '#22C55E' }]}>Online</Text>
          </View>
        </View>
        <Pressable
          style={[styles.callBtn, { backgroundColor: isDark ? '#001020' : '#DBEAFE' }]}
          onPress={() => router.push({ pathname: '/(customer)/call', params: { driverId: driver.id } })}
        >
          <Ionicons name="call-outline" size={18} color={theme.primary} />
        </Pressable>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const isMe      = item.from === 'me';
            const showTime  = index === messages.length - 1 ||
                              messages[index + 1]?.from !== item.from;
            return (
              <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                {!isMe && <Avatar name={driver.name} size={28} />}
                <View style={styles.bubbleColumn}>
                  <View style={[
                    styles.bubble,
                    isMe
                      ? [styles.bubbleMe, { backgroundColor: theme.primary }]
                      : [styles.bubbleDriver, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }],
                  ]}>
                    <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
                      {item.text}
                    </Text>
                  </View>
                  {showTime && (
                    <Text style={[styles.bubbleTime, { color: theme.textThird, alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
                      {item.time}
                    </Text>
                  )}
                </View>
                {isMe && <View style={{ width: 28 }} />}
              </View>
            );
          }}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
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
              onSubmitEditing={sendMessage}
            />
          </View>
          <Pressable
            style={[styles.sendBtn, { backgroundColor: input.trim() ? theme.primary : theme.border }]}
            onPress={sendMessage}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={18} color="#fff" />
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
  callBtn:      { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  msgList: { padding: Spacing.md, gap: Spacing.sm },

  bubbleWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginBottom: Spacing.xs },
  bubbleWrapMe: { flexDirection: 'row-reverse' },
  bubbleColumn: { flex: 1, gap: 3 },
  bubble:       { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  bubbleMe:     { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  bubbleDriver: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  bubbleText:   { fontSize: FontSize.base, lineHeight: 20 },
  bubbleTime:   { fontSize: 10 },

  inputBar:  {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1,
  },
  inputWrap: { flex: 1, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxHeight: 120 },
  input:     { fontSize: FontSize.base, lineHeight: 20 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
