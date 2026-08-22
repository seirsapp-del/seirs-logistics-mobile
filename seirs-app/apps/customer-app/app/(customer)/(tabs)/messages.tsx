/**
 * Customer Messages tab. Thin wrapper around the shared MessagesInbox
 * component, ported from the business app (founder 2026-08-22: both the
 * customer and driver inboxes take the business design, it looks
 * better). Threads open at /(customer)/messages/[chatId]; support
 * tickets at /(customer)/support/[ticketId]. Hosts the hamburger Drawer
 * so the tab matches the rest of the app's chrome.
 */
import { useState } from 'react';
import { MessagesInbox } from '@/components/chat/MessagesInbox';
import { Drawer } from '@/components/Drawer';

export default function CustomerMessagesScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <MessagesInbox
        threadRoutePrefix="/(customer)/messages"
        supportRoutePrefix="/(customer)/support"
        emptyBody="Driver chats appear here during active deliveries. You can also start a support conversation any time."
        onMenuPress={() => setDrawerOpen(true)}
      />
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
