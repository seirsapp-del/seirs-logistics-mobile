/**
 * Business chat thread. Thin wrapper around the shared ChatThread
 * component. Pushed onto the (business) Stack from the Messages tab.
 */
import { useLocalSearchParams } from 'expo-router';
import { ChatThread } from '@/components/chat/ChatThread';

export default function BusinessChatThreadScreen() {
  const params = useLocalSearchParams<{ chatId: string; other?: string }>();
  return (
    <ChatThread
      deliveryId={params.chatId ?? ''}
      otherPartyName={params.other}
    />
  );
}
