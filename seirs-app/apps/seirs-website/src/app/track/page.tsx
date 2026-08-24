import type { Metadata } from 'next';
import { TrackSearch } from './TrackSearch';

/**
 * Server shell for /track. The form itself is a client component (it routes
 * on submit), so metadata has to live out here. Tracking is the highest
 * intent search term a logistics site gets, and this page carried the
 * generic site title until 2026-08-23.
 */
export const metadata: Metadata = {
  title: 'Track a delivery',
  description:
    'Enter your SEIRS tracking code to see live status and the full timeline. No account, no app, no sign-in.',
  openGraph: {
    title: 'Track a delivery | SEIRS',
    description:
      'Enter your SEIRS tracking code to see live status and the full timeline.',
  },
};

export default function TrackIndexPage() {
  return <TrackSearch />;
}
