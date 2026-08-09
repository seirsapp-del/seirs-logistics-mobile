/**
 * Business Messages tab. Thin wrapper around the shared MessagesInbox
 * component. Threads open at /(business)/messages/[chatId].
 */
import { MessagesInbox } from '@/components/chat/MessagesInbox';

export default function BusinessMessagesScreen() {
  return <MessagesInbox threadRoutePrefix="/(business)/messages" />;
}
