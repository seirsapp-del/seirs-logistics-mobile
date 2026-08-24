import type { Metadata } from 'next';
import { TrackingView } from './TrackingView';

/**
 * Server shell for the public tracking page.
 *
 * The whole route used to be 'use client', so it could export no metadata at
 * all and every tracked delivery inherited the generic site title. Tracking
 * is the highest-intent search term a logistics site gets and the page most
 * receivers ever see, usually arriving from a forwarded WhatsApp link where
 * the title is the preview. The view itself still has to be a client
 * component: it polls, so this is a shell around it.
 */

interface Props { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = decodeURIComponent(code ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return {
    title: clean ? `Track ${clean}` : 'Track your delivery',
    description:
      'Live status and timeline for a SEIRS delivery. No account, no app, no sign-in.',
    // A tracking code is effectively a shared secret: anyone holding it can
    // see the route. Indexing them would put real deliveries in search
    // results, so this route stays out of the index while /track does not.
    robots: { index: false, follow: false },
  };
}

export default function PublicTrackingPage() {
  return <TrackingView />;
}
