'use client';
/**
 * Retired: Ticketing was a second front door onto the same
 * support_tickets table that Support Inbox already serves.
 *
 * Founder, 2026-08-16: "why do we have ticketing and support inbox and
 * user suggestion". Two UIs over one dataset meant an agent could answer
 * from one screen and another agent would not see it in their view of
 * choice, and it doubled the places every future support change had to
 * land. Support Inbox is the survivor: it filters by status, topic and
 * account type and shows the real message thread. The one thing only
 * Ticketing could do, assigning a ticket, moved there first.
 *
 * The route stays and redirects so existing links and bookmarks still
 * arrive somewhere useful instead of a 404.
 *
 * User Suggestions is NOT part of this: it is product feedback with
 * votes, not a support conversation, and stays its own page.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/support'); }, [router]);

  return (
    <div className="p-8 text-sm text-[#0F2B4C]/60">
      Ticketing now lives in Support Inbox. Taking you there…
    </div>
  );
}
