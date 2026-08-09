/**
 * Partner Messages tab. Thin wrapper around the shared MessagesInbox
 * component. Threads open at /(partner)/messages/[chatId].
 *
 * Partners see the same threads as their business mode counterparts
 * because the SEIRS account model treats partner as a capability of a
 * business account (one email = one account = one SEIRS ID).
 */
import { MessagesInbox } from '@/components/chat/MessagesInbox';

export default function PartnerMessagesScreen() {
  return <MessagesInbox threadRoutePrefix="/(partner)/messages" />;
}
