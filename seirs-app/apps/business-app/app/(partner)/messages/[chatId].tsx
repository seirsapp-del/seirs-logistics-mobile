/**
 * Partner chat thread. Thin wrapper around the shared ChatThread.
 */
import { useLocalSearchParams } from 'expo-router';
import { ChatThread } from '@/components/chat/ChatThread';

export default function PartnerChatThreadScreen() {
  const params = useLocalSearchParams<{ chatId: string; other?: string }>();
  return (
    <ChatThread
      deliveryId={params.chatId ?? ''}
      otherPartyName={params.other}
    />
  );
}
