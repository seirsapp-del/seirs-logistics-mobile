/**
 * Business Messages tab. Thin wrapper around the shared MessagesInbox
 * component. Threads open at /(business)/messages/[chatId]. Hosts the
 * hamburger Drawer so the tab matches the rest of the app's chrome.
 */
import { useState } from 'react';
import { MessagesInbox } from '@/components/chat/MessagesInbox';
import { Drawer } from '@/components/Drawer';

export default function BusinessMessagesScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <MessagesInbox threadRoutePrefix="/(business)/messages" onMenuPress={() => setDrawerOpen(true)} />
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
