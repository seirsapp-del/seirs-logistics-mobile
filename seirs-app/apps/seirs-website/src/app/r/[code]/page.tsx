import type { Metadata } from 'next';
import { ReferralLanding } from './ReferralLanding';

/**
 * /r/[code]: the landing page every shared referral link points at.
 *
 * The customer app has built `https://seirs.co/r/<code>` since referrals
 * shipped (customer-app referral.tsx WEB_REFERRAL_BASE) and this route did
 * not exist, so every link a user shared landed on the 404 page. The
 * referral engine itself is fully wired; this page was the only missing
 * piece.
 *
 * The code is the sharer's accountId, e.g. CUST-A7K2P9, so the only
 * characters that can ever be valid are A-Z, 0-9 and the hyphen. Anything
 * else is a mangled paste (a trailing bracket from a chat app, a stray
 * space) and is treated as "no code" rather than shown back to the reader
 * as if it were real.
 */

// Referral URLs carry a person's account id. They should never be indexed,
// and there is nothing here for a crawler anyway.
export const metadata: Metadata = {
  title: 'Join SEIRS',
  description: 'Someone invited you to SEIRS. Get the app and start sending.',
  robots: { index: false, follow: false },
};

// Codes are not enumerable, so this route is rendered on demand.
export const dynamic = 'force-dynamic';

const CODE_SHAPE = /^[A-Z0-9-]{4,24}$/;

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cleaned = decodeURIComponent(code ?? '').trim().toUpperCase();
  const valid = CODE_SHAPE.test(cleaned) ? cleaned : null;

  return <ReferralLanding code={valid} />;
}
