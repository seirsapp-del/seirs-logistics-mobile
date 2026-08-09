/**
 * Partner Messages tab. Thin wrapper around the shared MessagesInbox
 * component. Threads open at /(partner)/messages/[chatId]. Hosts the
 * hamburger Drawer so the tab matches the rest of the app's chrome.
 *
 * Partners see the same threads as their business mode counterparts
 * because the SEIRS account model treats partner as a capability of a
 * business account (one email = one account = one SEIRS ID).
 */
import { useState } from 'react';
import { MessagesInbox } from '@/components/chat/MessagesInbox';
import { Drawer } from '@/components/Drawer';

export default function PartnerMessagesScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <MessagesInbox threadRoutePrefix="/(partner)/messages" onMenuPress={() => setDrawerOpen(true)} />
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
