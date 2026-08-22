/**
 * Driver Messages tab. Thin wrapper around the shared MessagesInbox
 * component, ported from the business app (founder 2026-08-22: both the
 * customer and driver inboxes take the business design, it looks
 * better). Threads open at /(driver)/messages/[chatId]; support tickets
 * at /(driver)/support/[ticketId]. Hosts the hamburger Drawer so the
 * tab matches the rest of the app's chrome.
 */
import { useState } from 'react';
import { MessagesInbox } from '@/components/chat/MessagesInbox';
import { Drawer } from '@/components/Drawer';

export default function DriverMessagesScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <MessagesInbox
        threadRoutePrefix="/(driver)/messages"
        supportRoutePrefix="/(driver)/support"
        emptyBody="Customer chats appear here during active trips. You can also reach SEIRS support any time."
        onMenuPress={() => setDrawerOpen(true)}
      />
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
